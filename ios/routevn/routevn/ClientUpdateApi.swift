import Foundation
import Darwin

/// Fetches bounded update metadata. Store installation remains outside this client.
final class ClientUpdateApi: NSObject, URLSessionDataDelegate {
    static let maximumResponseBytes = 64 * 1024
    private let queue = DispatchQueue(label: "com.routevn.creator.updates")
    private var session: URLSession?
    private var completion: ((Result<[String: Any], Error>) -> Void)?
    private var response: HTTPURLResponse?
    private var body = Data()
    private var timeout: DispatchWorkItem?

    static func context(bundle: Bundle = .main) throws -> [String: Any] {
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
            "appId": "routevn-creator", "currentVersion": version,
            "target": "ios", "arch": architecture,
            "distribution": "app-store", "channel": "stable",
            "device": ["model": hardwareModel(), "osVersion": osVersion],
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

    static func endpoint() throws -> URL {
        var value = "https://api1.routevn.com/system/rpc"
        #if DEBUG
        value = "http://127.0.0.1:8787/system/rpc"
        if let configured = ProcessInfo.processInfo.environment["ROUTEVN_UPDATE_API_URL"], !configured.isEmpty {
            value = configured
        }
        let allowedSchemes = ["https", "http"]
        #else
        let allowedSchemes = ["https"]
        #endif
        guard let url = URL(string: value), let scheme = url.scheme,
              allowedSchemes.contains(scheme), url.host != nil,
              url.user == nil, url.password == nil else {
            throw failure("Invalid update API endpoint.")
        }
        return url
    }

    static func makeRequest(payload: [String: Any], bundle: Bundle = .main) throws -> URLRequest {
        guard payload.count == 1, let deviceId = payload["deviceId"] as? String,
              deviceId.utf8.count == 12,
              deviceId.range(of: "^[1-9A-HJ-NP-Za-km-z]{12}$", options: .regularExpression) != nil else {
            throw failure("Invalid update request parameter.")
        }
        var params = try context(bundle: bundle)
        var device = params["device"] as! [String: Any]
        device["id"] = deviceId
        params["device"] = device
        var request = URLRequest(url: try endpoint(), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("1", forHTTPHeaderField: "X-RouteVN-RPC")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "jsonrpc": "2.0", "id": 1, "method": "system.getClientUpdate", "params": params,
        ])
        return request
    }

    func request(payload: [String: Any], completion: @escaping (Result<[String: Any], Error>) -> Void) {
        queue.async {
            guard self.completion == nil else {
                completion(.failure(Self.failure("An update request is already running.")))
                return
            }
            do {
                let request = try Self.makeRequest(payload: payload)
                let configuration = URLSessionConfiguration.ephemeral
                configuration.httpCookieStorage = nil
                configuration.httpShouldSetCookies = false
                configuration.urlCredentialStorage = nil
                configuration.urlCache = nil
                configuration.timeoutIntervalForRequest = 10
                configuration.timeoutIntervalForResource = 10
                let delegates = OperationQueue()
                delegates.maxConcurrentOperationCount = 1
                delegates.underlyingQueue = self.queue
                self.completion = completion
                self.body = Data()
                self.response = nil
                let session = URLSession(configuration: configuration, delegate: self, delegateQueue: delegates)
                self.session = session
                let timeout = DispatchWorkItem { [weak self] in
                    self?.finish(.failure(Self.failure("Update request timed out.")))
                }
                self.timeout = timeout
                self.queue.asyncAfter(deadline: .now() + 10, execute: timeout)
                session.dataTask(with: request).resume()
            } catch {
                completion(.failure(error))
            }
        }
    }

    func close() {
        queue.async { self.finish(.failure(Self.failure("Update request cancelled."))) }
    }

    private func finish(_ result: Result<[String: Any], Error>) {
        guard let completion else { return }
        self.completion = nil
        timeout?.cancel()
        timeout = nil
        session?.invalidateAndCancel()
        session = nil
        body = Data()
        response = nil
        completion(result)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        // Retain platform TLS verification, but never supply HTTP credentials.
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
            completionHandler(.performDefaultHandling, nil)
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask,
                    didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard session === self.session else { completionHandler(.cancel); return }
        guard let http = response as? HTTPURLResponse,
              response.expectedContentLength <= Int64(Self.maximumResponseBytes) else {
            completionHandler(.cancel)
            finish(.failure(Self.failure("Invalid or oversized update response.")))
            return
        }
        self.response = http
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard session === self.session else { return }
        guard data.count <= Self.maximumResponseBytes - body.count else {
            finish(.failure(Self.failure("Update response is too large.")))
            return
        }
        body.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard session === self.session else { return }
        if let error { finish(.failure(error)); return }
        guard let response, let text = String(data: body, encoding: .utf8) else {
            finish(.failure(Self.failure("Invalid update response.")))
            return
        }
        var result: [String: Any] = ["status": response.statusCode, "body": text]
        if let retryAfter = response.value(forHTTPHeaderField: "Retry-After") {
            result["retryAfter"] = retryAfter
        }
        finish(.success(result))
    }

    private static func failure(_ message: String) -> NSError {
        NSError(domain: "com.routevn.creator.updates", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
