import Foundation

// The encrypted game package in the app bundle, read through the RouteVN
// player library. Reads may come from several threads; the library
// serializes them.
final class PlayerPackage {
    static let resourceName = "routevn-package.bin"

    let length: UInt64
    private let handle: OpaquePointer

    private init(handle: OpaquePointer) {
        self.handle = handle
        length = routevn_package_length(handle)
    }

    static func openBundled() -> PlayerPackage? {
        let url = Bundle.main.bundleURL.appendingPathComponent(resourceName)
        guard let handle = url.path.withCString({ routevn_package_open($0) }) else {
            return nil
        }
        return PlayerPackage(handle: handle)
    }

    // Decrypted bytes from `position`, at most `count` of them. Empty at the
    // end of the package.
    func read(at position: UInt64, count: Int) throws -> Data {
        var data = Data(count: count)
        let copied = data.withUnsafeMutableBytes { buffer in
            routevn_package_read(
                handle,
                position,
                buffer.bindMemory(to: UInt8.self).baseAddress,
                count
            )
        }
        guard copied >= 0, copied <= count else {
            throw CocoaError(.fileReadCorruptFile)
        }
        data.count = Int(copied)
        return data
    }

    deinit {
        routevn_package_close(handle)
    }
}
