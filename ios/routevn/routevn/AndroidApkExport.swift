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
    /// The archive an export writes: an APK, or an App Bundle for Google Play.
    enum Format {
        case apk
        case bundle

        var templateName: String { self == .apk ? "RouteVNPlayerTemplate.apk" : "RouteVNPlayerTemplate.aab" }
        var descriptorName: String { self == .apk ? "RouteVNPlayerTemplate.json" : "RouteVNPlayerTemplate.aab.json" }
        var outputName: String { self == .apk ? "output.apk" : "output.aab" }
        var sizeKey: String { self == .apk ? "apkBytes" : "bundleBytes" }
    }

    private static func templates(_ format: Format) -> (template: URL, descriptor: URL)? {
        guard let resources = Bundle.main.resourceURL else { return nil }
        let directory = resources.appendingPathComponent("web/player-templates/android", isDirectory: true)
        let template = directory.appendingPathComponent(format.templateName)
        let descriptor = directory.appendingPathComponent(format.descriptorName)
        guard FileManager.default.fileExists(atPath: template.path),
              FileManager.default.fileExists(atPath: descriptor.path) else { return nil }
        return (template, descriptor)
    }

    /// `bundleAvailable` tells whether the App Bundle template is installed
    /// too. A failed bundle check leaves APK export available.
    static func availability() throws -> [String: Any] {
        guard let templates = templates(.apk) else { return ["available": false] }
        let response = templates.template.path.withCString { template in
            templates.descriptor.path.withCString { descriptor in
                routevn_android_export_capabilities(template, descriptor)
            }
        }
        var capabilities = try decodeResponse(response)
        if capabilities["available"] as? Bool == true {
            capabilities["bundleAvailable"] = bundleAvailable()
        }
        return capabilities
    }

    private static func bundleAvailable() -> Bool {
        guard let templates = templates(.bundle) else { return false }
        let response = templates.template.path.withCString { template in
            templates.descriptor.path.withCString { descriptor in
                routevn_android_bundle_export_capabilities(template, descriptor)
            }
        }
        return (try? decodeResponse(response))?["available"] as? Bool == true
    }

    /// The project's signing keys. The project stores them; these calls only
    /// make a key, read the key in a keystore file, and encode a keystore file.
    static func createSigningKey(_ request: [String: Any]) throws -> [String: Any] {
        try signingKeyCall(request, routevn_android_create_signing_key)
    }

    static func readKeystore(_ request: [String: Any]) throws -> [String: Any] {
        try signingKeyCall(request, routevn_android_read_keystore)
    }

    static func encodeKeystore(_ request: [String: Any]) throws -> [String: Any] {
        try signingKeyCall(request, routevn_android_encode_keystore)
    }

    private static func signingKeyCall(
        _ request: [String: Any],
        _ call: (UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>?
    ) throws -> [String: Any] {
        let data = try JSONSerialization.data(withJSONObject: request)
        let json = String(decoding: data, as: UTF8.self)
        return try unwrap(decodeResponse(json.withCString { call($0) }), failure: "The signing key request failed.")
    }

    /// The `result` of an exporter response, or its error with the exporter's code.
    private static func unwrap(_ decoded: [String: Any], failure: String) throws -> [String: Any] {
        guard decoded["ok"] as? Bool == true else {
            let error = decoded["error"] as? [String: Any] ?? [:]
            throw AndroidApkExportError(
                code: error["code"] as? String ?? "write-failed",
                message: error["message"] as? String ?? failure
            )
        }
        guard let result = decoded["result"] as? [String: Any] else {
            throw AndroidApkExportError(code: "write-failed", message: "The Android exporter returned an invalid result.")
        }
        return result
    }

    /// Runs on the bridge's background queue. Rust reads the bundled template
    /// in place and writes only within this export's private cache directory.
    /// The request's `signingKey` signs the file; a bundle needs one.
    static func export(
        request: [String: Any],
        format: Format,
        to destination: URL,
        progress: AndroidApkExportProgress
    ) throws -> [String: Any] {
        guard let templates = templates(format) else {
            throw AndroidApkExportError(code: "template-missing", message: "The Android player template is missing.")
        }
        let fileManager = FileManager.default
        let caches = try fileManager.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = caches.appendingPathComponent("routevn-apk-\(UUID().uuidString)", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: directory) }
        let output = directory.appendingPathComponent(format.outputName)
        let work = directory.appendingPathComponent("work", isDirectory: true)
        try fileManager.createDirectory(at: work, withIntermediateDirectories: true)
        var nativeRequest = request
        nativeRequest["templatePath"] = templates.template.path
        nativeRequest["descriptorPath"] = templates.descriptor.path
        nativeRequest["outputPath"] = output.path
        nativeRequest["workDir"] = work.path
        let data = try JSONSerialization.data(withJSONObject: nativeRequest)
        let json = String(decoding: data, as: UTF8.self)
        let response = withExtendedLifetime(progress) {
            json.withCString { requestJSON in
                let context = Unmanaged.passUnretained(progress).toOpaque()
                switch format {
                case .apk:
                    return routevn_android_export_apk(requestJSON, androidApkExportProgressCallback, context)
                case .bundle:
                    return routevn_android_export_bundle(requestJSON, androidApkExportProgressCallback, context)
                }
            }
        }
        var result = try unwrap(decodeResponse(response), failure: "The Android export failed.")
        guard let bytes = result[format.sizeKey] as? NSNumber, bytes.uint64Value > 0 else {
            throw AndroidApkExportError(code: "write-failed", message: "The Android exporter returned an invalid result.")
        }
        try verifySize(output, expected: bytes.uint64Value)
        try copyOutput(output, to: destination, expected: bytes.uint64Value)
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
            throw AndroidApkExportError(code: "write-failed", message: "The exported Android file size could not be verified.")
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
