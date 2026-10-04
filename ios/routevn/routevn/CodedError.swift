import Foundation

/**
 Native failure whose message is always "<code>: <detail>". The code is one of
 invalidUrl, downloadFailed, tooLarge, writeFailed, invalidArchive,
 unsafeArchiveEntry or importFailed; JavaScript maps it to a localized message.
 */
struct CodedError: LocalizedError {
    let code: String
    let detail: String

    init(_ code: String, _ detail: String = "") {
        self.code = code
        self.detail = detail
    }

    var errorDescription: String? {
        detail.isEmpty ? code : "\(code): \(detail)"
    }
}
