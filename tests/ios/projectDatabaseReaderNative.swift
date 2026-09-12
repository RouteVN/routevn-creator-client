import Foundation
import SQLite3

@main
struct ProjectDatabaseReaderNativeTests {
    static func main() throws {
        let files = FileManager.default
        let root = files.temporaryDirectory.appendingPathComponent("routevn-reader-test-\(UUID().uuidString)")
        try files.createDirectory(at: root, withIntermediateDirectories: false)
        defer { try? files.removeItem(at: root) }

        let closed = root.appendingPathComponent("Closed Project", isDirectory: true)
        try files.createDirectory(at: closed, withIntermediateDirectories: false)
        let closedDatabase = closed.appendingPathComponent("project.db")
        let closedWriterDatabase = root.appendingPathComponent("closed-source.db")
        let writer = try open(closedWriterDatabase)
        try execute(writer, "PRAGMA journal_mode=WAL; CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT); INSERT INTO app_state VALUES ('projectInfo', 'Project One');")
        precondition(sqlite3_close(writer) == SQLITE_OK)
        try files.copyItem(at: closedWriterDatabase, to: closedDatabase)
        precondition(!files.fileExists(atPath: closedDatabase.path + "-wal"))
        try verifyReadOnlySource(closed, expected: "Project One")

        // The database file alone does not contain this committed update.
        // Keep its writer open so closing cannot checkpoint away the fixture WAL.
        let live = root.appendingPathComponent("Live Project", isDirectory: true)
        try files.createDirectory(at: live, withIntermediateDirectories: false)
        let liveDatabase = live.appendingPathComponent("project.db")
        let liveWriter = try open(liveDatabase)
        defer { sqlite3_close(liveWriter) }
        try execute(liveWriter, "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT); INSERT INTO app_state VALUES ('projectInfo', 'Project One'); PRAGMA wal_checkpoint(TRUNCATE); UPDATE app_state SET value='Project Two' WHERE key='projectInfo';")
        let direct = try ProjectDatabaseReader.read(at: liveDatabase) { database in
            let path = String(cString: sqlite3_db_filename(database, "main"))
            precondition(URL(fileURLWithPath: path).resolvingSymlinksInPath() == liveDatabase.resolvingSymlinksInPath())
            return try readValue(database)
        }
        precondition(direct == "Project Two")

        let exported = root.appendingPathComponent("Exported Project", isDirectory: true)
        try files.createDirectory(at: exported, withIntermediateDirectories: false)
        for suffix in ["", "-wal"] {
            try files.copyItem(
                at: URL(fileURLWithPath: liveDatabase.path + suffix),
                to: exported.appendingPathComponent("project.db" + suffix)
            )
        }
        try verifyReadOnlySource(exported, expected: "Project Two")

        let missing = root.appendingPathComponent("missing.db")
        do {
            _ = try ProjectDatabaseReader.read(at: missing, using: readValue)
            preconditionFailure("A missing database was accepted")
        } catch {}
        precondition(!files.fileExists(atPath: missing.path))

        let invalid = root.appendingPathComponent("invalid.db")
        let invalidBytes = Data("This is not a SQLite database".utf8)
        try invalidBytes.write(to: invalid)
        do {
            _ = try ProjectDatabaseReader.read(at: invalid, using: readValue)
            preconditionFailure("An invalid database was accepted")
        } catch {}
        let unchanged = try Data(contentsOf: invalid)
        precondition(unchanged == invalidBytes)
        print("PASS: closed WAL exports, uncheckpointed WAL data, live reads, source bytes/permissions preserved, missing/corrupt databases rejected, private copies cleaned on success and failure")
    }

    static func verifyReadOnlySource(_ folder: URL, expected: String) throws {
        let files = FileManager.default
        let names = try files.contentsOfDirectory(atPath: folder.path).sorted()
        var originalBytes: [String: Data] = [:]
        for name in names {
            let file = folder.appendingPathComponent(name)
            originalBytes[name] = try Data(contentsOf: file)
            try files.setAttributes([.posixPermissions: 0o444], ofItemAtPath: file.path)
        }
        try files.setAttributes([.posixPermissions: 0o555], ofItemAtPath: folder.path)
        defer {
            try? files.setAttributes([.posixPermissions: 0o755], ofItemAtPath: folder.path)
            for name in names {
                try? files.setAttributes([.posixPermissions: 0o644], ofItemAtPath: folder.appendingPathComponent(name).path)
            }
        }
        let source = folder.appendingPathComponent("project.db")
        var temporaryDatabase: URL?
        let value = try ProjectDatabaseReader.read(at: source) { database in
            let path = String(cString: sqlite3_db_filename(database, "main"))
            if URL(fileURLWithPath: path).resolvingSymlinksInPath() != source.resolvingSymlinksInPath() {
                temporaryDatabase = URL(fileURLWithPath: path)
            }
            return try readValue(database)
        }
        precondition(value == expected)
        // On macOS this fixture hits SQLITE_READONLY_CANTINIT; iOS 16 reports
        // SQLITE_CANTOPEN for the same missing-sidecar metadata query.
        guard let temporaryDatabase else { preconditionFailure("The fallback was not exercised") }
        precondition(!files.fileExists(atPath: temporaryDatabase.deletingLastPathComponent().path))

        var failedCopy: URL?
        do {
            _ = try ProjectDatabaseReader.read(at: source) { database -> String in
                _ = try readValue(database)
                let path = String(cString: sqlite3_db_filename(database, "main"))
                failedCopy = URL(fileURLWithPath: path)
                throw CocoaError(.fileReadCorruptFile)
            }
            preconditionFailure("The reader error was swallowed")
        } catch {}
        guard let failedCopy else { preconditionFailure("The failing fallback was not exercised") }
        precondition(!files.fileExists(atPath: failedCopy.deletingLastPathComponent().path))
        let finalNames = try files.contentsOfDirectory(atPath: folder.path).sorted()
        precondition(finalNames == names)
        for name in names {
            let file = folder.appendingPathComponent(name)
            let bytes = try Data(contentsOf: file)
            let permissions = try files.attributesOfItem(atPath: file.path)[.posixPermissions] as? NSNumber
            precondition(bytes == originalBytes[name])
            precondition(permissions?.intValue == 0o444)
        }
    }

    static func open(_ url: URL) throws -> OpaquePointer {
        var database: OpaquePointer?
        guard sqlite3_open(url.path, &database) == SQLITE_OK, let database else {
            throw CocoaError(.fileWriteUnknown)
        }
        return database
    }

    static func execute(_ database: OpaquePointer, _ sql: String) throws {
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else {
            throw NSError(domain: "SQLite", code: Int(sqlite3_errcode(database)), userInfo: [NSLocalizedDescriptionKey: String(cString: sqlite3_errmsg(database))])
        }
    }

    static func readValue(_ database: OpaquePointer) throws -> String {
        var statement: OpaquePointer?
        defer { sqlite3_finalize(statement) }
        guard sqlite3_prepare_v2(database, "SELECT value FROM app_state WHERE key='projectInfo'", -1, &statement, nil) == SQLITE_OK,
              sqlite3_step(statement) == SQLITE_ROW,
              let value = sqlite3_column_text(statement, 0) else {
            throw NSError(domain: "SQLite", code: Int(sqlite3_errcode(database)), userInfo: [NSLocalizedDescriptionKey: String(cString: sqlite3_errmsg(database))])
        }
        return String(cString: value)
    }
}
