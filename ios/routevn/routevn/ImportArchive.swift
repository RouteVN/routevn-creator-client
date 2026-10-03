import Foundation
import Darwin
import ZIPFoundation

/**
 Reads and extracts zip files with ZIPFoundation. This does no layout checks:
 the caller lists the entries and chooses which ones to extract and where.
 */
enum ImportArchive {
    /// The entries of the zip as { name, size, isDirectory }, with the raw names.
    static func list(_ archiveURL: URL, maxEntries: Int) throws -> [[String: Any]] {
        var entries: [[String: Any]] = []
        for entry in try openArchive(archiveURL) {
            guard entries.count < maxEntries else {
                throw ProjectImportError("invalidArchive", "The zip has more than \(maxEntries) entries.")
            }
            entries.append([
                "name": entry.path,
                "size": NSNumber(value: entry.uncompressedSize),
                "isDirectory": entry.type == .directory
            ])
        }
        return entries
    }

    /**
     Extracts only the requested entries, each to root/path. Missing folders are
     created, files are created exclusively and never through a symlink, and
     everything this call created is removed when it fails. Returns the number
     of requested entries and the bytes written.
     */
    static func extract(
        _ archiveURL: URL,
        to root: URL,
        files: [(entry: String, path: String)],
        maxBytes: UInt64,
        progress: ImportProgress?
    ) throws -> (files: Int, bytes: UInt64) {
        let archive = try openArchive(archiveURL)
        let wanted = Set(files.map(\.entry))
        var found: [String: Entry] = [:]
        for entry in archive where wanted.contains(entry.path) {
            guard found.updateValue(entry, forKey: entry.path) == nil else {
                throw ProjectImportError("invalidArchive", "The zip has several entries named \(entry.path).")
            }
        }

        // Everything is checked before anything is written.
        var plan: [(entry: Entry, names: [String])] = []
        var destinations = Set<String>()
        var total: UInt64 = 0
        for file in files {
            let names = try ImportStaging.segments(of: file.path, code: "unsafeArchiveEntry")
            guard root.appendingPathComponent(file.path).isContained(in: root) else {
                throw ProjectImportError("unsafeArchiveEntry", "Unsafe destination: \(file.path)")
            }
            let key = file.path.precomposedStringWithCanonicalMapping.lowercased()
            guard destinations.insert(key).inserted else {
                throw ProjectImportError("invalidArchive", "Two entries extract to \(file.path).")
            }
            guard let entry = found[file.entry] else {
                throw ProjectImportError("invalidArchive", "The zip has no entry named \(file.entry).")
            }
            if entry.type == .symlink {
                throw ProjectImportError("unsafeArchiveEntry", "Entry is a symbolic link: \(file.entry)")
            }
            let (sum, overflow) = total.addingReportingOverflow(entry.uncompressedSize)
            guard !overflow, sum <= maxBytes else {
                throw ProjectImportError("archiveTooLarge", "The entries expand beyond \(maxBytes) bytes.")
            }
            total = sum
            plan.append((entry, names))
        }

        // The topmost folder this call creates, so a failure can remove all of it.
        var topmost: URL?
        var probe = root
        while ImportFiles.fileType(probe) == nil {
            topmost = probe
            probe = probe.deletingLastPathComponent()
        }
        var created: [URL] = []
        var written: UInt64 = 0
        do {
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            guard ImportFiles.fileType(root) == mode_t(S_IFDIR) else {
                throw ProjectImportError("importFailed", "The destination is not a folder.")
            }
            progress?.start(total: total)
            for item in plan {
                if item.entry.type == .directory {
                    _ = try ImportFiles.walk(root, item.names, create: true, created: &created)
                    continue
                }
                let parent = try ImportFiles.walk(root, Array(item.names.dropLast()), create: true, created: &created)
                let target = parent.appendingPathComponent(item.names[item.names.count - 1])
                let output = try ImportFiles.createExclusive(target)
                created.append(target)
                try write(item.entry, from: archive, to: output, written: &written, maxBytes: maxBytes, progress: progress)
            }
        } catch {
            if let topmost {
                try? FileManager.default.removeItem(at: topmost)
            } else {
                for url in created.reversed() {
                    try? FileManager.default.removeItem(at: url)
                }
            }
            throw error
        }
        progress?.finish(current: written)
        return (files.count, written)
    }

    private static func openArchive(_ url: URL) throws -> Archive {
        guard ImportFiles.fileType(url) == mode_t(S_IFREG) else {
            throw ProjectImportError("importFailed", "The archive file does not exist.")
        }
        do {
            return try Archive(url: url, accessMode: .read)
        } catch {
            throw ProjectImportError("invalidArchive", "The file is not a readable zip.")
        }
    }

    /// Writes one entry, counting the bytes actually written and verifying its size and CRC32.
    private static func write(
        _ entry: Entry,
        from archive: Archive,
        to output: FileHandle,
        written: inout UInt64,
        maxBytes: UInt64,
        progress: ImportProgress?
    ) throws {
        defer { try? output.close() }
        var entryBytes: UInt64 = 0
        var total = written
        let checksum: CRC32
        do {
            checksum = try archive.extract(entry, skipCRC32: false) { data in
                entryBytes += UInt64(data.count)
                total += UInt64(data.count)
                guard total <= maxBytes else {
                    throw ProjectImportError("archiveTooLarge", "The entries expand beyond \(maxBytes) bytes.")
                }
                guard entryBytes <= entry.uncompressedSize else {
                    throw ProjectImportError("invalidArchive", "Entry is larger than declared: \(entry.path)")
                }
                do {
                    // The throwing API: the legacy write(_:) raises an uncatchable
                    // Objective-C exception when the disk is full.
                    try output.write(contentsOf: data)
                } catch {
                    throw ProjectImportError("importFailed", "Cannot write \(entry.path): \(error.localizedDescription)")
                }
                progress?.update(current: total)
            }
        } catch let error as ProjectImportError {
            throw error
        } catch {
            throw ProjectImportError("invalidArchive", "Entry is unreadable: \(entry.path)")
        }
        guard entryBytes == entry.uncompressedSize else {
            throw ProjectImportError("invalidArchive", "Size mismatch for \(entry.path): \(entryBytes) of \(entry.uncompressedSize) bytes.")
        }
        guard checksum == entry.checksum else {
            throw ProjectImportError("invalidArchive", "CRC32 mismatch for \(entry.path).")
        }
        written = total
    }
}
