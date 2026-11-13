import Foundation
import RouteVNExporterFFI

struct AndroidApkExportError: LocalizedError {
    let code: String
    let message: String

    var errorDescription: String? { message }
}

/// The C callback can arrive concurrently. Keep throttling and enqueueing under
/// the same lock so phase changes reach the main queue in callback order.
final class AndroidApkExportProgress {
    private let exportId: String
    private let deliver: (String) -> Void
    private let startedAt = ProcessInfo.processInfo.systemUptime
    private let lock = NSLock()
    private var lastPhase: String?
    private var lastSentAt: TimeInterval = 0

    init(exportId: String, deliver: @escaping (String) -> Void) {
        self.exportId = exportId
        self.deliver = deliver
    }

    func report(phase: String, current: UInt64, total: UInt64) {
        lock.lock()
        defer { lock.unlock() }
        let now = ProcessInfo.processInfo.systemUptime
        guard phase != lastPhase || now - lastSentAt >= 0.1 else { return }
        let event: [String: Any] = [
            "exportId": exportId,
            "phase": phase,
            "current": current,
            "total": total,
            "elapsedMs": UInt64(max(0, now - startedAt) * 1000)
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: event),
              let json = String(data: data, encoding: .utf8) else { return }
        lastPhase = phase
        lastSentAt = now
        let deliver = self.deliver
        DispatchQueue.main.async { deliver(json) }
    }
}

private let androidApkExportProgressCallback: routevn_progress_callback = { context, phase, current, total in
    guard let context, let phase else { return }
    let progress = Unmanaged<AndroidApkExportProgress>.fromOpaque(context).takeUnretainedValue()
    // The phase pointer is valid only for the duration of this callback.
    progress.report(phase: String(cString: phase), current: current, total: total)
}

enum AndroidApkExport {
    private static func templates() -> (apk: URL, descriptor: URL)? {
        guard let resources = Bundle.main.resourceURL else { return nil }
        let directory = resources.appendingPathComponent("web/player-templates/android", isDirectory: true)
        let apk = directory.appendingPathComponent("RouteVNPlayerTemplate.apk")
        let descriptor = directory.appendingPathComponent("RouteVNPlayerTemplate.json")
        guard FileManager.default.fileExists(atPath: apk.path),
              FileManager.default.fileExists(atPath: descriptor.path) else { return nil }
        return (apk, descriptor)
    }

    static func availability() throws -> [String: Any] {
        guard let templates = templates() else { return ["available": false] }
        let response = templates.apk.path.withCString { apk in
            templates.descriptor.path.withCString { descriptor in
                routevn_android_export_capabilities(apk, descriptor)
            }
        }
        return try decodeResponse(response)
    }

    /// Runs on the bridge's background queue. Rust reads the bundled template
    /// in place and writes only within this export's private cache directory.
    static func export(
        request: [String: Any],
        to destination: URL,
        progress: AndroidApkExportProgress
    ) throws -> [String: Any] {
        guard let templates = templates() else {
            throw AndroidApkExportError(code: "template-missing", message: "The Android player template is missing.")
        }
        let fileManager = FileManager.default
        let caches = try fileManager.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = caches.appendingPathComponent("routevn-apk-\(UUID().uuidString)", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: directory) }
        let output = directory.appendingPathComponent("output.apk")
        let work = directory.appendingPathComponent("work", isDirectory: true)
        try fileManager.createDirectory(at: work, withIntermediateDirectories: true)
        var nativeRequest = request
        nativeRequest["templatePath"] = templates.apk.path
        nativeRequest["descriptorPath"] = templates.descriptor.path
        nativeRequest["outputPath"] = output.path
        nativeRequest["workDir"] = work.path
        // The APK is copied to the chosen location after the export, so the
        // exporter's free-space check leaves room for that copy.
        nativeRequest["copyAfterExport"] = true
        let data = try JSONSerialization.data(withJSONObject: nativeRequest)
        let json = String(decoding: data, as: UTF8.self)
        let response = withExtendedLifetime(progress) {
            json.withCString { requestJSON in
                routevn_android_export_apk(
                    requestJSON,
                    androidApkExportProgressCallback,
                    Unmanaged.passUnretained(progress).toOpaque()
                )
            }
        }
        let decoded = try decodeResponse(response)
        guard decoded["ok"] as? Bool == true else {
            let error = decoded["error"] as? [String: Any] ?? [:]
            throw AndroidApkExportError(
                code: error["code"] as? String ?? "write-failed",
                message: error["message"] as? String ?? "The Android APK export failed."
            )
        }
        guard var result = decoded["result"] as? [String: Any],
              let apkBytes = result["apkBytes"] as? NSNumber, apkBytes.uint64Value > 0 else {
            throw AndroidApkExportError(code: "write-failed", message: "The Android exporter returned an invalid result.")
        }
        try verifySize(output, expected: apkBytes.uint64Value)
        try copyOutput(output, to: destination, expected: apkBytes.uint64Value)
        result.removeValue(forKey: "outputPath")
        result["uri"] = destination.absoluteString
        return result
    }

    private static func decodeResponse(_ response: UnsafeMutablePointer<CChar>?) throws -> [String: Any] {
        guard let response else {
            throw AndroidApkExportError(code: "write-failed", message: "The Android exporter returned no result.")
        }
        defer { routevn_string_free(response) }
        let data = Data(String(cString: response).utf8)
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw AndroidApkExportError(code: "write-failed", message: "The Android exporter returned an invalid result.")
        }
        return object
    }

    private static func verifySize(_ url: URL, expected: UInt64) throws {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard let size = attributes[.size] as? NSNumber, size.uint64Value == expected else {
            throw AndroidApkExportError(code: "write-failed", message: "The exported Android APK size could not be verified.")
        }
    }

    private static func copyOutput(_ source: URL, to destination: URL, expected: UInt64) throws {
        let fileManager = FileManager.default
        let accessed = destination.startAccessingSecurityScopedResource()
        defer { if accessed { destination.stopAccessingSecurityScopedResource() } }
        let folder = destination.deletingLastPathComponent()
        try fileManager.createDirectory(at: folder, withIntermediateDirectories: true)
        let partial = folder.appendingPathComponent(".routevn-apk-\(UUID().uuidString).part")
        defer { try? fileManager.removeItem(at: partial) }
        try fileManager.copyItem(at: source, to: partial)
        try verifySize(partial, expected: expected)
        if fileManager.fileExists(atPath: destination.path) {
            try fileManager.removeItem(at: destination)
        }
        try fileManager.moveItem(at: partial, to: destination)
    }
}
