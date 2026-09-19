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
        let request = try ClientUpdateApi.makeRequest(bundle: bundle)
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
        #if DEBUG
        setenv("ROUTEVN_UPDATE_API_URL", "http://127.0.0.1:8787/system/rpc", 1)
        let debugEndpoint = try ClientUpdateApi.endpoint()
        precondition(debugEndpoint.absoluteString == "http://127.0.0.1:8787/system/rpc")
        setenv("ROUTEVN_UPDATE_API_URL", "file:///tmp/update.json", 1)
        do {
            _ = try ClientUpdateApi.endpoint()
            preconditionFailure("File URLs must be rejected")
        } catch { }
        #else
        setenv("ROUTEVN_UPDATE_API_URL", "http://127.0.0.1:8787/system/rpc", 1)
        let releaseEndpoint = try ClientUpdateApi.endpoint()
        precondition(releaseEndpoint.absoluteString == "https://api.routevn.com/system/rpc")
        #endif
        print("Client update native request checks passed")
    }
}
