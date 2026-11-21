import Foundation

@main
struct ByteRangeResponseNativeTests {
    static func main() throws {
        let fm = FileManager.default
        let directory = fm.temporaryDirectory.appendingPathComponent("routevn-range-test-\(UUID().uuidString)")
        try fm.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: directory) }
        let file = directory.appendingPathComponent("video.mp4")
        let size = 3 * 1024 * 1024
        let cap = 1000 * 1024
        let bytes = Data((0..<size).map { UInt8(($0 * 31 + $0 / 257) % 256) })
        try bytes.write(to: file)

        func response(_ header: String?, url: URL? = nil) throws -> ByteRangeResponse {
            let result = try ByteRangeResponse.make(fileURL: url ?? file, contentType: "video/mp4", rangeHeader: header)
            precondition(result.headers["Access-Control-Allow-Origin"] == "*")
            precondition(result.headers["Cross-Origin-Resource-Policy"] == "cross-origin")
            precondition(result.headers["Access-Control-Expose-Headers"] == "Content-Range, Accept-Ranges, Content-Length")
            return result
        }

        let full = try response(nil)
        precondition(full.statusCode == 200 && full.body == bytes)
        precondition(full.headers["Accept-Ranges"] == "bytes")
        precondition(full.headers["Content-Length"] == String(size))
        precondition(full.headers["Content-Type"] == "video/mp4")

        for (header, start, end) in [
            ("bytes=0-1", 0, 1),
            ("bytes=10-", 10, 10 + cap - 1),
            ("bytes=-8", size - 8, size - 1),
            ("bytes=\(size - 5)-\(size + 100)", size - 5, size - 1),
            ("bytes=-2097152", size - cap, size - 1),
            ("bytes=-\(size * 2)", size - cap, size - 1)
        ] {
            let result = try response(header)
            precondition(result.statusCode == 206, header)
            precondition(result.body == bytes.subdata(in: start..<(end + 1)), header)
            precondition(result.headers["Content-Range"] == "bytes \(start)-\(end)/\(size)", header)
            precondition(result.headers["Content-Length"] == String(end - start + 1), header)
            precondition(result.headers["Accept-Ranges"] == "bytes")
            precondition(result.headers["Content-Type"] == "video/mp4")
        }
        for header in ["bytes=\(size)-", "bytes=-0"] {
            let result = try response(header)
            precondition(result.statusCode == 416 && result.body.isEmpty)
            precondition(result.headers["Content-Range"] == "bytes */\(size)")
            precondition(result.headers["Content-Type"] == "text/plain; charset=utf-8")
        }
        for header in ["bytes=abc", "items=0-1", "bytes=0-1,4-5", "bytes=5-4", "bytes=-", "bytes=+1-2", "bytes=18446744073709551616-"] {
            let result = try response(header)
            precondition(result.statusCode == 200 && result.body == bytes, header)
        }
        let empty = directory.appendingPathComponent("empty")
        try Data().write(to: empty)
        for header in ["bytes=0-1", "bytes=-1"] {
            let result = try response(header, url: empty)
            precondition(result.statusCode == 416 && result.body.isEmpty)
            precondition(result.headers["Content-Range"] == "bytes */0")
        }
        print("Byte range response native tests passed")
    }
}
