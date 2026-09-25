import Foundation

@main
struct ClientUpdateApiNativeTests {
    static func main() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".bundle")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let plist: [String: Any] = ["CFBundleShortVersionString": "1.15.1", "CFBundleIdentifier": "com.example.update-test"]
        try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
            .write(to: directory.appendingPathComponent("Info.plist"))
        let bundle = Bundle(url: directory)!
        let deviceId = "123456789AbC"
        let request = try ClientUpdateApi.makeRequest(payload: ["deviceId": deviceId], bundle: bundle)
        precondition(request.httpMethod == "POST")
        precondition(!request.httpShouldHandleCookies)
        precondition(request.timeoutInterval == 10)
        precondition(request.value(forHTTPHeaderField: "X-RouteVN-RPC") == "1")
        let envelope = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        precondition(envelope["method"] as? String == "system.getClientUpdate")
        let context = envelope["params"] as! [String: Any]
        precondition(context["currentVersion"] as? String == "1.15.1")
        precondition(context["distribution"] as? String == "app-store")
        precondition(context["target"] as? String == "ios")
        precondition(context["channel"] as? String == "stable")
        precondition(context["currentBuild"] == nil && context["availableBuild"] == nil)
        let device = context["device"] as! [String: Any]
        precondition(device["id"] as? String == deviceId)
        precondition(device.count == 3)
        let deviceModel = device["model"] as! String
        precondition(!deviceModel.isEmpty && deviceModel.count <= 256)
        let systemVersion = ProcessInfo.processInfo.operatingSystemVersion
        precondition(device["osVersion"] as? String ==
            "\(systemVersion.majorVersion).\(systemVersion.minorVersion).\(systemVersion.patchVersion)")
        precondition(context["deviceId"] == nil && context["deviceModel"] == nil && context["osVersion"] == nil)
        precondition(ClientUpdateApi.deviceMetadata("iPhone17,1") == "iPhone17,1")
        precondition(ClientUpdateApi.deviceMetadata(String(repeating: "a", count: 256)).count == 256)
        let unavailableMetadata: [String?] = [nil, "", " ", "\u{a0}", "\u{feff}",
            String(repeating: "a", count: 257), "iPhone\n17", "iPhone\u{0}", "iPhone\u{1f}", "iPhone\u{7f}"]
        for value in unavailableMetadata {
            precondition(ClientUpdateApi.deviceMetadata(value) == "unknown")
        }
        let invalidIds: [Any] = ["", "123456789Ab", "123456789AbCD", "023456789AbC",
            "I23456789AbC", "l23456789AbC", "O23456789AbC", deviceId + "\n", 123, NSNull()]
        var invalidPayloads = invalidIds.map { ["deviceId": $0] }
        invalidPayloads.append([:])
        for key in ["device", "deviceModel", "osVersion", "availableBuild", "endpoint", "distribution"] {
            invalidPayloads.append(["deviceId": deviceId, key: "caller-supplied"])
        }
        for payload in invalidPayloads {
            do {
                _ = try ClientUpdateApi.makeRequest(payload: payload, bundle: bundle)
                preconditionFailure("Invalid device IDs and caller metadata must be rejected")
            } catch { }
        }
        #if DEBUG
        unsetenv("ROUTEVN_UPDATE_API_URL")
        let defaultDebugEndpoint = try ClientUpdateApi.endpoint()
        precondition(defaultDebugEndpoint.absoluteString == "http://127.0.0.1:8787/system/rpc")
        setenv("ROUTEVN_UPDATE_API_URL", "http://dev-mac.local:8787/system/rpc", 1)
        let debugEndpoint = try ClientUpdateApi.endpoint()
        precondition(debugEndpoint.absoluteString == "http://dev-mac.local:8787/system/rpc")
        setenv("ROUTEVN_UPDATE_API_URL", "file:///tmp/update.json", 1)
        do {
            _ = try ClientUpdateApi.endpoint()
            preconditionFailure("File URLs must be rejected")
        } catch { }
        #else
        setenv("ROUTEVN_UPDATE_API_URL", "http://127.0.0.1:8787/system/rpc", 1)
        let releaseEndpoint = try ClientUpdateApi.endpoint()
        precondition(releaseEndpoint.absoluteString == "https://api1.routevn.com/system/rpc")
        #endif
        print("Client update native request checks passed")
    }
}
