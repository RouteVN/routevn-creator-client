import Foundation
import SQLite3

@main
struct NativeDeviceIdReaderNativeTests {
    static let id = "7mQkR2vXa9Lp8nRmS3wYb2Mq"

    static func main() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("app.db")

        precondition(NativeDeviceIdReader.read(file: file) == nil)
        precondition(!FileManager.default.fileExists(atPath: file.path))
        try execute(file: file, sql: "CREATE TABLE other (key TEXT)")
        precondition(NativeDeviceIdReader.read(file: file) == nil)
        try execute(file: file, sql: "CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)")
        precondition(NativeDeviceIdReader.read(file: file) == nil)

        for json in ["not json", id, "42", "null", "\"short\"",
                     "\"0OQkR2vXa9Lp8nRmS3wYb2Mq\"", "\"\(id)\" trailing"] {
            try insert(file: file, value: json)
            precondition(NativeDeviceIdReader.read(file: file) == nil, "accepted \(json)")
        }
        try insert(file: file, value: "\"\(id)\"")
        precondition(NativeDeviceIdReader.read(file: file) == id)

        // Like the app, a WAL writer stays open, so the row is only in the log.
        try execute(file: file, sql: "DELETE FROM kv")
        var writer: OpaquePointer?
        guard sqlite3_open_v2(file.path, &writer, SQLITE_OPEN_READWRITE, nil) == SQLITE_OK,
              sqlite3_exec(writer, "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;", nil, nil, nil) == SQLITE_OK,
              sqlite3_exec(writer, "INSERT INTO kv (key, value) VALUES ('deviceId', '\"\(id)\"')", nil, nil, nil) == SQLITE_OK
        else { throw NSError(domain: "SQLite", code: 6) }
        defer { sqlite3_close(writer) }
        precondition(FileManager.default.fileExists(atPath: file.path + "-wal"))
        precondition(NativeDeviceIdReader.read(file: file) == id, "missed an ID in the write-ahead log")

        precondition(NativeDeviceIdReader.isDeviceId(id))
        precondition(!NativeDeviceIdReader.isDeviceId("0OQkR2vXa9Lp8nRmS3wYb2Mq"))
        print("PASS: native device ID reader cases")
    }

    static func execute(file: URL, sql: String) throws {
        var database: OpaquePointer?
        guard sqlite3_open_v2(file.path, &database, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nil)
            == SQLITE_OK else { throw NSError(domain: "SQLite", code: 1) }
        defer { sqlite3_close(database) }
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else {
            throw NSError(domain: "SQLite", code: 2)
        }
    }

    static func insert(file: URL, value: String) throws {
        var database: OpaquePointer?
        guard sqlite3_open_v2(file.path, &database, SQLITE_OPEN_READWRITE, nil) == SQLITE_OK else {
            throw NSError(domain: "SQLite", code: 3)
        }
        defer { sqlite3_close(database) }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(
            database, "INSERT OR REPLACE INTO kv (key, value) VALUES ('deviceId', ?)",
            -1, &statement, nil
        ) == SQLITE_OK else { throw NSError(domain: "SQLite", code: 4) }
        defer { sqlite3_finalize(statement) }
        let result = value.withCString { sqlite3_bind_text(statement, 1, $0, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self)) }
        guard result == SQLITE_OK, sqlite3_step(statement) == SQLITE_DONE else {
            throw NSError(domain: "SQLite", code: 5)
        }
    }
}
