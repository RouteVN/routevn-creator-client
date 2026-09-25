import Foundation

@main
struct AppDeviceInfoNativeTests {
    static func main() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".bundle")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let plist: [String: Any] = ["CFBundleShortVersionString": "1.15.1"]
        try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
            .write(to: directory.appendingPathComponent("Info.plist"))
        let bundle = Bundle(url: directory)!

        let device = try AppDeviceInfo.read(bundle: bundle)
        precondition(Set(device.keys) == Set(["version", "arch", "model", "osVersion"]))
        precondition(device["version"] as? String == "1.15.1")
        precondition(["aarch64", "x86_64", "unknown"].contains(device["arch"] as? String ?? ""))
        let deviceModel = device["model"] as! String
        precondition(!deviceModel.isEmpty && deviceModel.count <= 256)
        let systemVersion = ProcessInfo.processInfo.operatingSystemVersion
        precondition(device["osVersion"] as? String ==
            "\(systemVersion.majorVersion).\(systemVersion.minorVersion).\(systemVersion.patchVersion)")

        precondition(AppDeviceInfo.deviceMetadata("iPhone17,1") == "iPhone17,1")
        precondition(AppDeviceInfo.deviceMetadata(String(repeating: "a", count: 256)).count == 256)
        let unavailableMetadata: [String?] = [nil, "", " ", "\u{a0}", "\u{feff}",
            String(repeating: "a", count: 257), "iPhone\n17", "iPhone\u{0}", "iPhone\u{1f}", "iPhone\u{7f}"]
        for value in unavailableMetadata {
            precondition(AppDeviceInfo.deviceMetadata(value) == "unknown")
        }

        #if DEBUG
        unsetenv("ROUTEVN_UPDATE_API_URL")
        precondition(AppDeviceInfo.updateApiUrlOverride() == nil)
        setenv("ROUTEVN_UPDATE_API_URL", "http://dev-mac.local:8787/system/updates/v1/routevn-creator/mobile", 1)
        precondition(AppDeviceInfo.updateApiUrlOverride() == "http://dev-mac.local:8787/system/updates/v1/routevn-creator/mobile")
        #else
        setenv("ROUTEVN_UPDATE_API_URL", "http://127.0.0.1:8787/system/updates/v1/routevn-creator/mobile", 1)
        precondition(AppDeviceInfo.updateApiUrlOverride() == nil)
        #endif
        print("App device information checks passed")
    }
}
