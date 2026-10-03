import Foundation
import ZIPFoundation
import Darwin

/**
 Rule B archive extraction. Stages a project archive (zip) into the layout
 the shared project importer expects: project.db (+ -wal/-shm/-journal
 sidecars), files/ and file-metadata/. The project root is the zip root when
 it directly contains project.db, otherwise the single top-level directory
 that contains it; anything else is not a RouteVN archive.

 Only the entries listed above are extracted. __MACOSX trees, dot-prefixed
 basenames, and entries nested under sub-directories of files/ are skipped.
 Every entry name is validated against zip-slip (absolute paths, empty, "."
 and ".." segments, backslashes, drive prefixes, NUL) and symlink entries are
 rejected anywhere in the archive. Duplicated payload entries (same raw name
 or the same normalized path case-insensitively) are rejected. Limits (entry
 count, total uncompressed bytes, archive size) are enforced against declared
 sizes and against the actual bytes written, and the CRC32 of every extracted
 entry is verified so corrupt archives fail as invalidArchive.

 Temp locations: on iOS the caller stages into
 temporaryDirectory/project-import/<uuid>/extracted, a sibling of
 archive.zip, so the downloaded/picked archive is never inside the directory
 that is finally imported. The caller owns the staging directory and its
 cleanup.
 */
enum ProjectArchiveExtractor {
    static let defaultMaxEntries = 50_000
    static let defaultMaxTotalUncompressedBytes: UInt64 = 8 * 1024 * 1024 * 1024
    static let defaultMaxArchiveBytes: UInt64 = 4 * 1024 * 1024 * 1024
    // Reuses the Android/iOS export marker name and semantics: exports write
    // this marker while they are still running and remove it when finished.
    static let incompleteExportMarkerName = "ROUTEVN_EXPORT_INCOMPLETE.txt"

    private static let databaseEntryNames: Set<String> = [
        "project.db",
        "project.db-wal",
        "project.db-shm",
        "project.db-journal",
    ]
    private static let macosxRootName = "__MACOSX"

    /**
     A validated archive entry path split into non-empty segments. Pure
     value so entry-name validation stays unit-testable without an archive.
     */
    struct EntryPath {
        let raw: String
        let segments: [String]

        static func parse(_ raw: String, isDirectory: Bool) throws -> EntryPath {
            guard !raw.contains("\u{0}") else {
                throw ProjectImportError("unsafeArchiveEntry", "Entry name contains NUL: \(raw)")
            }
            guard !raw.contains("\\") else {
                throw ProjectImportError("unsafeArchiveEntry", "Entry name contains a backslash: \(raw)")
            }
            guard !raw.contains(":") else {
                throw ProjectImportError("unsafeArchiveEntry", "Entry name contains a colon: \(raw)")
            }
            guard !raw.hasPrefix("/") else {
                throw ProjectImportError("unsafeArchiveEntry", "Absolute entry name: \(raw)")
            }

            var name = raw
            if isDirectory && name.hasSuffix("/") {
                name.removeLast()
            }

            var segments: [String] = []
            for segment in name.split(separator: "/", omittingEmptySubsequences: false).map(String.init) {
                guard !segment.isEmpty else {
                    throw ProjectImportError("unsafeArchiveEntry", "Entry name has an empty segment: \(raw)")
                }
                guard segment != "." && segment != ".." else {
                    throw ProjectImportError("unsafeArchiveEntry", "Entry name escapes the archive: \(raw)")
                }
                segments.append(segment)
            }
            return EntryPath(raw: raw, segments: segments)
        }

        var isMacOSXMetadata: Bool {
            segments.first == ProjectArchiveExtractor.macosxRootName
        }

        var hasDotPrefixedComponent: Bool {
            segments.contains { $0.hasPrefix(".") }
        }
    }

    /**
     Extracts the project payload of the archive at archiveURL into
     stagingDirectory (created when missing). The files/ and file-metadata/
     directories are always present afterwards (empty when the archive has no
     such payload), and the staging root contains nothing else.
     */
    static func extract(
        archiveAt archiveURL: URL,
        to stagingDirectory: URL,
        maxEntries: Int = defaultMaxEntries,
        maxTotalUncompressedBytes: UInt64 = defaultMaxTotalUncompressedBytes,
        maxArchiveBytes: UInt64 = defaultMaxArchiveBytes,
        progressReporter: ProjectImportProgressReporter? = nil
    ) throws {
        let fileManager = FileManager.default
        let directory = try inspectCentralDirectory(
            at: archiveURL,
            maxEntries: maxEntries,
            maxTotalUncompressedBytes: maxTotalUncompressedBytes,
            maxArchiveBytes: maxArchiveBytes
        )

        let archive: Archive
        do {
            archive = try Archive(url: archiveURL, accessMode: .read)
        } catch {
            throw ProjectImportError("invalidArchive", "Archive is not a readable zip file.")
        }

        // Materialize every entry first so all validation (types, names,
        // root detection, limits, duplicates) happens before anything is
        // written.
        var entries: [Entry] = []
        for entry in archive {
            entries.append(entry)
            if entries.count > maxEntries {
                throw ProjectImportError("archiveTooLarge", "Archive has too many entries.")
            }
        }
        if UInt64(entries.count) != directory.entryCount {
            throw ProjectImportError("invalidArchive", "Archive iterator did not return every central-directory entry.")
        }

        var paths: [EntryPath] = []
        paths.reserveCapacity(entries.count)
        for entry in entries {
            paths.append(try EntryPath.parse(entry.path, isDirectory: isDirectoryEntry(entry)))
            if entry.type == .symlink {
                throw ProjectImportError("unsafeArchiveEntry", "Entry is a symlink: \(entry.path)")
            }
        }

        let rootSegments = try resolveProjectRoot(entries: entries, paths: paths)
        let payload = try selectPayload(entries: entries, paths: paths, rootSegments: rootSegments)
        var progressTotal: UInt64 = 0
        for item in payload {
            let (nextTotal, overflow) = progressTotal.addingReportingOverflow(item.entry.uncompressedSize)
            guard !overflow, nextTotal <= maxTotalUncompressedBytes else {
                throw ProjectImportError(
                    "archiveTooLarge",
                    "Archive declares more than \(maxTotalUncompressedBytes) uncompressed bytes."
                )
            }
            progressTotal = nextTotal
        }
        progressReporter?.start(.extracting, total: progressTotal)

        let stagingRoot = stagingDirectory.standardizedFileURL
        var rootInfo = stat()
        if stagingRoot.path.withCString({ lstat($0, &rootInfo) }) != 0 {
            guard errno == ENOENT else {
                throw ProjectImportError("importFailed", "Cannot inspect staging directory.")
            }
            try fileManager.createDirectory(at: stagingRoot, withIntermediateDirectories: true)
        }
        try requireSafeDirectory(stagingRoot)

        var writtenTotal: UInt64 = 0
        for item in payload {
            var targetURL = stagingRoot
            for component in item.relativeSegments {
                targetURL.appendPathComponent(component)
            }
            try ensureSafeParents(root: stagingRoot, segments: Array(item.relativeSegments.dropLast()))
            var targetInfo = stat()
            if targetURL.path.withCString({ lstat($0, &targetInfo) }) == 0 {
                if mode_t(targetInfo.st_mode) & mode_t(S_IFMT) == mode_t(S_IFLNK) {
                    throw ProjectImportError("unsafeArchiveEntry", "Entry target is a symlink: \(item.entry.path)")
                }
                throw ProjectImportError("invalidArchive", "Entry target already exists: \(item.entry.path)")
            }
            guard errno == ENOENT else {
                throw ProjectImportError("importFailed", "Cannot inspect staging file for \(item.entry.path).")
            }
            let descriptor = targetURL.path.withCString {
                open($0, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode_t(0o600))
            }
            guard descriptor >= 0 else {
                if errno == ELOOP {
                    throw ProjectImportError("unsafeArchiveEntry", "Entry target is a symlink: \(item.entry.path)")
                }
                if errno == EEXIST {
                    throw ProjectImportError("invalidArchive", "Entry target already exists: \(item.entry.path)")
                }
                throw ProjectImportError("importFailed", "Cannot create staging file for \(item.entry.path).")
            }
            do {
                let outputHandle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
                defer { outputHandle.closeFile() }
                writtenTotal = try writeEntry(
                    item.entry,
                    from: archive,
                    to: outputHandle,
                    runningTotal: writtenTotal,
                    maxTotalUncompressedBytes: maxTotalUncompressedBytes,
                    progressReporter: progressReporter
                )
            }
        }

        try ensureSafeParents(root: stagingRoot, segments: ["files"])
        try ensureSafeParents(root: stagingRoot, segments: ["file-metadata"])
        try assertProjectLayout(in: stagingRoot)
        progressReporter?.finish(current: progressTotal)
    }

    // MARK: - Strict central-directory view

    private struct CentralDirectory {
        let entryCount: UInt64
    }

    private static func isDirectoryEntry(_ entry: Entry) -> Bool {
        entry.type == .directory || entry.path.hasSuffix("/")
    }

    private static func littleEndian(_ data: Data, _ offset: Int, _ count: Int) -> UInt64 {
        var value: UInt64 = 0
        for index in 0..<count {
            value |= UInt64(data[offset + index]) << (index * 8)
        }
        return value
    }

    private static func readExactly(_ handle: FileHandle, at offset: UInt64, count: Int) throws -> Data {
        try handle.seek(toOffset: offset)
        var data = Data()
        while data.count < count {
            let chunkLength = min(65_536, count - data.count)
            guard let chunk = try handle.read(upToCount: chunkLength), !chunk.isEmpty else {
                throw ProjectImportError("invalidArchive", "Archive ends inside the central directory.")
            }
            data.append(chunk)
        }
        return data
    }

    private static func inspectCentralDirectory(
        at archiveURL: URL,
        maxEntries: Int,
        maxTotalUncompressedBytes: UInt64,
        maxArchiveBytes: UInt64
    ) throws -> CentralDirectory {
        let handle: FileHandle
        do {
            handle = try FileHandle(forReadingFrom: archiveURL)
        } catch {
            throw ProjectImportError("invalidArchive", "Archive cannot be read.")
        }
        defer { handle.closeFile() }

        do {
            let fileLength = try handle.seekToEnd()
            guard fileLength <= maxArchiveBytes else {
                throw ProjectImportError("archiveTooLarge", "Archive is larger than \(maxArchiveBytes) bytes.")
            }
            guard fileLength >= 22 else {
                throw ProjectImportError("invalidArchive", "End-of-central-directory record is missing.")
            }
            let tailLength = Int(min(fileLength, 65_557))
            let tailOffset = fileLength - UInt64(tailLength)
            let tail = try readExactly(handle, at: tailOffset, count: tailLength)
            var eocdOffsets: [UInt64] = []
            for position in 0...(tailLength - 22) {
                guard littleEndian(tail, position, 4) == 0x06054b50 else { continue }
                let commentLength = littleEndian(tail, position + 20, 2)
                if tailOffset + UInt64(position) + 22 + commentLength == fileLength {
                    eocdOffsets.append(tailOffset + UInt64(position))
                }
            }
            guard eocdOffsets.count == 1, let eocdOffset = eocdOffsets.first else {
                throw ProjectImportError("invalidArchive", "Archive must have exactly one final end record.")
            }
            let eocd = try readExactly(handle, at: eocdOffset, count: 22)
            guard littleEndian(eocd, 4, 2) == 0,
                  littleEndian(eocd, 6, 2) == 0,
                  littleEndian(eocd, 8, 2) == littleEndian(eocd, 10, 2) else {
                throw ProjectImportError("invalidArchive", "Multi-disk archives are unsupported.")
            }

            let classicCount = littleEndian(eocd, 10, 2)
            let classicSize = littleEndian(eocd, 12, 4)
            let classicOffset = littleEndian(eocd, 16, 4)
            let needsZip64 = classicCount == 0xffff || classicSize == 0xffffffff || classicOffset == 0xffffffff
            var entryCount = classicCount
            var directorySize = classicSize
            var directoryOffset = classicOffset
            var directoryEnd = eocdOffset

            if eocdOffset >= 20 {
                let locatorOffset = eocdOffset - 20
                let locator = try readExactly(handle, at: locatorOffset, count: 20)
                if littleEndian(locator, 0, 4) == 0x07064b50 {
                    guard littleEndian(locator, 4, 4) == 0,
                          littleEndian(locator, 16, 4) == 1 else {
                        throw ProjectImportError("invalidArchive", "Multi-disk zip64 archive is unsupported.")
                    }
                    let zip64Offset = littleEndian(locator, 8, 8)
                    guard zip64Offset <= locatorOffset, locatorOffset - zip64Offset >= 56 else {
                        throw ProjectImportError("invalidArchive", "Zip64 end record is misplaced.")
                    }
                    let zip64 = try readExactly(handle, at: zip64Offset, count: 56)
                    let recordSize = littleEndian(zip64, 4, 8)
                    guard littleEndian(zip64, 0, 4) == 0x06064b50,
                          recordSize >= 44,
                          recordSize <= locatorOffset - zip64Offset - 12,
                          zip64Offset + 12 + recordSize == locatorOffset,
                          littleEndian(zip64, 16, 4) == 0,
                          littleEndian(zip64, 20, 4) == 0,
                          littleEndian(zip64, 24, 8) == littleEndian(zip64, 32, 8) else {
                        throw ProjectImportError("invalidArchive", "Zip64 end record is invalid.")
                    }
                    entryCount = littleEndian(zip64, 32, 8)
                    directorySize = littleEndian(zip64, 40, 8)
                    directoryOffset = littleEndian(zip64, 48, 8)
                    directoryEnd = zip64Offset
                } else if needsZip64 {
                    throw ProjectImportError("invalidArchive", "Zip64 locator is missing.")
                }
            } else if needsZip64 {
                throw ProjectImportError("invalidArchive", "Zip64 locator is missing.")
            }

            guard entryCount <= UInt64(maxEntries) else {
                throw ProjectImportError("archiveTooLarge", "Archive has too many entries: \(entryCount).")
            }
            guard directorySize <= 64 * 1024 * 1024 else {
                throw ProjectImportError("archiveTooLarge", "Central directory exceeds 64 MiB.")
            }
            guard directoryOffset <= directoryEnd,
                  directorySize == directoryEnd - directoryOffset else {
                throw ProjectImportError("invalidArchive", "Central directory does not end at its end record.")
            }

            var position = directoryOffset
            var declaredTotal: UInt64 = 0
            for _ in 0..<entryCount {
                guard position <= directoryEnd, directoryEnd - position >= 46 else {
                    throw ProjectImportError("invalidArchive", "Central directory has fewer records than declared.")
                }
                let header = try readExactly(handle, at: position, count: 46)
                guard littleEndian(header, 0, 4) == 0x02014b50 else {
                    throw ProjectImportError("invalidArchive", "Central-directory record signature is invalid.")
                }
                if littleEndian(header, 8, 2) & 1 != 0 {
                    throw ProjectImportError("invalidArchive", "Encrypted archive entry is unsupported.")
                }
                let unixMode = littleEndian(header, 38, 4) >> 16
                let fileType = unixMode & 0o170000
                if fileType != 0 && fileType != 0o100000 && fileType != 0o040000 {
                    throw ProjectImportError("unsafeArchiveEntry", "Archive contains a special Unix file type.")
                }
                let nameLength = littleEndian(header, 28, 2)
                let extraLength = littleEndian(header, 30, 2)
                let commentLength = littleEndian(header, 32, 2)
                let recordLength = 46 + nameLength + extraLength + commentLength
                guard recordLength <= directoryEnd - position else {
                    throw ProjectImportError("invalidArchive", "Central-directory record exceeds its bounds.")
                }
                var uncompressedSize = littleEndian(header, 24, 4)
                if uncompressedSize == 0xffffffff {
                    let extra = try readExactly(
                        handle,
                        at: position + 46 + nameLength,
                        count: Int(extraLength)
                    )
                    var extraPosition = 0
                    var foundSize = false
                    while extraPosition + 4 <= extra.count {
                        let tag = littleEndian(extra, extraPosition, 2)
                        let length = Int(littleEndian(extra, extraPosition + 2, 2))
                        guard length <= extra.count - extraPosition - 4 else {
                            throw ProjectImportError("invalidArchive", "Zip64 extra field is truncated.")
                        }
                        if tag == 1 {
                            guard length >= 8 else {
                                throw ProjectImportError("invalidArchive", "Zip64 size is missing.")
                            }
                            uncompressedSize = littleEndian(extra, extraPosition + 4, 8)
                            foundSize = true
                            break
                        }
                        extraPosition += 4 + length
                    }
                    guard foundSize else {
                        throw ProjectImportError("invalidArchive", "Zip64 size is missing.")
                    }
                }
                let (nextTotal, overflow) = declaredTotal.addingReportingOverflow(uncompressedSize)
                guard !overflow, nextTotal <= maxTotalUncompressedBytes else {
                    throw ProjectImportError(
                        "archiveTooLarge",
                        "Archive declares more than \(maxTotalUncompressedBytes) uncompressed bytes."
                    )
                }
                declaredTotal = nextTotal
                position += recordLength
            }
            guard position == directoryEnd else {
                throw ProjectImportError("invalidArchive", "Central directory contains undeclared records or padding.")
            }
            return CentralDirectory(entryCount: entryCount)
        } catch let error as ProjectImportError {
            throw error
        } catch {
            throw ProjectImportError("invalidArchive", "Cannot read the central directory.")
        }
    }

    private static func requireSafeDirectory(_ url: URL) throws {
        var info = stat()
        guard url.path.withCString({ lstat($0, &info) }) == 0 else {
            throw ProjectImportError("importFailed", "Cannot inspect staging directory.")
        }
        let kind = mode_t(info.st_mode) & mode_t(S_IFMT)
        guard kind != mode_t(S_IFLNK) else {
            throw ProjectImportError("unsafeArchiveEntry", "Staging parent is a symlink: \(url.path)")
        }
        guard kind == mode_t(S_IFDIR) else {
            throw ProjectImportError("unsafeArchiveEntry", "Staging parent is not a directory: \(url.path)")
        }
    }

    private static func ensureSafeParents(root: URL, segments: [String]) throws {
        try requireSafeDirectory(root)
        var current = root
        for segment in segments {
            current.appendPathComponent(segment, isDirectory: true)
            var info = stat()
            if current.path.withCString({ lstat($0, &info) }) != 0 {
                guard errno == ENOENT else {
                    throw ProjectImportError("importFailed", "Cannot inspect staging parent: \(current.path)")
                }
                try FileManager.default.createDirectory(at: current, withIntermediateDirectories: false)
            }
            try requireSafeDirectory(current)
        }
    }

    // MARK: - Root detection

    private static func resolveProjectRoot(entries: [Entry], paths: [EntryPath]) throws -> [String] {
        if hasFile(entries: entries, paths: paths, rootSegments: [], fileName: "project.db") {
            try rejectIncompleteMarker(paths: paths, rootSegments: [])
            try requireDirectoryEntry(entries: entries, paths: paths, rootSegments: [], name: "files")
            try requireDirectoryEntry(entries: entries, paths: paths, rootSegments: [], name: "file-metadata")
            return []
        }

        var rootDirectories: [String] = []
        var seenRoots: Set<String> = []
        for (index, path) in paths.enumerated() where !path.segments.isEmpty {
            let firstSegment = path.segments[0]
            if firstSegment.hasPrefix(".") || firstSegment == macosxRootName {
                continue
            }
            let looksLikeDirectory = path.segments.count > 1 || isDirectoryEntry(entries[index])
            if looksLikeDirectory && !seenRoots.contains(firstSegment) {
                seenRoots.insert(firstSegment)
                rootDirectories.append(firstSegment)
            }
        }
        if rootDirectories.count != 1 {
            throw ProjectImportError("invalidArchive", "Archive does not contain a single project root.")
        }

        let rootSegments = [rootDirectories[0]]
        guard hasFile(entries: entries, paths: paths, rootSegments: rootSegments, fileName: "project.db") else {
            throw ProjectImportError("invalidArchive", "Archive does not contain a project database.")
        }
        try rejectIncompleteMarker(paths: paths, rootSegments: rootSegments)
        try requireDirectoryEntry(entries: entries, paths: paths, rootSegments: rootSegments, name: "files")
        try requireDirectoryEntry(entries: entries, paths: paths, rootSegments: rootSegments, name: "file-metadata")
        return rootSegments
    }

    private static func rejectIncompleteMarker(paths: [EntryPath], rootSegments: [String]) throws {
        for path in paths {
            if isChildOf(path, rootSegments: rootSegments, fileName: incompleteExportMarkerName) {
                throw ProjectImportError(
                    "invalidArchive",
                    "Archive is an incomplete export (\(incompleteExportMarkerName))."
                )
            }
        }
    }

    private static func requireDirectoryEntry(
        entries: [Entry],
        paths: [EntryPath],
        rootSegments: [String],
        name: String
    ) throws {
        for (index, path) in paths.enumerated() {
            guard isChildOf(path, rootSegments: rootSegments, fileName: name) else {
                continue
            }
            if !isDirectoryEntry(entries[index]) {
                throw ProjectImportError("invalidArchive", "Archive \(name) entry is not a directory.")
            }
        }
    }

    private static func hasFile(entries: [Entry], paths: [EntryPath], rootSegments: [String], fileName: String) -> Bool {
        for (index, path) in paths.enumerated()
        where isChildOf(path, rootSegments: rootSegments, fileName: fileName) {
            return !isDirectoryEntry(entries[index])
        }
        return false
    }

    private static func isChildOf(_ path: EntryPath, rootSegments: [String], fileName: String) -> Bool {
        guard path.segments.count == rootSegments.count + 1 else {
            return false
        }
        for (index, rootSegment) in rootSegments.enumerated()
        where path.segments[index] != rootSegment {
            return false
        }
        return path.segments[rootSegments.count] == fileName
    }

    // MARK: - Payload selection

    private struct PayloadItem {
        let entry: Entry
        let relativeSegments: [String]
    }

    /**
     Returns the staging-relative segments of every entry that belongs to the
     project payload (project.db + sidecars, direct children of files/ and
     file-metadata/), skipping everything else. Duplicate payload entries are
     rejected.
     */
    private static func selectPayload(
        entries: [Entry],
        paths: [EntryPath],
        rootSegments: [String]
    ) throws -> [PayloadItem] {
        var payload: [PayloadItem] = []
        var seenRawNames: Set<String> = []
        var seenNormalizedPaths: Set<String> = []

        for (index, path) in paths.enumerated() {
            let entry = entries[index]
            if isDirectoryEntry(entry) {
                continue
            }
            guard let relativeSegments = projectSegments(of: path, rootSegments: rootSegments) else {
                continue
            }

            let rawName = entry.path
            if !seenRawNames.insert(rawName).inserted {
                throw ProjectImportError("invalidArchive", "Duplicate archive entry: \(rawName)")
            }
            let normalizedPath = relativeSegments.map { $0.lowercased() }.joined(separator: "/")
            if !seenNormalizedPaths.insert(normalizedPath).inserted {
                throw ProjectImportError(
                    "invalidArchive",
                    "Duplicate archive entry for \(relativeSegments.joined(separator: "/"))"
                )
            }

            payload.append(PayloadItem(entry: entry, relativeSegments: relativeSegments))
        }

        return payload
    }

    private static func projectSegments(of path: EntryPath, rootSegments: [String]) -> [String]? {
        guard path.segments.count > rootSegments.count else {
            return nil
        }
        for (index, rootSegment) in rootSegments.enumerated()
        where path.segments[index] != rootSegment {
            return nil
        }

        let fileName = path.segments.last ?? ""
        if fileName.hasPrefix(".") || path.isMacOSXMetadata {
            return nil
        }

        let depth = path.segments.count - rootSegments.count
        if depth == 1 {
            return databaseEntryNames.contains(fileName) ? [fileName] : nil
        }
        guard depth == 2 else {
            return nil
        }
        let container = path.segments[rootSegments.count]
        if container == "files" || container == "file-metadata" {
            return Array(path.segments[rootSegments.count...])
        }
        return nil
    }

    // MARK: - Writing

    private static func writeEntry(
        _ entry: Entry,
        from archive: Archive,
        to outputHandle: FileHandle,
        runningTotal: UInt64,
        maxTotalUncompressedBytes: UInt64,
        progressReporter: ProjectImportProgressReporter?
    ) throws -> UInt64 {
        var writtenBytes: UInt64 = 0
        var writtenTotal = runningTotal
        let checksum: CRC32
        do {
            checksum = try archive.extract(entry, skipCRC32: false) { data in
                if data.isEmpty {
                    return
                }
                let (nextWrittenBytes, entryOverflow) = writtenBytes.addingReportingOverflow(UInt64(data.count))
                let (nextTotal, totalOverflow) = writtenTotal.addingReportingOverflow(UInt64(data.count))
                if entryOverflow || totalOverflow || nextTotal > maxTotalUncompressedBytes {
                    throw ProjectImportError(
                        "archiveTooLarge",
                        "Archive expands beyond \(maxTotalUncompressedBytes) bytes."
                    )
                }
                // The throwing API: the legacy write(_:) raises an Objective-C
                // exception when the disk is full, which Swift cannot catch.
                do {
                    try outputHandle.write(contentsOf: data)
                } catch {
                    throw ProjectImportError(
                        "importFailed",
                        "Cannot write extracted file: \(error.localizedDescription)"
                    )
                }
                writtenBytes = nextWrittenBytes
                writtenTotal = nextTotal
                progressReporter?.update(current: writtenTotal)
            }
        } catch let error as ProjectImportError {
            throw error
        } catch {
            throw ProjectImportError("invalidArchive", "Archive entry is unreadable: \(entry.path)")
        }

        guard writtenBytes == entry.uncompressedSize else {
            throw ProjectImportError(
                "invalidArchive",
                "Entry size mismatch for \(entry.path): \(writtenBytes) of \(entry.uncompressedSize) bytes."
            )
        }
        guard checksum == entry.checksum else {
            throw ProjectImportError("invalidArchive", "CRC32 mismatch for \(entry.path).")
        }

        return writtenTotal
    }

    /**
     Asserts the staged project root contains only the files a RouteVN
     project import expects, so the staged directory can never carry hidden
     extras into app storage.
     */
    static func assertProjectLayout(in projectRoot: URL) throws {
        let allowedNames: Set<String> = databaseEntryNames.union(["files", "file-metadata"])
        let children = try FileManager.default.contentsOfDirectory(
            at: projectRoot,
            includingPropertiesForKeys: nil,
            options: []
        )
        for child in children where !allowedNames.contains(child.lastPathComponent) {
            throw ProjectImportError(
                "invalidArchive",
                "Unexpected entry in extracted project root: \(child.lastPathComponent)"
            )
        }
    }
}
