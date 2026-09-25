import Foundation
import Darwin

/// Exposes installed app and device facts to JavaScript.
enum AppDeviceInfo {
    static func read(bundle: Bundle = .main) throws -> [String: Any] {
        guard let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
              !version.isEmpty else {
            throw failure("Installed application version is missing.")
        }
        #if arch(arm64)
        let architecture = "aarch64"
        #elseif arch(x86_64)
        let architecture = "x86_64"
        #else
        throw failure("Unsupported iOS architecture.")
        #endif
        let systemVersion = ProcessInfo.processInfo.operatingSystemVersion
        let osVersion = "\(systemVersion.majorVersion).\(systemVersion.minorVersion).\(systemVersion.patchVersion)"
        return [
            "version": version,
            "arch": architecture,
            "model": hardwareModel(),
            "osVersion": osVersion,
        ]
    }

    private static func hardwareModel() -> String {
        var information = utsname()
        guard uname(&information) == 0 else {
            return "unknown"
        }
        let capacity = MemoryLayout.size(ofValue: information.machine)
        let model = withUnsafePointer(to: &information.machine) { pointer in
            pointer.withMemoryRebound(to: CChar.self, capacity: capacity) { String(cString: $0) }
        }
        return deviceMetadata(model)
    }

    static func deviceMetadata(_ value: String?) -> String {
        guard let value, !value.isEmpty, value.utf16.count <= 256,
              !value.unicodeScalars.contains(where: { $0.value <= 0x1f || $0.value == 0x7f }),
              value.unicodeScalars.contains(where: {
                  !CharacterSet.whitespacesAndNewlines.contains($0) && $0.value != 0xfeff
              }) else {
            return "unknown"
        }
        return value
    }

    static func updateApiUrlOverride() -> String? {
        #if DEBUG
        let value = ProcessInfo.processInfo.environment["ROUTEVN_UPDATE_API_URL"]
        return value?.isEmpty == false ? value : nil
        #else
        return nil
        #endif
    }

    private static func failure(_ message: String) -> NSError {
        NSError(domain: "com.routevn.creator.device", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
