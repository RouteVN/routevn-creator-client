import Foundation
import SQLite3

/// Reads metadata without requiring writable SQLite sidecars beside a picked
/// database. Closed WAL exports may have only project.db; active WALs must keep
/// their committed transactions when a private copy is needed.
enum ProjectDatabaseReader {
    private struct SQLiteAccessError: LocalizedError {
        let code: Int32
        let message: String
        var errorDescription: String? { message }
    }

    static func read<T>(at source: URL, using reader: (OpaquePointer) throws -> T) throws -> T {
        do {
            return try withDatabase(at: source, flags: SQLITE_OPEN_READONLY, using: reader)
        } catch let error as SQLiteAccessError {
            guard error.code == SQLITE_CANTOPEN || error.code == SQLITE_READONLY else { throw error }
            return try withPrivateCopy(of: source, using: reader)
        }
    }

    private static func withDatabase<T>(
        at url: URL,
        flags: Int32,
        using reader: (OpaquePointer) throws -> T
    ) throws -> T {
        var handle: OpaquePointer?
        let result = sqlite3_open_v2(url.path, &handle, flags, nil)
        defer { if let handle { sqlite3_close(handle) } }
        guard result == SQLITE_OK, let handle else {
            throw SQLiteAccessError(
                code: result & 0xff,
                message: handle.map { String(cString: sqlite3_errmsg($0)) } ?? "Could not read the project database."
            )
        }
        sqlite3_busy_timeout(handle, 5_000)
        do {
            return try reader(handle)
        } catch {
            let code = sqlite3_errcode(handle) & 0xff
            if code == SQLITE_CANTOPEN || code == SQLITE_READONLY {
                throw SQLiteAccessError(code: code, message: String(cString: sqlite3_errmsg(handle)))
            }
            throw error
        }
    }

    private static func withPrivateCopy<T>(of source: URL, using reader: (OpaquePointer) throws -> T) throws -> T {
        let files = FileManager.default
        let temporaryDirectory = files.temporaryDirectory
            .appendingPathComponent("routevn-database-read-\(UUID().uuidString)", isDirectory: true)
        try files.createDirectory(at: temporaryDirectory, withIntermediateDirectories: false)
        defer { try? files.removeItem(at: temporaryDirectory) }
        let database = temporaryDirectory.appendingPathComponent("project.db")
        var coordinationError: NSError?
        var operationError: Error?
        NSFileCoordinator().coordinate(
            readingItemAt: source.deletingLastPathComponent(),
            options: .withoutChanges,
            error: &coordinationError
        ) { folder in
            do {
                let coordinatedSource = folder.appendingPathComponent(source.lastPathComponent)
                // WAL and rollback journals can contain committed/recoverable
                // data. SHM is a transient index; SQLite rebuilds it locally.
                for suffix in ["", "-wal", "-journal"] {
                    let original = URL(fileURLWithPath: coordinatedSource.path + suffix)
                    if !suffix.isEmpty && !files.fileExists(atPath: original.path) { continue }
                    let copy = URL(fileURLWithPath: database.path + suffix)
                    try files.copyItem(at: original, to: copy)
                    try files.setAttributes([.posixPermissions: 0o600], ofItemAtPath: copy.path)
                }
            } catch { operationError = error }
        }
        if let coordinationError { throw coordinationError }
        if let operationError { throw operationError }
        // This is our disposable copy, so SQLite may create working files or
        // recover its journal. Never request write access to the picked source.
        return try withDatabase(at: database, flags: SQLITE_OPEN_READWRITE, using: reader)
    }
}
