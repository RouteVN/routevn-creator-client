import Foundation
import Darwin
import ZIPFoundation

/**
 Reads and extracts zip files with ZIPFoundation. This does no layout checks:
 the caller lists the entries and chooses which ones to extract and where.
 */
enum ImportArchive {
    /// The most entries extract accepts, the limit JavaScript passes to list.
    static let entryLimit = 50_000

    /// The entries of the zip as { name, size, isDirectory }, with the raw names.
    static func list(_ archiveURL: URL, maxEntries: Int) throws -> [[String: Any]] {
        let (archive, declared) = try openArchive(archiveURL, maxEntries: maxEntries)
        var entries: [[String: Any]] = []
        for entry in archive {
            entries.append([
                "name": entry.path,
                "size": NSNumber(value: entry.uncompressedSize),
                "isDirectory": entry.type == .directory
            ])
        }
        try checkComplete(entries.count, declared)
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
        let (archive, declared) = try openArchive(archiveURL, maxEntries: entryLimit)
        let wanted = Set(files.map(\.entry))
        var found: [String: Entry] = [:]
        var seen = 0
        for entry in archive {
            seen += 1
            guard wanted.contains(entry.path) else { continue }
            guard found.updateValue(entry, forKey: entry.path) == nil else {
                throw ProjectImportError("invalidArchive", "The zip has several entries named \(entry.path).")
            }
        }
        try checkComplete(seen, declared)

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

    /// Opens the zip after checkStructure, with the number of entries it declares.
    private static func openArchive(_ url: URL, maxEntries: Int) throws -> (archive: Archive, declared: Int) {
        guard ImportFiles.fileType(url) == mode_t(S_IFREG) else {
            throw ProjectImportError("importFailed", "The archive file does not exist.")
        }
        let declared = try checkStructure(url, maxEntries: maxEntries)
        do {
            return (try Archive(url: url, accessMode: .read), declared)
        } catch {
            throw ProjectImportError("invalidArchive", "The file is not a readable zip.")
        }
    }

    /// ZIPFoundation ends the entry list without an error at an entry it cannot
    /// read, such as an encrypted one, so a short list means a damaged zip.
    private static func checkComplete(_ seen: Int, _ declared: Int) throws {
        guard seen == declared else {
            throw ProjectImportError("invalidArchive", "Incomplete entry list: read \(seen) of \(declared) entries.")
        }
    }

    /**
     Checks the zip's structure before ZIPFoundation reads it and returns the
     number of entries it declares. ZIPFoundation 0.9.20 crashes (a Swift trap,
     which cannot be caught) on offsets and sizes above Int64.max, so the end
     records and every central directory record are read here the way
     ZIPFoundation reads them, and anything it could trip on is invalidArchive:
     - The last end record signature in the file, which ZIPFoundation uses,
       must be the end record, with a comment of at most 1024 bytes that ends
       the file.
     - A zip64 end record is used whenever its locator and its 56 bytes sit
       right before the end record, as ZIPFoundation does. Zip64 markers
       without one are an error.
     - At most maxEntries entries and a central directory of at most 64 MiB
       that ends where the end records start and starts at its recorded
       offset, which is where ZIPFoundation reads it.
     - Each record: names of at most 4096 bytes, no encryption, well-formed
       extra fields, and a local header offset, compressed size and
       uncompressed size (zip64 values where ZIPFoundation uses them) that
       stay inside the file or within Int64.
     */
    private static func checkStructure(_ url: URL, maxEntries: Int) throws -> Int {
        func invalid(_ detail: String) -> ProjectImportError {
            ProjectImportError("invalidArchive", detail)
        }
        let file: FileHandle
        do {
            file = try FileHandle(forReadingFrom: url)
        } catch {
            throw ProjectImportError("importFailed", "Cannot read the archive: \(error.localizedDescription)")
        }
        defer { try? file.close() }
        func read(at offset: UInt64, count: Int) throws -> [UInt8] {
            guard count > 0 else { return [] }
            let data: Data?
            do {
                try file.seek(toOffset: offset)
                data = try file.read(upToCount: count)
            } catch {
                throw invalid("The zip cannot be read.")
            }
            guard let data, data.count == count else { throw invalid("The zip is truncated.") }
            return [UInt8](data)
        }
        let length: UInt64
        do {
            length = try file.seekToEnd()
        } catch {
            throw invalid("The zip cannot be read.")
        }
        guard length >= 22 else { throw invalid("The file is too small to be a zip.") }

        let tailStart = length - min(length, 76 + 22 + 65_535)
        let tail = try read(at: tailStart, count: Int(length - tailStart))
        var end = tail.count - 22
        while end >= 0, try uint(tail, end, 4) != 0x0605_4b50 {
            end -= 1
        }
        guard end >= 0, try UInt64(end + 22) + uint(tail, end + 20, 2) == UInt64(tail.count) else {
            throw invalid("The zip has no valid end record.")
        }
        guard try uint(tail, end + 20, 2) <= 1024 else { throw invalid("The zip comment is too long.") }
        let endRecord = tailStart + UInt64(end)
        var count = try uint(tail, end + 10, 2)
        var size = try uint(tail, end + 12, 4)
        var offset = try uint(tail, end + 16, 4)
        var directoryEnd = endRecord
        if endRecord > 76,
           try uint(tail, end - 20, 4) == 0x0706_4b50,
           try uint(tail, end - 76, 4) == 0x0606_4b50,
           try uint(tail, end - 62, 2) >= 45 {
            guard try uint(tail, end - 12, 8) == endRecord - 76 else {
                throw invalid("The zip64 end record is misplaced.")
            }
            count = try uint(tail, end - 44, 8)
            size = try uint(tail, end - 36, 8)
            offset = try uint(tail, end - 28, 8)
            directoryEnd = endRecord - 76
        } else if count == 0xFFFF || size == 0xFFFF_FFFF || offset == 0xFFFF_FFFF {
            throw invalid("The zip64 end record is missing.")
        }
        guard let declared = Int(exactly: count), declared <= maxEntries else {
            throw invalid("The zip has more than \(maxEntries) entries.")
        }
        guard let byteCount = Int(exactly: size), byteCount <= 64 << 20, declared <= byteCount / 46,
              size <= directoryEnd, offset == directoryEnd - size else {
            throw invalid("The zip's central directory is damaged.")
        }

        let directory = try read(at: offset, count: byteCount)
        var at = 0
        for _ in 0..<declared {
            guard try uint(directory, at, 4) == 0x0201_4b50 else {
                throw invalid("The zip's central directory is damaged.")
            }
            let versionNeeded = try uint(directory, at + 6, 2)
            let flags = try uint(directory, at + 8, 2)
            let method = try uint(directory, at + 10, 2)
            let compressed32 = try uint(directory, at + 20, 4)
            let uncompressed32 = try uint(directory, at + 24, 4)
            let nameLength = Int(try uint(directory, at + 28, 2))
            let extraStart = at + 46 + nameLength
            let extraEnd = extraStart + Int(try uint(directory, at + 30, 2))
            let next = extraEnd + Int(try uint(directory, at + 32, 2))
            let disk = try uint(directory, at + 34, 2)
            let offset32 = try uint(directory, at + 42, 4)
            guard nameLength <= 4096 else { throw invalid("An entry name is too long.") }
            guard flags & 1 == 0 else { throw invalid("The zip has an encrypted entry.") }
            guard next <= directory.count else { throw invalid("The zip's central directory is damaged.") }

            // ZIPFoundation takes the first zip64 field (id 1) and reads the
            // values of the 32-bit fields that are all ones, in this order.
            var zip64: (uncompressed: UInt64, compressed: UInt64, offset: UInt64)?
            var cursor = extraStart
            while cursor < extraEnd {
                guard extraEnd - cursor >= 4 else { throw invalid("An entry has a damaged extra field.") }
                let dataEnd = cursor + 4 + Int(try uint(directory, cursor + 2, 2))
                guard dataEnd <= extraEnd else { throw invalid("An entry has a damaged extra field.") }
                if try uint(directory, cursor, 2) == 1, zip64 == nil {
                    var field = cursor + 4
                    func value(_ isMarked: Bool, _ width: Int) throws -> UInt64 {
                        guard isMarked else { return 0 }
                        defer { field += width }
                        return try uint(directory, field, width)
                    }
                    zip64 = (
                        uncompressed: try value(uncompressed32 == 0xFFFF_FFFF, 8),
                        compressed: try value(compressed32 == 0xFFFF_FFFF, 8),
                        offset: try value(offset32 == 0xFFFF_FFFF, 8)
                    )
                    _ = try value(disk == 0xFFFF, 4)
                    guard field == dataEnd else { throw invalid("An entry has a damaged zip64 field.") }
                }
                cursor = dataEnd
            }
            let isZip64 = versionNeeded & 0xFF >= 45 || zip64 != nil
            func effective(_ value32: UInt64, _ value64: UInt64?) -> UInt64 {
                if isZip64, let value64, value64 > 0 { return value64 }
                return value32
            }
            // ZIPFoundation seeks to the local header and past the data with
            // these (a stored entry's data is its uncompressed size) and
            // converts the sizes to Int64.
            let localOffset = effective(offset32, zip64?.offset)
            let compressed = effective(compressed32, zip64?.compressed)
            let uncompressed = effective(uncompressed32, zip64?.uncompressed)
            guard localOffset < length, compressed <= length,
                  uncompressed <= (method == 0 ? length : UInt64(Int64.max)) else {
                throw invalid("An entry has an impossible offset or size.")
            }
            at = next
        }
        guard at == directory.count else { throw invalid("The zip's central directory is damaged.") }
        return declared
    }

    /// The little-endian unsigned integer of `width` bytes at `at`.
    private static func uint(_ bytes: [UInt8], _ at: Int, _ width: Int) throws -> UInt64 {
        guard at >= 0, width <= 8, at <= bytes.count - width else {
            throw ProjectImportError("invalidArchive", "The zip is truncated.")
        }
        var value: UInt64 = 0
        for index in (at..<at + width).reversed() {
            value = value << 8 | UInt64(bytes[index])
        }
        return value
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
        var chunks = 0
        let checksum: CRC32
        do {
            checksum = try archive.extract(entry, skipCRC32: false) { data in
                // A stored entry gets one empty chunk only when it is empty.
                // More mean its data ended early, and ZIPFoundation would keep
                // reading empty chunks up to the size in the central directory.
                chunks += 1
                if data.isEmpty, !entry.isCompressed, chunks > 1 {
                    throw ProjectImportError("invalidArchive", "Entry data ends early: \(entry.path)")
                }
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
