import Foundation

/**
 Import pipeline failure whose message always starts with a stable error code
 followed by ": " and a short technical detail. The JS layer maps the text
 before the first colon to a localized message and appends the detail with
 withErrorDetails.

 Codes: invalidUrl, downloadFailed, archiveTooLarge, invalidArchive,
 unsafeArchiveEntry, invalidFileName, fileNameConflict, projectExists,
 importFailed.

 Shared by ProjectFileNames, ProjectArchiveExtractor, and
 ProjectArchiveDownloader; the bridge surfaces it via
 error.localizedDescription.
 */
struct ProjectImportError: LocalizedError {
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

/**
 Rule A import file-name normalization. Project file ids never contain a
 dot, so every regular file directly inside a project's files/ directory must
 have an on-disk name equal to its file id (the part before the first dot).
 Names starting with "." and sub-directories are ignored; every other name
 must map to an id matching [A-Za-z0-9_-]{1,128}. The plan is fully validated
 before any rename is applied, and applied renames are rolled back
 best-effort in reverse order (still attempting the remaining reversals when
 one fails) if a rename fails.

 Only ever applied to app-owned copies (the imported staging copy inside app
 storage), never to the user's source folder. Pure Foundation so it stays
 unit-testable without UIKit.
 */
enum ProjectFileNames {
    static let fileIdPattern = "^[A-Za-z0-9_-]{1,128}$"

    struct Rename {
        let source: URL
        let target: URL
        let fileId: String
    }

    /**
     Returns the file id for a direct child name: nil when the name starts
     with "." (ignored), the name itself when it has no dot (already the id),
     or the part before the first dot.
     */
    static func fileIdOf(name: String) -> String? {
        guard !name.hasPrefix(".") else {
            return nil
        }
        guard let dotIndex = name.firstIndex(of: ".") else {
            return name
        }
        return String(name[name.startIndex..<dotIndex])
    }

    /**
     Plans and applies normalization in place, returning how many files were
     renamed. Idempotent.
     */
    static func normalize(filesDirectory: URL) throws -> Int {
        try apply(renames: plan(filesDirectory: filesDirectory))
    }

    static func plan(filesDirectory: URL) throws -> [Rename] {
        var renames: [Rename] = []
        // Case-insensitive id map: macOS and Windows file systems (where
        // these folders usually come from) treat ABC.png and abc.png as the
        // same file, so their ids must not both exist.
        var ids: [String: String] = [:]
        let fileManager = FileManager.default

        guard let children = try fileManager.contentsOfDirectory(
            at: filesDirectory,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: []
        ) as [URL]? else {
            throw ProjectImportError("importFailed", "Cannot read files directory.")
        }

        var isDirectoryValue = ObjCBool(false)
        for child in children.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            guard fileManager.fileExists(atPath: child.path, isDirectory: &isDirectoryValue) else {
                continue
            }
            if isDirectoryValue.boolValue {
                continue
            }
            let name = child.lastPathComponent
            guard let fileId = fileIdOf(name: name) else {
                continue
            }
            guard fileId.range(of: fileIdPattern, options: .regularExpression) != nil else {
                throw ProjectImportError("invalidFileName", name)
            }
            let key = fileId.lowercased()
            if let existingName = ids[key] {
                throw ProjectImportError(
                    "fileNameConflict",
                    "\(existingName) and \(name) both map to \(fileId)"
                )
            }
            ids[key] = name
            if fileId != name {
                renames.append(
                    Rename(
                        source: child,
                        target: filesDirectory.appendingPathComponent(fileId),
                        fileId: fileId
                    )
                )
            }
        }

        // The target must not already exist as a different entry (for
        // example a directory named abc next to abc.png).
        for rename in renames {
            if fileManager.fileExists(atPath: rename.target.path) {
                throw ProjectImportError(
                    "fileNameConflict",
                    "\(rename.source.lastPathComponent) maps to existing \(rename.fileId)"
                )
            }
        }

        return renames
    }

    private static func apply(renames: [Rename]) throws -> Int {
        let fileManager = FileManager.default
        var applied: [Rename] = []
        applied.reserveCapacity(renames.count)

        for rename in renames {
            do {
                try fileManager.moveItem(at: rename.source, to: rename.target)
            } catch {
                // Roll back the already-applied renames best-effort in
                // reverse order; one failed reversal must not stop the
                // remaining ones from being attempted.
                for appliedRename in applied.reversed() {
                    try? fileManager.moveItem(at: appliedRename.target, to: appliedRename.source)
                }
                throw ProjectImportError(
                    "importFailed",
                    "Failed to rename \(rename.source.lastPathComponent)."
                )
            }
            applied.append(rename)
        }

        return applied.count
    }
}
