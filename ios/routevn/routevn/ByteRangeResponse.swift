import Foundation

struct ByteRangeResponse {
    let statusCode: Int
    let headers: [String: String]
    let body: Data

    private static let maxRangeLength: UInt64 = 1000 * 1024

    private enum ParsedRange {
        case ignored
        case unsatisfiable
        case partial(UInt64, UInt64)
    }

    private static func parseRange(_ value: String?, size: UInt64) -> ParsedRange {
        guard let value = value, value.hasPrefix("bytes=") else { return .ignored }
        let parts = value.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return .ignored }

        func number(_ value: Substring) -> UInt64? {
            guard !value.isEmpty, value.utf8.allSatisfy({ $0 >= 48 && $0 <= 57 }) else { return nil }
            return UInt64(value)
        }

        if parts[0].isEmpty {
            guard let suffix = number(parts[1]) else { return .ignored }
            guard suffix > 0, size > 0 else { return .unsatisfiable }
            return .partial(size - min(size, suffix, maxRangeLength), size - 1)
        }

        guard let start = number(parts[0]) else { return .ignored }
        var end: UInt64?
        if !parts[1].isEmpty {
            guard let requestedEnd = number(parts[1]), requestedEnd >= start else { return .ignored }
            end = requestedEnd
        }
        guard start < size else { return .unsatisfiable }
        let cappedEnd = start.addingReportingOverflow(maxRangeLength - 1)
        return .partial(start, min(end ?? size - 1, size - 1, cappedEnd.overflow ? UInt64.max : cappedEnd.partialValue))
    }

    static func make(fileURL: URL, contentType: String, rangeHeader: String?) throws -> ByteRangeResponse {
        // One handle for the size and the bytes, so a file replaced meanwhile
        // can't mix its bytes with the old size.
        let file = try FileHandle(forReadingFrom: fileURL)
        defer { try? file.close() }
        let size = try file.seekToEnd()
        var headers = [
            "Access-Control-Allow-Origin": "*",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length"
        ]
        let body: Data
        let statusCode: Int
        switch parseRange(rangeHeader, size: size) {
        case .unsatisfiable:
            headers["Content-Type"] = "text/plain; charset=utf-8"
            headers["Content-Range"] = "bytes */\(size)"
            return ByteRangeResponse(statusCode: 416, headers: headers, body: Data())
        case let .partial(start, end):
            try file.seek(toOffset: start)
            let length = Int(end - start + 1)
            body = try file.read(upToCount: length) ?? Data()
            guard body.count == length else { throw CocoaError(.fileReadCorruptFile) }
            statusCode = 206
            headers["Content-Range"] = "bytes \(start)-\(end)/\(size)"
        case .ignored:
            try file.seek(toOffset: 0)
            body = try file.readToEnd() ?? Data()
            statusCode = 200
        }
        headers["Content-Type"] = contentType
        headers["Content-Length"] = String(body.count)
        headers["Accept-Ranges"] = "bytes"
        return ByteRangeResponse(statusCode: statusCode, headers: headers, body: body)
    }
}
