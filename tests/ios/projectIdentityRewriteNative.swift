import Foundation
import SQLite3

// The tables match the event store schema that project.db uses.
private let schema = """
PRAGMA journal_mode=WAL;
CREATE TABLE local_drafts (draft_clock INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, partition TEXT NOT NULL, type TEXT NOT NULL, schema_version INTEGER NOT NULL, payload BLOB NOT NULL, payload_compression TEXT DEFAULT NULL, client_ts INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE committed_events (committed_id INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, project_id TEXT, user_id TEXT, partition TEXT NOT NULL, type TEXT NOT NULL, schema_version INTEGER NOT NULL, payload BLOB NOT NULL, payload_compression TEXT DEFAULT NULL, client_ts INTEGER NOT NULL, server_ts INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

@main
struct ProjectIdentityRewriteNativeTests {
    static func main() throws {
        let files = FileManager.default
        let root = files.temporaryDirectory.appendingPathComponent("routevn-identity-rewrite-test-\(UUID().uuidString)")
        try files.createDirectory(at: root, withIntermediateDirectories: false)
        defer { try? files.removeItem(at: root) }

        // A copy with history: every trace of the old id moves to the new one.
        let copy = root.appendingPathComponent("copy.db")
        try execute(copy, schema + """
        INSERT INTO app_state VALUES ('projectInfo', '{"id":"project-one","name":"Project One","namespace":"namespace-one","iconFileId":null}');
        INSERT INTO app_state VALUES ('collab.lastCommittedId:project-one', '7');
        INSERT INTO app_state VALUES ('creatorVersion', '1');
        INSERT INTO committed_events VALUES (1, 'project-create:project-one', 'project-one', NULL, 'm', 'project.create', 1, x'00', NULL, 1, 1, 1);
        INSERT INTO committed_events VALUES (2, 'event-two', 'project-one', NULL, 'm', 'scene.create', 1, x'00', NULL, 2, 2, 2);
        INSERT INTO local_drafts (id, partition, type, schema_version, payload, client_ts, created_at) VALUES ('project-create:project-one', 'm', 'project.create', 1, x'00', 1, 1);
        INSERT INTO local_drafts (id, partition, type, schema_version, payload, client_ts, created_at) VALUES ('draft-two', 'm', 'scene.create', 1, x'00', 2, 2);
        """)
        try ProjectIdentityRewrite.rewrite(
            databaseURL: copy,
            projectInfo: ["id": "project-copy", "name": "Project One", "namespace": "namespace-one", "iconFileId": NSNull()],
            from: "project-one",
            to: "project-copy"
        )
        let info = try JSONSerialization.jsonObject(with: Data(query(copy, "SELECT value FROM app_state WHERE key = 'projectInfo'")[0].utf8)) as! [String: Any]
        precondition(info["id"] as? String == "project-copy")
        precondition(info["name"] as? String == "Project One")
        precondition(info["namespace"] as? String == "namespace-one")
        precondition(info["iconFileId"] is NSNull)
        try expectRows(copy, "SELECT key FROM app_state ORDER BY key", ["creatorVersion", "projectInfo"])
        try expectRows(copy, "SELECT DISTINCT project_id FROM committed_events", ["project-copy"])
        try expectRows(copy, "SELECT id FROM committed_events ORDER BY committed_id", ["project-create:project-copy", "event-two"])
        try expectRows(copy, "SELECT id FROM local_drafts ORDER BY draft_clock", ["project-create:project-copy", "draft-two"])
        print("PASS: projectInfo, committed project ids, project-create ids and the collab cursor move to the new id")

        // A database without projectInfo is refused and left exactly as it was.
        let notProject = root.appendingPathComponent("not-project.db")
        try execute(notProject, schema + """
        INSERT INTO committed_events VALUES (1, 'project-create:project-one', 'project-one', NULL, 'm', 'project.create', 1, x'00', NULL, 1, 1, 1);
        """)
        do {
            try ProjectIdentityRewrite.rewrite(databaseURL: notProject, projectInfo: ["id": "project-copy"], from: "project-one", to: "project-copy")
            preconditionFailure("Rewrote a database without projectInfo")
        } catch is ProjectIdentityRewrite.Failure {}
        try expectRows(notProject, "SELECT project_id || ' ' || id FROM committed_events", ["project-one project-create:project-one"])
        print("PASS: a database without projectInfo is refused and rolled back")

        // Older projects keep projectInfo in kv and have no event tables.
        let legacy = root.appendingPathComponent("legacy.db")
        try execute(legacy, """
        CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT);
        INSERT INTO kv VALUES ('projectInfo', '{"id":"project-one","name":"Project One"}');
        """)
        try ProjectIdentityRewrite.rewrite(databaseURL: legacy, projectInfo: ["id": "project-copy", "name": "Project One"], from: "project-one", to: "project-copy")
        try expectRows(legacy, "SELECT value FROM kv WHERE key = 'projectInfo'", [#"{"id":"project-copy","name":"Project One"}"#])
        print("PASS: legacy kv projectInfo rewritten")
    }

    static func expectRows(_ url: URL, _ sql: String, _ expected: [String]) throws {
        let rows = try query(url, sql)
        precondition(rows == expected, "\(sql) returned \(rows)")
    }

    static func execute(_ url: URL, _ sql: String) throws {
        var database: OpaquePointer?
        guard sqlite3_open(url.path, &database) == SQLITE_OK else { throw CocoaError(.fileWriteUnknown) }
        defer { sqlite3_close(database) }
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else {
            throw CocoaError(.fileWriteUnknown, userInfo: [NSDebugDescriptionErrorKey: String(cString: sqlite3_errmsg(database))])
        }
    }

    static func query(_ url: URL, _ sql: String) throws -> [String] {
        var database: OpaquePointer?
        guard sqlite3_open_v2(url.path, &database, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else { throw CocoaError(.fileReadUnknown) }
        defer { sqlite3_close(database) }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else { throw CocoaError(.fileReadUnknown) }
        defer { sqlite3_finalize(statement) }
        var rows: [String] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            rows.append(String(cString: sqlite3_column_text(statement, 0)))
        }
        return rows
    }
}
