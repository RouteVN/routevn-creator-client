import Foundation

enum SaveFileDestinationError: LocalizedError {
    case unavailable, notDirectory, invalidFilename

    var errorDescription: String? {
        switch self {
        case .unavailable: return "Select the export folder again."
        case .notDirectory: return "The selected export folder is unavailable."
        case .invalidFilename: return "The export filename is invalid."
        }
    }
}

/// Keeps the exact security-scoped folder URL returned by Files. Output is built
/// locally first, then published under file coordination without replacing files.
final class SaveFileDestinations {
    private struct Selection {
        let folder: URL
        let filename: String
    }

    private var selections: [String: Selection] = [:]
    private let lock = NSLock()
    private let stagingRoot: URL

    init(stagingRoot: URL = FileManager.default.temporaryDirectory.appendingPathComponent("routevn-exports", isDirectory: true)) {
        self.stagingRoot = stagingRoot
    }

    static func isSaveURI(_ uri: String) -> Bool {
        URL(string: uri)?.scheme == "routevn-save"
    }

    func select(folder: URL, filename: String) throws -> String {
        guard !filename.isEmpty, filename != ".", filename != "..",
              !filename.contains("/"), !filename.contains("\\") else {
            throw SaveFileDestinationError.invalidFilename
        }
        let accessed = folder.startAccessingSecurityScopedResource()
        defer { if accessed { folder.stopAccessingSecurityScopedResource() } }
        guard try folder.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true else {
            throw SaveFileDestinationError.notDirectory
        }
        let uri = "routevn-save://selected/\(UUID().uuidString)"
        lock.lock()
        selections[uri] = Selection(folder: folder, filename: filename)
        lock.unlock()
        return uri
    }

    func write<Value>(to uri: String, build: (URL) throws -> Value) throws -> (url: URL, value: Value) {
        lock.lock()
        let selection = selections[uri]
        lock.unlock()
        guard let selection else { throw SaveFileDestinationError.unavailable }

        let fileManager = FileManager.default
        let stagingDirectory = stagingRoot.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fileManager.createDirectory(at: stagingDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: stagingDirectory) }
        let stagedFile = stagingDirectory.appendingPathComponent(selection.filename)
        let value = try build(stagedFile)

        let accessed = selection.folder.startAccessingSecurityScopedResource()
        defer { if accessed { selection.folder.stopAccessingSecurityScopedResource() } }
        var coordinationError: NSError?
        var operationError: Error?
        var publishedURL: URL?
        NSFileCoordinator().coordinate(writingItemAt: selection.folder, options: .forMerging, error: &coordinationError) { folder in
            do {
                guard try folder.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true else {
                    throw SaveFileDestinationError.notDirectory
                }
                let destination = self.availableFileURL(in: folder, filename: selection.filename)
                let partial = folder.appendingPathComponent(".routevn-export-\(UUID().uuidString).part")
                defer { try? fileManager.removeItem(at: partial) }
                try fileManager.copyItem(at: stagedFile, to: partial)
                // moveItem fails if a different writer created this filename.
                try fileManager.moveItem(at: partial, to: destination)
                publishedURL = destination
            } catch {
                operationError = error
            }
        }
        if let coordinationError { throw coordinationError }
        if let operationError { throw operationError }
        guard let publishedURL else { throw SaveFileDestinationError.unavailable }
        lock.lock()
        selections.removeValue(forKey: uri)
        lock.unlock()
        return (url: publishedURL, value: value)
    }

    private func availableFileURL(in folder: URL, filename: String) -> URL {
        let original = folder.appendingPathComponent(filename)
        let extensionSuffix = original.pathExtension.isEmpty ? "" : ".\(original.pathExtension)"
        let stem = original.deletingPathExtension().lastPathComponent
        var candidate = original
        var number = 2
        while FileManager.default.fileExists(atPath: candidate.path) {
            candidate = folder.appendingPathComponent("\(stem) (\(number))\(extensionSuffix)")
            number += 1
        }
        return candidate
    }
}
