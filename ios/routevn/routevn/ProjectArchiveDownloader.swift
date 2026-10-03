import Foundation

final class ProjectImportProgressReporter {
    enum Stage: String {
        case downloading
        case extracting
        case finishing
    }

    private let projectId: String
    private let deliver: ([String: Any]) -> Void
    private let lock = NSLock()
    private var stage: Stage?
    private var total: UInt64 = 0
    private var lastEventAt: TimeInterval = 0

    init(projectId: String, deliver: @escaping ([String: Any]) -> Void) {
        self.projectId = projectId
        self.deliver = deliver
    }

    func start(_ stage: Stage, total: UInt64 = 0) {
        lock.lock()
        defer { lock.unlock() }
        self.stage = stage
        self.total = total
        lastEventAt = ProcessInfo.processInfo.systemUptime
        emit(stage: stage, current: 0)
    }

    func update(current: UInt64, total: UInt64? = nil) {
        lock.lock()
        defer { lock.unlock() }
        guard let stage else { return }
        if let total { self.total = total }
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastEventAt >= 0.1 else { return }
        lastEventAt = now
        emit(stage: stage, current: current)
    }

    func finish(current: UInt64) {
        lock.lock()
        defer { lock.unlock() }
        guard let stage else { return }
        emit(stage: stage, current: current)
        self.stage = nil
    }

    private func emit(stage: Stage, current: UInt64) {
        deliver([
            "projectId": projectId,
            "stage": stage.rawValue,
            "current": stage == .extracting ? min(current, total) : current,
            "total": total
        ])
    }
}

/**
 Rule C project archive download. Only https URLs are accepted; plain http
 is allowed for loopback hosts (localhost, 127.0.0.1, [::1]) so local dev
 servers keep working. Redirect handling is manual: the session delegate
 refuses to follow redirects so every hop is re-validated against the same
 scheme rule, at most five times. The archive is streamed straight to a temp
 file (never buffered in memory) and the download is aborted once it exceeds
 the 4 GiB archive cap.

 Temp locations: the caller owns the output file and its cleanup; on iOS the
 archive lives in temporaryDirectory/project-import/<uuid>/archive.zip,
 never inside the directory that is finally imported.

 Pure Foundation (URLSession) so it stays unit-testable without UIKit.
 */
final class ProjectArchiveDownloader: NSObject {
    static let defaultMaxArchiveBytes: UInt64 = 4 * 1024 * 1024 * 1024
    private static let maxRedirects = 5
    // URLSession has no separate connect timeout. The 30 s request idle
    // interval covers connect and stalls; there is intentionally no overall
    // deadline because a large archive can make steady progress for longer.
    private static let stallTimeout: TimeInterval = 30

    private let maxArchiveBytes: UInt64
    private let progressReporter: ProjectImportProgressReporter?
    // The session retains its delegate, so the box only holds a weak
    // reference back to this downloader; lazy so the box can capture self.
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = ProjectArchiveDownloader.stallTimeout
        configuration.timeoutIntervalForResource = .infinity
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(
            configuration: configuration,
            delegate: SessionDelegateBox(owner: self),
            delegateQueue: nil
        )
    }()

    private let stateLock = NSLock()
    private var requestSemaphore = DispatchSemaphore(value: 0)
    private var currentResponse: URLResponse?
    private var currentError: Error?
    private var outputHandle: FileHandle?
    private var writingAllowed = false
    private var writtenBytes: UInt64 = 0
    private var expectedBytes: UInt64 = 0
    private var exceededSizeCap = false

    init(
        maxArchiveBytes: UInt64 = ProjectArchiveDownloader.defaultMaxArchiveBytes,
        progressReporter: ProjectImportProgressReporter? = nil
    ) {
        self.maxArchiveBytes = maxArchiveBytes
        self.progressReporter = progressReporter
        super.init()
    }

    deinit {
        session.finishTasksAndInvalidate()
    }

    /**
     Validates the URL against Rule C and returns the normalized URL.
     Throws invalidUrl for non-http(s) schemes, non-loopback http,
     credentials in the URL, or unparsable input.
     */
    static func validateUrl(_ urlSpec: String?) throws -> URL {
        let normalizedSpec = (urlSpec ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: normalizedSpec), !normalizedSpec.isEmpty else {
            throw ProjectImportError("invalidUrl", "URL cannot be parsed.")
        }

        if url.user != nil || url.password != nil {
            throw ProjectImportError("invalidUrl", "URL must not contain credentials.")
        }

        let scheme = (url.scheme ?? "").lowercased()
        let host = url.host?.lowercased()
        if scheme == "https" {
            guard let host, !host.isEmpty else {
                throw ProjectImportError("invalidUrl", "URL is missing a host.")
            }
        } else if scheme == "http" {
            guard isLoopbackHost(host) else {
                throw ProjectImportError("invalidUrl", "Only https URLs or loopback http URLs are allowed.")
            }
        } else {
            throw ProjectImportError(
                "invalidUrl",
                scheme.isEmpty ? "URL scheme must be https." : "URL scheme must be https, not \(scheme)."
            )
        }

        if let port = url.port, port < 1 || port > 65535 {
            throw ProjectImportError("invalidUrl", "URL port is invalid.")
        }

        return url
    }

    static func isLoopbackHost(_ host: String?) -> Bool {
        guard let host, !host.isEmpty else {
            return false
        }
        let bareHost = host.hasPrefix("[") && host.hasSuffix("]")
            ? String(host.dropFirst().dropLast())
            : host
        return bareHost == "localhost" || bareHost == "127.0.0.1" || bareHost == "::1"
    }

    /**
     Suggests a display name for the downloaded archive from the last URL
     path segment, or nil when the URL has none.
     */
    static func suggestArchiveName(_ urlSpec: String?) -> String? {
        guard let url = URL(string: (urlSpec ?? "").trimmingCharacters(in: .whitespacesAndNewlines)) else {
            return nil
        }
        let lastSegment = url.lastPathComponent
        return lastSegment.isEmpty ? nil : lastSegment
    }

    /**
     Downloads the archive to the output URL, which must not exist yet.
     Partial output is deleted on every failure path.
     */
    func download(urlSpec: String, to outputURL: URL) throws {
        var currentURL = try ProjectArchiveDownloader.validateUrl(urlSpec)
        var redirects = 0
        progressReporter?.start(.downloading)

        while true {
            try resetRequestState(outputURL: outputURL)
            let outcome = try performRequest(url: currentURL)

            switch outcome {
            case .completed:
                try finishOutput()
                stateLock.lock()
                let completedBytes = writtenBytes
                stateLock.unlock()
                progressReporter?.finish(current: completedBytes)
                return
            case .redirect(let location):
                redirects += 1
                if redirects > ProjectArchiveDownloader.maxRedirects {
                    throw ProjectImportError(
                        "invalidUrl",
                        "URL redirects more than \(ProjectArchiveDownloader.maxRedirects) times."
                    )
                }
                guard
                    let location,
                    !location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                    let nextURL = URL(string: location, relativeTo: currentURL)?.absoluteURL
                else {
                    throw ProjectImportError("downloadFailed", "Invalid redirect target.")
                }
                // Every hop is re-validated against the same scheme rule.
                currentURL = try ProjectArchiveDownloader.validateUrl(nextURL.absoluteString)
            }
        }
    }

    /**
     Copies a picked local archive into app-managed temp storage with a
     bounded, streaming copy that aborts as soon as the size cap is exceeded.
     */
    static func copyArchive(from sourceURL: URL, to destinationURL: URL, maxArchiveBytes: UInt64 = ProjectArchiveDownloader.defaultMaxArchiveBytes) throws {
        let fileManager = FileManager.default
        if let attributes = try? fileManager.attributesOfItem(atPath: sourceURL.path),
           let size = attributes[.size] as? NSNumber, size.uint64Value > maxArchiveBytes {
            throw ProjectImportError("archiveTooLarge", "Archive is larger than \(maxArchiveBytes) bytes.")
        }

        let inputHandle = try FileHandle(forReadingFrom: sourceURL)
        defer {
            inputHandle.closeFile()
        }
        fileManager.createFile(atPath: destinationURL.path, contents: nil)
        let outputHandle = try FileHandle(forWritingTo: destinationURL)
        defer {
            outputHandle.closeFile()
        }

        let bufferLength = 256 * 1024
        var totalBytes: UInt64 = 0
        while true {
            let chunk = inputHandle.readData(ofLength: bufferLength)
            if chunk.isEmpty {
                return
            }
            outputHandle.write(chunk)
            totalBytes += UInt64(chunk.count)
            if totalBytes > maxArchiveBytes {
                try? fileManager.removeItem(at: destinationURL)
                throw ProjectImportError("archiveTooLarge", "Archive is larger than \(maxArchiveBytes) bytes.")
            }
        }
    }

    // MARK: - Request plumbing

    private enum RequestOutcome {
        case completed
        case redirect(String?)
    }

    private func resetRequestState(outputURL: URL) throws {
        stateLock.lock()
        currentResponse = nil
        currentError = nil
        writingAllowed = false
        writtenBytes = 0
        expectedBytes = 0
        exceededSizeCap = false
        outputHandle?.closeFile()
        stateLock.unlock()

        if FileManager.default.fileExists(atPath: outputURL.path) {
            try? FileManager.default.removeItem(at: outputURL)
        }
        FileManager.default.createFile(atPath: outputURL.path, contents: nil)
        let handle = try FileHandle(forWritingTo: outputURL)
        stateLock.lock()
        outputHandle = handle
        requestSemaphore = DispatchSemaphore(value: 0)
        stateLock.unlock()
    }

    private func performRequest(url: URL) throws -> RequestOutcome {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        // Do not trust Content-Type; the archive is validated by parsing it
        // as a zip after the download.
        request.setValue("*/*", forHTTPHeaderField: "Accept")

        let task = session.dataTask(with: request)
        task.resume()
        requestSemaphore.wait()

        stateLock.lock()
        let response = currentResponse
        let transportError = currentError
        let oversize = exceededSizeCap
        stateLock.unlock()

        if oversize {
            throw ProjectImportError(
                "archiveTooLarge",
                "Download exceeds \(maxArchiveBytes) bytes."
            )
        }
        guard let httpURLResponse = response as? HTTPURLResponse else {
            if let transportError {
                throw ProjectImportError("downloadFailed", "Network error: \(transportError.localizedDescription)")
            }
            throw ProjectImportError("downloadFailed", "The URL did not return an HTTP response.")
        }

        let status = httpURLResponse.statusCode
        if status >= 300 && status < 400 {
            return .redirect(httpURLResponse.value(forHTTPHeaderField: "Location"))
        }
        if status < 200 || status >= 400 {
            throw ProjectImportError("downloadFailed", "HTTP \(status)")
        }
        if let transportError {
            throw ProjectImportError("downloadFailed", "Network error: \(transportError.localizedDescription)")
        }
        return .completed
    }

    private func finishOutput() throws {
        stateLock.lock()
        let handle = outputHandle
        stateLock.unlock()
        handle?.synchronizeFile()
    }

    // MARK: - URLSession callbacks (invoked by SessionDelegateBox)

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        stateLock.lock()
        currentResponse = response
        var isSuccessful = false
        if let statusCode = (response as? HTTPURLResponse)?.statusCode {
            isSuccessful = statusCode >= 200 && statusCode < 300
        }
        writingAllowed = isSuccessful
        if isSuccessful {
            expectedBytes = response.expectedContentLength > 0 ? UInt64(response.expectedContentLength) : 0
        }
        let contentLength = expectedBytes
        stateLock.unlock()
        // Cancel at headers so an endless error body cannot hold the import.
        if !isSuccessful {
            completionHandler(.cancel)
        } else {
            progressReporter?.update(current: 0, total: contentLength)
            completionHandler(.allow)
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        stateLock.lock()
        let shouldWrite = writingAllowed
        let handle = outputHandle
        stateLock.unlock()

        guard shouldWrite, let handle, !data.isEmpty else {
            return
        }
        handle.write(data)
        stateLock.lock()
        writtenBytes += UInt64(data.count)
        let receivedBytes = writtenBytes
        let oversize = writtenBytes > maxArchiveBytes
        if oversize {
            exceededSizeCap = true
        }
        stateLock.unlock()
        progressReporter?.update(current: receivedBytes)
        if oversize {
            dataTask.cancel()
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        stateLock.lock()
        outputHandle?.closeFile()
        outputHandle = nil
        if currentError == nil {
            currentError = error
        }
        stateLock.unlock()
        requestSemaphore.signal()
    }
}

/// URLSession retains its delegate, so the downloader cannot be the delegate
/// directly without a retain cycle; this box forwards everything weakly.
private final class SessionDelegateBox: NSObject, URLSessionDataDelegate {
    weak var owner: ProjectArchiveDownloader?

    init(owner: ProjectArchiveDownloader) {
        self.owner = owner
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        // Redirects are followed manually by the downloader so each hop can
        // be re-validated; the session itself never follows one.
        completionHandler(nil)
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        guard let owner else {
            completionHandler(.cancel)
            return
        }
        owner.urlSession(
            session,
            dataTask: dataTask,
            didReceive: response,
            completionHandler: completionHandler
        )
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        owner?.urlSession(session, dataTask: dataTask, didReceive: data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let owner else {
            return
        }
        owner.urlSession(session, task: task, didCompleteWithError: error)
    }
}
