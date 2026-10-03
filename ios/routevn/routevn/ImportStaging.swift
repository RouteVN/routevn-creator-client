import Foundation
import Darwin

/**
 Import failure whose message is always "<code>: <detail>". The code is one of
 invalidUrl, downloadFailed, archiveTooLarge, invalidArchive,
 unsafeArchiveEntry or importFailed; JavaScript maps it to a localized message.
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
 Native-owned temporary folders for imports, addressed by an opaque UUID:
 tmp/project-import/<stagingId>/. JavaScript decides what goes inside; every
 path it passes is relative to the staging folder and validated here.
 */
enum ImportStaging {
    private static let maxAge: TimeInterval = 24 * 60 * 60

    static var root: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("project-import", isDirectory: true)
    }

    /// Creates a staging folder after removing the ones older than 24 hours.
    static func create() throws -> String {
        sweep()
        let stagingId = UUID().uuidString
        do {
            try FileManager.default.createDirectory(
                at: root.appendingPathComponent(stagingId, isDirectory: true),
                withIntermediateDirectories: true
            )
        } catch {
            throw ProjectImportError("importFailed", "Cannot create the import folder: \(error.localizedDescription)")
        }
        return stagingId
    }

    /// Deletes a staging folder recursively. A folder that is already gone is fine.
    static func remove(stagingId: String) throws {
        let folder = try folderURL(stagingId: stagingId)
        guard ImportFiles.fileType(folder) != nil else {
            return
        }
        do {
            try FileManager.default.removeItem(at: folder)
        } catch {
            throw ProjectImportError("importFailed", "Cannot remove the import folder: \(error.localizedDescription)")
        }
    }

    /// The staging folder itself; it must exist.
    static func existingFolder(stagingId: String) throws -> URL {
        let folder = try folderURL(stagingId: stagingId)
        guard ImportFiles.fileType(folder) == mode_t(S_IFDIR) else {
            throw ProjectImportError("importFailed", "The import folder does not exist.")
        }
        return folder
    }

    /// A location inside a staging folder. The location itself may not exist yet.
    static func resolve(stagingId: String, path: String) throws -> URL {
        var url = try existingFolder(stagingId: stagingId)
        for segment in try segments(of: path) {
            url.appendPathComponent(segment)
        }
        return url
    }

    /// Like resolve, for a file that is about to be created: missing parent folders are created.
    static func resolveNewFile(stagingId: String, path: String) throws -> URL {
        let names = try segments(of: path)
        var created: [URL] = []
        let parent = try ImportFiles.walk(
            try existingFolder(stagingId: stagingId),
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
            throw ProjectImportError(code, "Unsafe path: \(path)")
        }
        return names
    }

    private static func folderURL(stagingId: String) throws -> URL {
        guard UUID(uuidString: stagingId) != nil else {
            throw ProjectImportError("importFailed", "Invalid staging id.")
        }
        return root.appendingPathComponent(stagingId, isDirectory: true)
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

/// Small filesystem operations shared by the import bridge methods.
enum ImportFiles {
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
            throw ProjectImportError("importFailed", "Cannot create \(url.lastPathComponent): \(reason)")
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
                throw ProjectImportError("unsafeArchiveEntry", "Folder is a symbolic link: \(name)")
            case nil where create:
                guard mkdir(url.path, mode_t(0o700)) == 0 else {
                    throw ProjectImportError("importFailed", "Cannot create folder \(name): \(String(cString: strerror(errno)))")
                }
                created.append(url)
            case nil:
                throw ProjectImportError("importFailed", "Folder not found: \(name)")
            default:
                throw ProjectImportError("importFailed", "Not a folder: \(name)")
            }
        }
        return url
    }

    /// Copies a file into a NEW file with a size limit. The partial copy is removed on failure.
    static func copy(from source: URL, to destination: URL, maxBytes: UInt64) throws -> UInt64 {
        if let size = (try? source.resourceValues(forKeys: [.fileSizeKey]))?.fileSize, UInt64(size) > maxBytes {
            throw ProjectImportError("archiveTooLarge", "The file is larger than \(maxBytes) bytes.")
        }
        let input: FileHandle
        do {
            input = try FileHandle(forReadingFrom: source)
        } catch {
            throw ProjectImportError("importFailed", "Cannot read the selected file: \(error.localizedDescription)")
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
                    throw ProjectImportError("archiveTooLarge", "The file is larger than \(maxBytes) bytes.")
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
                throw ProjectImportError("importFailed", "Cannot rename \(rename.from): it does not exist.")
            }
            guard fileType(target) == nil else {
                throw ProjectImportError("importFailed", "Cannot rename \(rename.from) to \(rename.to): the name is taken.")
            }
            try FileManager.default.moveItem(at: source, to: target)
        }
    }
}

/**
 Sends { current, total } to the delivery closure: the first event is sent by
 start (current 0), events in between at most once per 100 ms, and finish
 always sends. Delivery is fire and forget, so it can never fail an import.
 */
final class ImportProgress {
    private let deliver: (_ current: UInt64, _ total: UInt64) -> Void
    private let lock = NSLock()
    private var total: UInt64 = 0
    private var lastEventAt: TimeInterval = 0

    init(deliver: @escaping (_ current: UInt64, _ total: UInt64) -> Void) {
        self.deliver = deliver
    }

    func start(total: UInt64 = 0) {
        send(current: 0, total: total, force: true)
    }

    func update(current: UInt64) {
        send(current: current, total: nil, force: false)
    }

    func finish(current: UInt64) {
        send(current: current, total: nil, force: true)
    }

    private func send(current: UInt64, total newTotal: UInt64?, force: Bool) {
        lock.lock()
        defer { lock.unlock() }
        if let newTotal {
            total = newTotal
        }
        let now = ProcessInfo.processInfo.systemUptime
        guard force || now - lastEventAt >= 0.1 else {
            return
        }
        lastEventAt = now
        deliver(current, total)
    }
}
