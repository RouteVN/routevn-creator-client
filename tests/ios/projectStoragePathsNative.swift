import Foundation
import SQLite3

@main
struct ProjectStoragePathsNativeTests {
    static func main() throws {
        let fm = FileManager.default
        let fixture = fm.temporaryDirectory.appendingPathComponent("routevn-storage-test-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: fixture) }
        let provider = fixture.appendingPathComponent("File Provider Storage", isDirectory: true)
        let app = fixture.appendingPathComponent("App", isDirectory: true)
        let oldDatabases = app.appendingPathComponent("databases/projects", isDirectory: true)
        let oldProjects = app.appendingPathComponent("projects", isDirectory: true)
        try fm.createDirectory(at: provider, withIntermediateDirectories: true)
        try fm.createDirectory(at: oldDatabases, withIntermediateDirectories: true)
        try fm.createDirectory(at: oldProjects, withIntermediateDirectories: true)
        let config = app.appendingPathComponent("setup.json")
        let setup = ProjectFolderSetup(configurationURL: config, appContainerURL: app)
        _ = try setup.confirm(selection: provider)
        let paths = ProjectStoragePaths(libraryFolder: { try setup.openProjectFolder() })
        let library = provider.appendingPathComponent("RouteVN Projects", isDirectory: true)

        // Existing internal projects are ignored without deleting their data.
        let oldDatabaseFolder = oldDatabases.appendingPathComponent("legacy-project", isDirectory: true)
        let oldFiles = oldProjects.appendingPathComponent("legacy-project/files", isDirectory: true)
        try fm.createDirectory(at: oldDatabaseFolder, withIntermediateDirectories: true)
        try fm.createDirectory(at: oldFiles, withIntermediateDirectories: true)
        let legacyDatabase = oldDatabaseFolder.appendingPathComponent("project.db")
        try writeDatabase(legacyDatabase, value: "Existing project")
        try Data("Existing asset".utf8).write(to: oldFiles.appendingPathComponent("asset-1"))
        let ignoredInternal = try paths.location(projectId: "legacy-project")
        precondition(ignoredInternal.database == library.appendingPathComponent("legacy-project/project.db"))
        precondition(!fm.fileExists(atPath: ignoredInternal.database.path))
        let initialIds = try paths.projectIds()
        precondition(initialIds.isEmpty)
        do {
            try paths.ensureDirectories(projectId: "legacy-project", createProject: false)
            preconditionFailure("Opened a project from internal storage")
        } catch {}

        // Creation/import resolution must use the library even if an internal
        // project with the same id exists. It must never reuse the internal copy.
        try paths.ensureDirectories(projectId: "legacy-project", createProject: true)
        let replacement = try paths.location(projectId: "legacy-project")
        precondition(replacement.directory == library.appendingPathComponent("legacy-project", isDirectory: true))
        try writeDatabase(replacement.database, value: "Selected folder project")
        try Data("Selected folder asset".utf8).write(to: replacement.directory.appendingPathComponent("files/asset-1"))

        // The real SQLite file and all asset folders must share the selected root.
        try paths.ensureDirectories(projectId: "new-project", createProject: true)
        let created = try paths.location(projectId: "new-project")
        precondition(created.database == library.appendingPathComponent("new-project/project.db"))
        try writeDatabase(created.database, value: "Project One")
        try Data("New asset".utf8).write(to: created.directory.appendingPathComponent("files/asset-1"))
        try Data("image/png".utf8).write(to: created.directory.appendingPathComponent("file-metadata/asset-1.mime"))
        precondition(!fm.fileExists(atPath: oldDatabases.appendingPathComponent("new-project").path))
        precondition(!fm.fileExists(atPath: oldProjects.appendingPathComponent("new-project").path))

        let preview = try paths.preview(projectName: " Project/One... ")
        precondition(preview == library.appendingPathComponent("Project-One", isDirectory: true))
        precondition(!fm.fileExists(atPath: preview.path), "Preview must not reserve or create a folder")
        try paths.ensureDirectories(projectId: "named-one", createProject: true, projectName: " Project/One... ")
        let named = try paths.location(projectId: "named-one")
        precondition(named.directory == preview)
        try writeDatabase(named.database, value: "Project One")
        try Data("Named asset".utf8).write(to: named.directory.appendingPathComponent("files/asset-1"))
        // The collision policy is case-insensitive, including on case-sensitive providers.
        let collision = try paths.preview(projectName: "project/one")
        precondition(collision.lastPathComponent == "project-one (2)")
        try paths.ensureDirectories(projectId: "named-two", createProject: true, projectName: "project/one")
        let second = try paths.location(projectId: "named-two")
        precondition(second.directory == collision)
        try writeDatabase(second.database, value: "Project Two")
        do {
            try paths.ensureDirectories(projectId: "named-one", createProject: true, projectName: "Different Name")
            preconditionFailure("Reused an existing project id")
        } catch {}
        precondition(!fm.fileExists(atPath: library.appendingPathComponent("Different Name").path))
        precondition(ProjectStoragePaths.sanitizedFolderName("../") == "-")
        precondition(ProjectStoragePaths.sanitizedFolderName(" .. ") == "Untitled Project")
        precondition(ProjectStoragePaths.sanitizedFolderName("CON") == "_CON")
        precondition(ProjectStoragePaths.sanitizedFolderName("物語 🎨") == "物語 🎨")
        precondition(ProjectStoragePaths.sanitizedFolderName(String(repeating: "界", count: 200)).utf8.count <= 180)
        try fm.createDirectory(at: library.appendingPathComponent("Occupied"), withIntermediateDirectories: false)
        let occupiedPreview = try paths.preview(projectName: "Occupied")
        precondition(occupiedPreview.lastPathComponent == "Occupied (2)")

        let reopenedSetup = ProjectFolderSetup(configurationURL: config, appContainerURL: app)
        let reopened = ProjectStoragePaths(libraryFolder: { try reopenedSetup.openProjectFolder() })
        let ids = try reopened.projectIds()
        precondition(ids == ["Occupied", "legacy-project", "named-one", "named-two", "new-project"])
        let reopenedNamed = try reopened.location(projectId: "named-one")
        precondition(reopenedNamed.directory == preview)
        let namedValue = try readDatabase(reopenedNamed.database)
        let namedAsset = try String(contentsOf: reopenedNamed.directory.appendingPathComponent("files/asset-1"), encoding: .utf8)
        precondition(namedValue == "Project One" && namedAsset == "Named asset")
        // The folder name is independent of its persistent project identity.
        let renamed = library.appendingPathComponent("Renamed Folder", isDirectory: true)
        try fm.moveItem(at: reopenedNamed.directory, to: renamed)
        let movedLocation = try reopened.location(projectId: "named-one")
        precondition(movedLocation.directory == renamed)
        let movedValue = try readDatabase(movedLocation.database)
        precondition(movedValue == "Project One")
        let newLocation = try reopened.location(projectId: "new-project")
        let persisted = try readDatabase(newLocation.database)
        precondition(persisted == "Project One")
        let newAsset = try String(contentsOf: newLocation.directory.appendingPathComponent("files/asset-1"), encoding: .utf8)
        precondition(newAsset == "New asset")
        let oldValue = try readDatabase(legacyDatabase)
        let oldAsset = try String(contentsOf: oldFiles.appendingPathComponent("asset-1"), encoding: .utf8)
        precondition(oldValue == "Existing project" && oldAsset == "Existing asset")

        // Removing the selected copy must hide the project rather than reveal
        // the old internal copy or recreate it through asset writes.
        try fm.removeItem(at: replacement.directory)
        let remainingIds = try reopened.projectIds()
        precondition(!remainingIds.contains("legacy-project"))
        do {
            try reopened.ensureDirectories(projectId: "legacy-project", createProject: false)
            preconditionFailure("Fell back to the internal copy")
        } catch {}

        do {
            try reopened.ensureDirectories(projectId: "missing-project", createProject: false)
            preconditionFailure("Writing an asset recreated a missing project")
        } catch {}
        precondition(!fm.fileExists(atPath: library.appendingPathComponent("missing-project").path))
        for invalidId in ["../escape", "a/b", "", ".", ".."] {
            do {
                _ = try reopened.location(projectId: invalidId)
                preconditionFailure("Invalid project id accepted")
            } catch {}
        }
        try fm.createSymbolicLink(at: library.appendingPathComponent("escape"), withDestinationURL: app)
        do {
            _ = try reopened.location(projectId: "escape")
            preconditionFailure("Symlink escaped the selected folder")
        } catch {}

        // Losing the selected folder must not fall back to internal storage.
        try fm.moveItem(at: library, to: provider.appendingPathComponent("Moved Projects"))
        precondition(reopenedSetup.status()["configured"] as? Bool == false)
        do {
            try reopened.ensureDirectories(projectId: "after-loss", createProject: true)
            preconditionFailure("Missing library silently fell back")
        } catch {}
        precondition(!fm.fileExists(atPath: library.path))
        precondition(!fm.fileExists(atPath: oldProjects.appendingPathComponent("after-loss").path))
        do {
            _ = try reopened.location(projectId: "legacy-project")
            preconditionFailure("Missing library allowed an internal project")
        } catch {}
        do {
            _ = try reopened.projectIds()
            preconditionFailure("Missing library listed internal projects")
        } catch {}
        let untouchedInternal = try readDatabase(legacyDatabase)
        precondition(untouchedInternal == "Existing project")
        print("PASS: sanitized names, collisions, persistent identity, folder rename, SQLite/assets, internal projects ignored and untouched, missing-folder failures and path boundaries")
    }

    static func writeDatabase(_ url: URL, value: String) throws {
        var db: OpaquePointer?
        guard sqlite3_open(url.path, &db) == SQLITE_OK else { throw CocoaError(.fileWriteUnknown) }
        defer { sqlite3_close(db) }
        guard sqlite3_exec(db, "PRAGMA journal_mode=WAL; CREATE TABLE fixture (value TEXT); INSERT INTO fixture VALUES ('\(value)');", nil, nil, nil) == SQLITE_OK else {
            throw CocoaError(.fileWriteUnknown)
        }
    }

    static func readDatabase(_ url: URL) throws -> String {
        var db: OpaquePointer?
        guard sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else { throw CocoaError(.fileReadUnknown) }
        defer { sqlite3_close(db) }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, "SELECT value FROM fixture", -1, &statement, nil) == SQLITE_OK else { throw CocoaError(.fileReadUnknown) }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW, let value = sqlite3_column_text(statement, 0) else { throw CocoaError(.fileReadUnknown) }
        return String(cString: value)
    }
}
