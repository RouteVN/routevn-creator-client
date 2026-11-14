import Foundation
import UniformTypeIdentifiers
import WebKit

// Serves routevn-player://game/web/: files from the app bundle's `web` folder,
// and `package.bin`, the decrypted game package, by byte range. Ranges follow
// the desktop package shim: one `bytes=` range returns 206 with
// Content-Range; a missing or unsatisfiable range returns 416.
final class PlayerSchemeHandler: NSObject, WKURLSchemeHandler {
    private static let packagePath = "/web/package.bin"
    private static let chunkSize = 1024 * 1024
    private static let maxSafeInteger: UInt64 = 9_007_199_254_740_991
    private static let mimeTypes = [
        "html": "text/html; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "json": "application/json",
        "wasm": "application/wasm",
        "svg": "image/svg+xml",
    ]

    private let webRoot: URL
    private let package: PlayerPackage?
    private let queue = DispatchQueue(
        label: "vn.routevn.player.files",
        qos: .userInitiated,
        attributes: .concurrent
    )
    // Tasks WebKit has not stopped. Main thread only.
    private var liveTasks = Set<ObjectIdentifier>()

    init(webRoot: URL, package: PlayerPackage?) {
        self.webRoot = webRoot.standardizedFileURL
        self.package = package
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        liveTasks.insert(ObjectIdentifier(task))
        guard let url = task.request.url, PlayerViewController.isPlayerURL(url) else {
            finish(task, status: 403)
            return
        }
        guard (task.request.httpMethod ?? "GET") == "GET" else {
            finish(task, status: 405)
            return
        }
        if url.path == Self.packagePath {
            servePackage(task, url: url)
        } else if url.path.hasPrefix("/web/") {
            serveFile(task, url: url)
        } else {
            finish(task, status: 404)
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        liveTasks.remove(ObjectIdentifier(task))
    }

    private func serveFile(_ task: WKURLSchemeTask, url: URL) {
        let relativePath = String(url.path.dropFirst("/web/".count))
        let fileURL = webRoot.appendingPathComponent(relativePath).standardizedFileURL
        guard !relativePath.isEmpty, fileURL.path.hasPrefix(webRoot.path + "/") else {
            finish(task, status: 404)
            return
        }
        queue.async {
            let body = try? Data(contentsOf: fileURL)
            DispatchQueue.main.async {
                guard let body else {
                    self.finish(task, status: 404)
                    return
                }
                self.finish(task, status: 200, headers: [
                    "Content-Type": Self.mimeType(for: fileURL),
                    "Content-Length": String(body.count),
                    "Cache-Control": "no-cache",
                ], body: body)
            }
        }
    }

    private func servePackage(_ task: WKURLSchemeTask, url: URL) {
        guard let package else {
            finish(task, status: 500)
            return
        }
        let total = package.length
        let rangeHeader = task.request.value(forHTTPHeaderField: "Range")
        guard let (start, end) = Self.parseRange(rangeHeader, total: total) else {
            finish(task, status: 416, headers: [
                "Content-Range": "bytes */\(total)",
                "Content-Length": "0",
                "Cache-Control": "no-store",
            ])
            return
        }
        let headers = [
            "Accept-Ranges": "bytes",
            "Content-Type": "application/octet-stream",
            "Cache-Control": "no-store",
            "Content-Range": "bytes \(start)-\(end)/\(total)",
            "Content-Length": String(end - start + 1),
        ]
        let taskID = ObjectIdentifier(task)
        guard respond(task, status: 206, headers: headers) else {
            liveTasks.remove(taskID)
            return
        }
        // Decrypts and sends one chunk at a time, so a large range never sits
        // in memory, and stops when WebKit stops the task.
        queue.async {
            var position = start
            while position <= end {
                let count = Int(min(UInt64(Self.chunkSize), end - position + 1))
                let chunk: Data
                do {
                    chunk = try package.read(at: position, count: count)
                    guard chunk.count == count else { throw CocoaError(.fileReadCorruptFile) }
                } catch {
                    DispatchQueue.main.async { self.fail(task, error: error) }
                    return
                }
                position += UInt64(count)
                let live = DispatchQueue.main.sync { () -> Bool in
                    guard self.liveTasks.contains(taskID) else { return false }
                    task.didReceive(chunk)
                    return true
                }
                if !live { return }
            }
            DispatchQueue.main.async {
                guard self.liveTasks.remove(taskID) != nil else { return }
                task.didFinish()
            }
        }
    }

    // Matches the desktop package fetch shim: one range, inclusive end,
    // clamped to the end of the package. A suffix larger than the package
    // returns all of it.
    static func parseRange(_ header: String?, total: UInt64) -> (UInt64, UInt64)? {
        guard let header, total > 0 else { return nil }
        let value = header.trimmingCharacters(in: .whitespaces)
        guard value.hasPrefix("bytes=") else { return nil }
        let parts = value.dropFirst("bytes=".count).split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2,
              parts.allSatisfy({ $0.utf8.allSatisfy { $0 >= 48 && $0 <= 57 } }) else {
            return nil
        }
        let start: UInt64
        let end: UInt64
        if parts[0].isEmpty {
            guard !parts[1].isEmpty, let suffix = Double(parts[1]), suffix.isFinite, suffix > 0 else {
                return nil
            }
            start = suffix >= Double(total) ? 0 : total - UInt64(suffix)
            end = total - 1
        } else {
            guard let parsedStart = UInt64(parts[0]) else { return nil }
            start = parsedStart
            if parts[1].isEmpty {
                end = total - 1
            } else {
                guard let parsedEnd = UInt64(parts[1]) else { return nil }
                end = parsedEnd
            }
        }
        guard start <= maxSafeInteger, end <= maxSafeInteger, end >= start, start < total else {
            return nil
        }
        return (start, min(end, total - 1))
    }

    private static func mimeType(for url: URL) -> String {
        let fileExtension = url.pathExtension.lowercased()
        return mimeTypes[fileExtension]
            ?? UTType(filenameExtension: fileExtension)?.preferredMIMEType
            ?? "application/octet-stream"
    }

    // Sends the response head. False when WebKit already stopped the task.
    private func respond(_ task: WKURLSchemeTask, status: Int, headers: [String: String]) -> Bool {
        guard liveTasks.contains(ObjectIdentifier(task)), let url = task.request.url,
              let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)
        else {
            return false
        }
        task.didReceive(response)
        return true
    }

    private func finish(
        _ task: WKURLSchemeTask,
        status: Int,
        headers: [String: String] = ["Content-Length": "0", "Cache-Control": "no-store"],
        body: Data = Data()
    ) {
        guard respond(task, status: status, headers: headers) else {
            liveTasks.remove(ObjectIdentifier(task))
            return
        }
        if !body.isEmpty {
            task.didReceive(body)
        }
        task.didFinish()
        liveTasks.remove(ObjectIdentifier(task))
    }

    private func fail(_ task: WKURLSchemeTask, error: Error) {
        guard liveTasks.remove(ObjectIdentifier(task)) != nil else { return }
        task.didFailWithError(error)
    }
}
