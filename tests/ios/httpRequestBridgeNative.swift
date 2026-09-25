import Foundation

@main
struct HttpRequestBridgeNativeTests {
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
        precondition(["aarch64", "x86_64"].contains(device["arch"] as? String ?? ""))
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

        let body = "{\"opaque\":true}"
        let headers = ["Content-Type": "application/json", "X-RouteVN-RPC": "1"]
        let payload: [String: Any] = [
            "url": "https://api1.routevn.com/system/rpc",
            "method": "POST",
            "headers": headers,
            "body": body,
        ]
        let request = try HttpRequestBridge.makeRequest(payload: payload)
        precondition(request.url?.absoluteString == payload["url"] as? String)
        precondition(request.httpMethod == "POST")
        precondition(request.httpBody == Data(body.utf8))
        precondition(!request.httpShouldHandleCookies)
        precondition(request.timeoutInterval == 10)
        precondition(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        precondition(request.value(forHTTPHeaderField: "X-RouteVN-RPC") == "1")
        precondition(request.value(forHTTPHeaderField: "Cache-Control") == "no-store")

        let invalidUrls = [
            "http://api1.routevn.com/system/rpc",
            "https://example.com/system/rpc",
            "https://api1.routevn.com.evil.example/system/rpc",
            "https://user:pass@api1.routevn.com/system/rpc",
            "https://api1.routevn.com/system/rpc#fragment",
            "http://example.com/system/rpc",
            "http://192.168.1.2.attacker.com:8787/system/rpc",
            "http://192.168.01.2:8787/system/rpc",
            "file:///tmp/update.json",
        ]
        for url in invalidUrls {
            var invalid = payload
            invalid["url"] = url
            expectRejection(invalid)
        }
        var invalid = payload
        invalid["method"] = "GET"
        expectRejection(invalid)
        invalid = payload
        invalid["headers"] = ["Content-Type": "application/json"]
        expectRejection(invalid)
        invalid = payload
        invalid["headers"] = ["Content-Type": "application/json", "X-RouteVN-RPC": "1", "Authorization": "secret"]
        expectRejection(invalid)
        invalid = payload
        invalid["body"] = String(repeating: "x", count: HttpRequestBridge.maximumResponseBytes + 1)
        expectRejection(invalid)
        invalid = payload
        invalid["unexpected"] = true
        expectRejection(invalid)

        #if DEBUG
        unsetenv("ROUTEVN_UPDATE_API_URL")
        precondition(AppDeviceInfo.updateApiUrlOverride() == nil)
        setenv("ROUTEVN_UPDATE_API_URL", "http://dev-mac.local:8787/system/rpc", 1)
        precondition(AppDeviceInfo.updateApiUrlOverride() == "http://dev-mac.local:8787/system/rpc")
        for url in ["http://127.0.0.1:8787/system/rpc", "http://dev-mac.local:8787/system/rpc", "http://192.168.1.2:8787/system/rpc"] {
            var local = payload
            local["url"] = url
            let localRequest = try HttpRequestBridge.makeRequest(payload: local)
            precondition(localRequest.url?.absoluteString == url)
        }
        #else
        setenv("ROUTEVN_UPDATE_API_URL", "http://127.0.0.1:8787/system/rpc", 1)
        precondition(AppDeviceInfo.updateApiUrlOverride() == nil)
        var local = payload
        local["url"] = "http://127.0.0.1:8787/system/rpc"
        expectRejection(local)
        #endif
        print("Client update HTTP capability checks passed")
    }

    private static func expectRejection(_ payload: [String: Any]) {
        do {
            _ = try HttpRequestBridge.makeRequest(payload: payload)
            preconditionFailure("Invalid HTTP request must be rejected")
        } catch { }
    }
}
