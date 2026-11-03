import Foundation
import SQLite3

/// Gives a project.db the app does not have open a new project id, in one
/// transaction, the same way the Android import does: projectInfo (in every
/// table that can hold it: app_state, then the legacy kv), the project id of
/// every committed event and the id of the project-create event. The collab
/// cursor for the old id is dropped. Nothing changes when a step fails.
enum ProjectIdentityRewrite {
    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    static func rewrite(
        databaseURL: URL,
        projectInfo: [String: Any],
        from sourceProjectId: String,
        to targetProjectId: String
    ) throws {
        let data = try JSONSerialization.data(withJSONObject: projectInfo, options: [.sortedKeys, .withoutEscapingSlashes])
        let value = String(decoding: data, as: UTF8.self)
        var handle: OpaquePointer?
        let result = sqlite3_open_v2(databaseURL.path, &handle, SQLITE_OPEN_READWRITE, nil)
        defer { if let handle { sqlite3_close(handle) } }
        guard result == SQLITE_OK, let database = handle else {
            throw Failure(message: "Could not open the project database to give the copy a new id.")
        }
        sqlite3_busy_timeout(database, 5_000)
        try run(database, "BEGIN IMMEDIATE")
        do {
            var updated = 0
            for table in ["app_state", "kv"] {
                guard try hasTable(database, table) else { continue }
                updated += try run(database, "UPDATE \(table) SET value = ? WHERE key = ?", [value, "projectInfo"])
            }
            guard updated > 0 else {
                throw Failure(message: "Selected folder is not a RouteVN project.")
            }
            if try hasTable(database, "app_state") {
                try run(database, "DELETE FROM app_state WHERE key = ?", ["collab.lastCommittedId:\(sourceProjectId)"])
            }
            let sourceCreateEventId = "project-create:\(sourceProjectId)"
            let targetCreateEventId = "project-create:\(targetProjectId)"
            if try hasTable(database, "committed_events") {
                try run(database, "UPDATE committed_events SET project_id = ?", [targetProjectId])
                try run(database, "UPDATE committed_events SET id = ? WHERE id = ?", [targetCreateEventId, sourceCreateEventId])
            }
            if try hasTable(database, "local_drafts") {
                try run(database, "UPDATE local_drafts SET id = ? WHERE id = ?", [targetCreateEventId, sourceCreateEventId])
            }
            try run(database, "COMMIT")
        } catch {
            sqlite3_exec(database, "ROLLBACK", nil, nil, nil)
            throw error
        }
    }

    /// Runs one statement with text arguments and returns the rows it changed.
    @discardableResult
    private static func run(_ database: OpaquePointer, _ sql: String, _ args: [String] = []) throws -> Int {
        let statement = try prepare(database, sql, args)
        defer { sqlite3_finalize(statement) }
        var step = sqlite3_step(statement)
        while step == SQLITE_ROW {
            step = sqlite3_step(statement)
        }
        guard step == SQLITE_DONE else { throw failure(database) }
        return Int(sqlite3_changes(database))
    }

    private static func hasTable(_ database: OpaquePointer, _ name: String) throws -> Bool {
        let statement = try prepare(database, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [name])
        defer { sqlite3_finalize(statement) }
        switch sqlite3_step(statement) {
        case SQLITE_ROW: return true
        case SQLITE_DONE: return false
        default: throw failure(database)
        }
    }

    private static func prepare(_ database: OpaquePointer, _ sql: String, _ args: [String]) throws -> OpaquePointer {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw failure(database)
        }
        for (index, arg) in args.enumerated() {
            sqlite3_bind_text(statement, Int32(index + 1), arg, -1, transient)
        }
        return statement
    }

    private static func failure(_ database: OpaquePointer) -> Failure {
        Failure(message: String(cString: sqlite3_errmsg(database)))
    }
}
