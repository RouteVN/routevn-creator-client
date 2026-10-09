import Foundation
import SQLite3

/// Reads the JavaScript-owned device ID without creating or changing app storage.
enum NativeDeviceIdReader {
    static func isDeviceId(_ value: String?) -> Bool {
        guard let value, value.utf8.count == 24 else { return false }
        let alphabet = CharacterSet(charactersIn: "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")
        return value.unicodeScalars.allSatisfy(alphabet.contains)
    }

    static func read() -> String? {
        guard let support = FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask
        ).first else { return nil }
        let file = support.appendingPathComponent("RouteVN Creator/databases/app.db")
        return read(file: file)
    }

    static func read(file: URL) -> String? {
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        var database: OpaquePointer?
        // A plain read-only open, not immutable: the app database runs in WAL
        // mode, and the device ID can still be only in the write-ahead log.
        guard sqlite3_open_v2(file.path, &database, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else {
            if let database { sqlite3_close(database) }
            return nil
        }
        defer { sqlite3_close(database) }
        sqlite3_busy_timeout(database, 50)
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(
            database, "SELECT value FROM kv WHERE key = 'deviceId' LIMIT 1", -1, &statement, nil
        ) == SQLITE_OK else { return nil }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW,
              let bytes = sqlite3_column_text(statement, 0) else { return nil }
        let json = String(cString: bytes)
        guard let value = try? JSONSerialization.jsonObject(
            with: Data(json.utf8), options: .fragmentsAllowed
        ) as? String, isDeviceId(value) else { return nil }
        return value
    }
}
