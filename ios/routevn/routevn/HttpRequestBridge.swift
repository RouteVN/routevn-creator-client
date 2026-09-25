import Foundation

/// Sends bounded HTTP requests from the JavaScript environment.
final class HttpRequestBridge: NSObject, URLSessionDataDelegate {
    static let maximumResponseBytes = 64 * 1024
    private let queue = DispatchQueue(label: "com.routevn.creator.http")
    private var session: URLSession?
    private var completion: ((Result<[String: Any], Error>) -> Void)?
    private var response: HTTPURLResponse?
    private var body = Data()
    private var timeout: DispatchWorkItem?

    private static func isLocalHost(_ host: String) -> Bool {
        let name = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        if name == "localhost" || name.hasSuffix(".local") || name == "::1" {
            return true
        }
        if name.contains(":"), let first = name.split(separator: ":").first,
           let prefix = UInt16(first, radix: 16) {
            return (prefix & 0xfe00) == 0xfc00 || (prefix & 0xffc0) == 0xfe80
        }
        let parts = name.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return false }
        let octets = parts.compactMap { part -> UInt8? in
            let text = String(part)
            if text.isEmpty || !text.utf8.allSatisfy({ $0 >= 48 && $0 <= 57 }) ||
               (text != "0" && text.hasPrefix("0")) { return nil }
            return UInt8(text)
        }
        guard octets.count == 4 else { return false }
        return octets[0] == 10 || octets[0] == 127 ||
            (octets[0] == 172 && (16...31).contains(octets[1])) ||
            (octets[0] == 192 && octets[1] == 168) ||
            (octets[0] == 169 && octets[1] == 254)
    }

    static func makeRequest(payload: [String: Any]) throws -> URLRequest {
        guard payload.count == 4,
              let urlString = payload["url"] as? String,
              let url = URL(string: urlString),
              let host = url.host,
              url.user == nil, url.password == nil, url.fragment == nil,
              payload["method"] as? String == "POST",
              let headers = payload["headers"] as? [String: String],
              headers.count == 2,
              headers["Content-Type"] == "application/json",
              headers["X-RouteVN-RPC"] == "1",
              let body = payload["body"] as? String,
              !body.isEmpty, body.utf8.count <= maximumResponseBytes else {
            throw failure("Invalid HTTP request.")
        }
        let production = url.scheme == "https" && host == "api1.routevn.com" &&
            (url.port == nil || url.port == 443)
        #if DEBUG
        let development = url.scheme == "http" && isLocalHost(host)
        #else
        let development = false
        #endif
        guard production || development else {
            throw failure("HTTP endpoint is not allowed.")
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("1", forHTTPHeaderField: "X-RouteVN-RPC")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.httpBody = Data(body.utf8)
        return request
    }

    func request(payload: [String: Any], completion: @escaping (Result<[String: Any], Error>) -> Void) {
        queue.async {
            guard self.completion == nil else {
                completion(.failure(Self.failure("An HTTP request is already running.")))
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
                    self?.finish(.failure(Self.failure("HTTP request timed out.")))
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
        queue.async { self.finish(.failure(Self.failure("HTTP request cancelled."))) }
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
            finish(.failure(Self.failure("Invalid or oversized HTTP response.")))
            return
        }
        self.response = http
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard session === self.session else { return }
        guard data.count <= Self.maximumResponseBytes - body.count else {
            finish(.failure(Self.failure("HTTP response is too large.")))
            return
        }
        body.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard session === self.session else { return }
        if let error { finish(.failure(error)); return }
        guard let response, let text = String(data: body, encoding: .utf8) else {
            finish(.failure(Self.failure("Invalid HTTP response.")))
            return
        }
        var result: [String: Any] = ["status": response.statusCode, "body": text]
        if let retryAfter = response.value(forHTTPHeaderField: "Retry-After") {
            result["retryAfter"] = retryAfter
        }
        finish(.success(result))
    }

    private static func failure(_ message: String) -> NSError {
        NSError(domain: "com.routevn.creator.http", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
