import Foundation
import Darwin

/**
 Native-owned temporary folders, addressed by an opaque UUID:
 tmp/project-import/<tempFolderId>/. JavaScript decides what goes inside; every
 path it passes is relative to its temporary folder and validated here.
 */
enum TempFolders {
    private static let maxAge: TimeInterval = 24 * 60 * 60

    static var root: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("project-import", isDirectory: true)
    }

    /// Creates a temporary folder after removing the ones older than 24 hours.
    static func create() throws -> String {
        sweep()
        let tempFolderId = UUID().uuidString
        do {
            try FileManager.default.createDirectory(
                at: root.appendingPathComponent(tempFolderId, isDirectory: true),
                withIntermediateDirectories: true
            )
        } catch {
            throw CodedError("importFailed", "Cannot create the temporary folder: \(error.localizedDescription)")
        }
        return tempFolderId
    }

    /// Deletes a temporary folder recursively. A folder that is already gone is fine.
    static func remove(tempFolderId: String) throws {
        let folder = try folderURL(tempFolderId: tempFolderId)
        guard FileOps.fileType(folder) != nil else {
            return
        }
        do {
            try FileManager.default.removeItem(at: folder)
        } catch {
            throw CodedError("importFailed", "Cannot remove the temporary folder: \(error.localizedDescription)")
        }
    }

    /// The temporary folder itself; it must exist.
    static func existingFolder(tempFolderId: String) throws -> URL {
        let folder = try folderURL(tempFolderId: tempFolderId)
        guard FileOps.fileType(folder) == mode_t(S_IFDIR) else {
            throw CodedError("importFailed", "The temporary folder does not exist.")
        }
        return folder
    }

    /// A location inside a temporary folder. The location itself may not exist yet.
    static func resolve(tempFolderId: String, path: String) throws -> URL {
        var url = try existingFolder(tempFolderId: tempFolderId)
        for segment in try segments(of: path) {
            url.appendPathComponent(segment)
        }
        return url
    }

    /// Like resolve, for a file that is about to be created: missing parent folders are created.
    static func resolveNewFile(tempFolderId: String, path: String) throws -> URL {
        let names = try segments(of: path)
        var created: [URL] = []
        let parent = try FileOps.walk(
            try existingFolder(tempFolderId: tempFolderId),
            Array(names.dropLast()),
            create: true,
            created: &created
        )
        return parent.appendingPathComponent(names[names.count - 1])
    }

    /**
     Splits a relative path into names. Anything that could leave the folder is
     rejected: an absolute path, an empty, "." or ".." segment, a backslash, a
     colon or a NUL.
     */
    static func segments(of path: String, code: String = "importFailed") throws -> [String] {
        let names = path.components(separatedBy: "/")
        let isUnsafe = path.unicodeScalars.contains { $0 == "\0" || $0 == "\\" || $0 == ":" }
            || names.contains { $0.isEmpty || $0 == "." || $0 == ".." }
        if isUnsafe {
            throw CodedError(code, "Unsafe path: \(path)")
        }
        return names
    }

    private static func folderURL(tempFolderId: String) throws -> URL {
        guard UUID(uuidString: tempFolderId) != nil else {
            throw CodedError("importFailed", "Invalid temporary folder id.")
        }
        return root.appendingPathComponent(tempFolderId, isDirectory: true)
    }

    private static func sweep() {
        let keys: Set<URLResourceKey> = [.contentModificationDateKey]
        guard let children = try? FileManager.default.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: Array(keys),
            options: [.skipsHiddenFiles]
        ) else {
            return
        }
        let cutoff = Date().addingTimeInterval(-maxAge)
        for child in children {
            if let modified = (try? child.resourceValues(forKeys: keys))?.contentModificationDate, modified < cutoff {
                try? FileManager.default.removeItem(at: child)
            }
        }
    }
}

/// Small filesystem operations shared by the bridge methods.
enum FileOps {
    /// The lstat file type (S_IFDIR, S_IFLNK, ...), or nil when nothing is there.
    static func fileType(_ url: URL) -> mode_t? {
        var info = stat()
        guard lstat(url.path, &info) == 0 else {
            return nil
        }
        return mode_t(info.st_mode) & mode_t(S_IFMT)
    }

    /// Creates a new file for writing. An existing file or symlink is an error.
    static func createExclusive(_ url: URL) throws -> FileHandle {
        let descriptor = open(url.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode_t(0o600))
        guard descriptor >= 0 else {
            let reason = errno == EEXIST ? "it already exists" : String(cString: strerror(errno))
            throw CodedError("writeFailed", "Cannot create \(url.lastPathComponent): \(reason)")
        }
        return FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
    }

    /**
     Walks `names` below `root` one lstat at a time, so nothing is ever read or
     written through a symlink. Missing folders are created (and appended to
     `created`) when `create` is true.
     */
    static func walk(_ root: URL, _ names: [String], create: Bool, created: inout [URL]) throws -> URL {
        var url = root
        for name in names {
            url.appendPathComponent(name, isDirectory: true)
            switch fileType(url) {
            case mode_t(S_IFDIR):
                continue
            case mode_t(S_IFLNK):
                throw CodedError("unsafeArchiveEntry", "Folder is a symbolic link: \(name)")
            case nil where create:
                guard mkdir(url.path, mode_t(0o700)) == 0 else {
                    throw CodedError("importFailed", "Cannot create folder \(name): \(String(cString: strerror(errno)))")
                }
                created.append(url)
            case nil:
                throw CodedError("importFailed", "Folder not found: \(name)")
            default:
                throw CodedError("importFailed", "Not a folder: \(name)")
            }
        }
        return url
    }

    /// Copies a file into a NEW file with a size limit. The partial copy is removed on failure.
    static func copy(from source: URL, to destination: URL, maxBytes: UInt64) throws -> UInt64 {
        if let size = (try? source.resourceValues(forKeys: [.fileSizeKey]))?.fileSize, UInt64(size) > maxBytes {
            throw CodedError("tooLarge", "The file is larger than \(maxBytes) bytes.")
        }
        let input: FileHandle
        do {
            input = try FileHandle(forReadingFrom: source)
        } catch {
            throw CodedError("importFailed", "Cannot read the selected file: \(error.localizedDescription)")
        }
        defer { try? input.close() }
        let output = try createExclusive(destination)
        var total: UInt64 = 0
        do {
            defer { try? output.close() }
            // The throwing read and write APIs: the legacy ones raise Objective-C
            // exceptions on I/O failures, which Swift cannot catch.
            while let chunk = try input.read(upToCount: 256 * 1024), !chunk.isEmpty {
                total += UInt64(chunk.count)
                if total > maxBytes {
                    throw CodedError("tooLarge", "The file is larger than \(maxBytes) bytes.")
                }
                try output.write(contentsOf: chunk)
            }
        } catch {
            try? FileManager.default.removeItem(at: destination)
            throw error
        }
        return total
    }

    /// The entries of a folder as { name, kind, size }; kind is file, directory, symlink or other.
    static func listDirectory(_ url: URL) throws -> [[String: Any]] {
        let keys: Set<URLResourceKey> = [.isSymbolicLinkKey, .isDirectoryKey, .isRegularFileKey, .fileSizeKey]
        let children = try FileManager.default.contentsOfDirectory(
            at: url,
            includingPropertiesForKeys: Array(keys),
            options: []
        )
        return try children.sorted { $0.lastPathComponent < $1.lastPathComponent }.map { child in
            let values = try child.resourceValues(forKeys: keys)
            var kind = "other"
            var size = 0
            // A symlink is checked first: isDirectory follows it.
            if values.isSymbolicLink == true {
                kind = "symlink"
            } else if values.isDirectory == true {
                kind = "directory"
            } else if values.isRegularFile == true {
                kind = "file"
                size = values.fileSize ?? 0
            }
            return ["name": child.lastPathComponent, "kind": kind, "size": size]
        }
    }

    /**
     Renames files directly inside `directory`. Each `from` must exist and each
     `to` must not; nothing is overwritten.
     */
    static func rename(_ renames: [(from: String, to: String)], in directory: URL) throws {
        for rename in renames {
            let source = directory.appendingPathComponent(rename.from)
            let target = directory.appendingPathComponent(rename.to)
            guard fileType(source) != nil else {
                throw CodedError("importFailed", "Cannot rename \(rename.from): it does not exist.")
            }
            guard fileType(target) == nil else {
                throw CodedError("importFailed", "Cannot rename \(rename.from) to \(rename.to): the name is taken.")
            }
            try FileManager.default.moveItem(at: source, to: target)
        }
    }
}
