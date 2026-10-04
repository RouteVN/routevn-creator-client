import Foundation

/**
 Streams one URL into a NEW file; it knows nothing about what is downloaded and
 nothing is held in memory. Only https URLs are accepted (http for localhost,
 127.0.0.1 and [::1]), without credentials. Redirects are followed by hand, at
 most five times, and every hop passes the same check. URLSession has no
 separate connect timeout, so the single 30 s idle interval covers connecting
 and stalls; there is no overall deadline because a large file can make steady
 progress for longer. The bytes are saved as the server sends them and the
 partial file is deleted on every failure. Errors are invalidUrl,
 downloadFailed, tooLarge and writeFailed.
 */
final class FileDownloader: NSObject, URLSessionDataDelegate {
    struct Result {
        let finalUrl: String
        let contentDisposition: String?
        let bytes: UInt64
    }

    private static let maxRedirects = 5
    private static let idleTimeout: TimeInterval = 30

    private let maxBytes: UInt64
    private let progress: TransferProgress?
    private let lock = NSLock()
    private var finished = DispatchSemaphore(value: 0)
    private var response: HTTPURLResponse?
    private var transportError: Error?
    private var failure: CodedError?
    private var output: FileHandle?
    private var written: UInt64 = 0

    init(maxBytes: UInt64, progress: TransferProgress? = nil) {
        self.maxBytes = maxBytes
        self.progress = progress
    }

    /// Returns the URL when it may be downloaded, and throws invalidUrl otherwise.
    static func validate(_ spec: String) throws -> URL {
        guard
            let url = URL(string: spec.trimmingCharacters(in: .whitespacesAndNewlines)),
            let scheme = url.scheme?.lowercased()
        else {
            throw CodedError("invalidUrl", "URL cannot be parsed.")
        }
        guard url.user == nil, url.password == nil else {
            throw CodedError("invalidUrl", "URL must not contain credentials.")
        }
        guard let host = url.host?.lowercased(), !host.isEmpty else {
            throw CodedError("invalidUrl", "URL is missing a host.")
        }
        let isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].contains(host)
        guard scheme == "https" || (scheme == "http" && isLoopback) else {
            throw CodedError("invalidUrl", "Only https URLs (or http on localhost) are allowed.")
        }
        return url
    }

    /// Downloads to `destination`, which must not exist yet.
    func download(url spec: String, to destination: URL) throws -> Result {
        var url = try Self.validate(spec)
        let handle = try FileOps.createExclusive(destination)
        lock.lock()
        output = handle
        lock.unlock()

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = Self.idleTimeout
        configuration.timeoutIntervalForResource = .infinity
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        // The session retains its delegate; invalidating it breaks that cycle.
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        defer { session.invalidateAndCancel() }

        do {
            var redirects = 0
            while true {
                let response = try fetch(url, using: session)
                let status = response.statusCode
                if (200..<300).contains(status) {
                    try handle.close()
                    lock.lock()
                    let bytes = written
                    lock.unlock()
                    progress?.finish(current: bytes)
                    return Result(
                        finalUrl: url.absoluteString,
                        contentDisposition: response.value(forHTTPHeaderField: "Content-Disposition"),
                        bytes: bytes
                    )
                }
                guard
                    (300..<400).contains(status),
                    let location = response.value(forHTTPHeaderField: "Location")?
                        .trimmingCharacters(in: .whitespacesAndNewlines),
                    let next = URL(string: location, relativeTo: url)?.absoluteURL
                else {
                    throw CodedError("downloadFailed", "HTTP \(status)")
                }
                redirects += 1
                guard redirects <= Self.maxRedirects else {
                    throw CodedError("downloadFailed", "Too many redirects.")
                }
                url = try Self.validate(next.absoluteString)
            }
        } catch {
            try? handle.close()
            try? FileManager.default.removeItem(at: destination)
            throw error
        }
    }

    /// One request, waited for. Redirect and error responses are cancelled at the headers.
    private func fetch(_ url: URL, using session: URLSession) throws -> HTTPURLResponse {
        lock.lock()
        response = nil
        transportError = nil
        failure = nil
        written = 0
        finished = DispatchSemaphore(value: 0)
        let done = finished
        lock.unlock()

        var request = URLRequest(url: url)
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        // The bytes are saved as the server sends them, on every platform.
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        session.dataTask(with: request).resume()
        done.wait()

        lock.lock()
        defer { lock.unlock() }
        if let failure {
            throw failure
        }
        guard let response else {
            let reason = transportError?.localizedDescription ?? "The URL did not return an HTTP response."
            throw CodedError("downloadFailed", "Network error: \(reason)")
        }
        if (200..<300).contains(response.statusCode), let transportError {
            throw CodedError("downloadFailed", "Network error: \(transportError.localizedDescription)")
        }
        return response
    }

    // MARK: URLSessionDataDelegate

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        // Never followed by the session: every hop is validated by download().
        completionHandler(nil)
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        guard let http = response as? HTTPURLResponse else {
            completionHandler(.cancel)
            return
        }
        lock.lock()
        self.response = http
        let length = http.expectedContentLength > 0 ? UInt64(http.expectedContentLength) : 0
        let isSuccess = (200..<300).contains(http.statusCode)
        if isSuccess && length > maxBytes {
            failure = CodedError("tooLarge", "Download is larger than \(maxBytes) bytes.")
        }
        let proceed = isSuccess && failure == nil
        lock.unlock()
        guard proceed else {
            completionHandler(.cancel)
            return
        }
        // The first progress event waits for the answer, so JavaScript can keep
        // showing that it is still connecting.
        progress?.start(total: length)
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        lock.lock()
        defer { lock.unlock() }
        guard failure == nil, let output else {
            return
        }
        written += UInt64(data.count)
        if written > maxBytes {
            failure = CodedError("tooLarge", "Download is larger than \(maxBytes) bytes.")
        } else {
            do {
                // The throwing API: the legacy write(_:) raises an uncatchable
                // Objective-C exception when the disk is full.
                try output.write(contentsOf: data)
                progress?.update(current: written)
            } catch {
                failure = CodedError("writeFailed", "Cannot write the download: \(error.localizedDescription)")
            }
        }
        if failure != nil {
            dataTask.cancel()
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        lock.lock()
        transportError = error
        let done = finished
        lock.unlock()
        done.signal()
    }
}
