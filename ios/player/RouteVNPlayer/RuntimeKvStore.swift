import Foundation
import SQLite3

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

// The player's saves: `runtime.db` in Application Support, schema version 1,
// with the same table, triggers, WAL, and synchronous=FULL as the desktop
// players. Not thread-safe; PlayerBridge calls it from one queue.
final class RuntimeKvStore {
    private struct StoreError: LocalizedError {
        let errorDescription: String?
        init(_ message: String) { errorDescription = message }
    }

    private var db: OpaquePointer?

    deinit {
        close()
    }

    func initialize() throws {
        if db != nil { return }
        let directory = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let path = directory.appendingPathComponent("runtime.db").path
        var connection: OpaquePointer?
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_NOMUTEX
        guard sqlite3_open_v2(path, &connection, flags, nil) == SQLITE_OK, let connection else {
            let message = connection.map { String(cString: sqlite3_errmsg($0)) } ?? "out of memory"
            sqlite3_close(connection)
            throw StoreError("Cannot open the runtime database: \(message)")
        }
        do {
            sqlite3_busy_timeout(connection, 5000)
            try exec(connection, "PRAGMA journal_mode=WAL")
            try exec(connection, "PRAGMA synchronous=FULL")
            let version = try userVersion(connection)
            guard version == 0 || version == 1 else {
                throw StoreError("Unsupported Db schema version: \(version)")
            }
            try transaction(connection) {
                try exec(connection, """
                    CREATE TABLE IF NOT EXISTS kv (
                      key TEXT PRIMARY KEY,
                      value TEXT CHECK (value IS NULL OR json_valid(value))
                    )
                    """)
                try exec(connection, """
                    CREATE TRIGGER IF NOT EXISTS kv_delete_null_after_insert
                    AFTER INSERT ON kv WHEN NEW.value IS NULL
                    BEGIN DELETE FROM kv WHERE key = NEW.key; END
                    """)
                try exec(connection, """
                    CREATE TRIGGER IF NOT EXISTS kv_delete_null_after_update
                    AFTER UPDATE OF value ON kv WHEN NEW.value IS NULL
                    BEGIN DELETE FROM kv WHERE key = NEW.key; END
                    """)
                if version == 0 {
                    try exec(connection, "PRAGMA user_version = 1")
                }
            }
            db = connection
        } catch {
            sqlite3_close(connection)
            throw error
        }
    }

    func list(prefix: String?) throws -> [(key: String, value: String?)] {
        let db = try requireDatabase()
        var rows: [(key: String, value: String?)] = []
        // One read transaction, so the rows are a single snapshot.
        try transaction(db, begin: "BEGIN") {
            let sql = prefix == nil
                ? "SELECT key, value FROM kv ORDER BY key"
                : "SELECT key, value FROM kv WHERE substr(key, 1, ?1) = ?2 ORDER BY key"
            try withStatement(db, sql) { statement in
                if let prefix {
                    // SQLite counts characters as Unicode code points.
                    sqlite3_bind_int64(statement, 1, Int64(prefix.unicodeScalars.count))
                    try bindText(db, statement, 2, prefix)
                }
                while true {
                    let step = sqlite3_step(statement)
                    if step == SQLITE_DONE { break }
                    guard step == SQLITE_ROW else { throw error(db) }
                    rows.append((key: columnText(statement, 0) ?? "", value: columnText(statement, 1)))
                }
            }
        }
        return rows
    }

    func set(key: String, value: String) throws {
        let db = try requireDatabase()
        try write(db, key: key, value: value)
    }

    func apply(_ operations: [(key: String, value: String?)]) throws {
        let db = try requireDatabase()
        if operations.isEmpty { return }
        try transaction(db) {
            for operation in operations {
                try write(db, key: operation.key, value: operation.value)
            }
        }
    }

    func clear() throws {
        try exec(try requireDatabase(), "DELETE FROM kv")
    }

    func close() {
        if let db {
            sqlite3_close(db)
            self.db = nil
        }
    }

    private func requireDatabase() throws -> OpaquePointer {
        guard let db else { throw StoreError("Db not initialized. Call init() first.") }
        return db
    }

    // A NULL value deletes the key through the triggers.
    private func write(_ db: OpaquePointer, key: String, value: String?) throws {
        try withStatement(db, "INSERT OR REPLACE INTO kv (key, value) VALUES (?1, ?2)") { statement in
            try bindText(db, statement, 1, key)
            if let value {
                try bindText(db, statement, 2, value)
            } else {
                sqlite3_bind_null(statement, 2)
            }
            guard sqlite3_step(statement) == SQLITE_DONE else { throw error(db) }
        }
    }

    private func transaction(_ db: OpaquePointer, begin: String = "BEGIN IMMEDIATE", _ body: () throws -> Void) throws {
        try exec(db, begin)
        do {
            try body()
            try exec(db, "COMMIT")
        } catch {
            sqlite3_exec(db, "ROLLBACK", nil, nil, nil)
            throw error
        }
    }

    private func userVersion(_ db: OpaquePointer) throws -> Int64 {
        try withStatement(db, "PRAGMA user_version") { statement in
            guard sqlite3_step(statement) == SQLITE_ROW else { throw error(db) }
            return sqlite3_column_int64(statement, 0)
        }
    }

    private func exec(_ db: OpaquePointer, _ sql: String) throws {
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw error(db) }
    }

    private func withStatement<T>(_ db: OpaquePointer, _ sql: String, _ body: (OpaquePointer) throws -> T) throws -> T {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw error(db)
        }
        defer { sqlite3_finalize(statement) }
        return try body(statement)
    }

    // Binds the exact UTF-8 bytes, so text containing NUL is kept whole.
    private func bindText(_ db: OpaquePointer, _ statement: OpaquePointer, _ index: Int32, _ text: String) throws {
        let bytes = Array(text.utf8)
        let result = bytes.withUnsafeBufferPointer { buffer in
            buffer.baseAddress.map { base in
                base.withMemoryRebound(to: CChar.self, capacity: buffer.count) {
                    sqlite3_bind_text64(statement, index, $0, sqlite3_uint64(buffer.count), SQLITE_TRANSIENT, UInt8(SQLITE_UTF8))
                }
            } ?? sqlite3_bind_text(statement, index, "", 0, SQLITE_TRANSIENT)
        }
        guard result == SQLITE_OK else { throw error(db) }
    }

    private func columnText(_ statement: OpaquePointer, _ index: Int32) -> String? {
        guard sqlite3_column_type(statement, index) != SQLITE_NULL else { return nil }
        let count = Int(sqlite3_column_bytes(statement, index))
        guard let text = sqlite3_column_text(statement, index) else { return "" }
        return String(decoding: UnsafeBufferPointer(start: text, count: count), as: UTF8.self)
    }

    private func error(_ db: OpaquePointer) -> StoreError {
        StoreError(String(cString: sqlite3_errmsg(db)))
    }
}
