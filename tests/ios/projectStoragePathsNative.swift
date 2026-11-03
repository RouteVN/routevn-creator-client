import Foundation
import SQLite3

@main
struct ProjectStoragePathsNativeTests {
    static func main() throws {
        try duplicateIdentities()
        try libraryCopies()
        try listedFolderKeepsDuplicatedId()
        try invalidIdentities()
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

    static func duplicateIdentities() throws {
        let fm = FileManager.default
        let library = fm.temporaryDirectory.appendingPathComponent("routevn-duplicate-test-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: library) }
        try fm.createDirectory(at: library, withIntermediateDirectories: true)
        let paths = ProjectStoragePaths(libraryFolder: { library })
        try paths.ensureDirectories(projectId: "project-one", createProject: true, projectName: "Project One")
        try paths.ensureDirectories(projectId: "project-two", createProject: true, projectName: "Project Two")
        let original = try paths.location(projectId: "project-one")
        let unrelated = try paths.location(projectId: "project-two")
        try writeDatabase(original.database, value: "Project One")
        try writeDatabase(unrelated.database, value: "Project Two")
        let identity = try Data(contentsOf: original.directory.appendingPathComponent(".routevn-project.json"))
        // Files copies the identity with the folder. Include an id-named copy
        // to ensure ambiguous lookup cannot fall back to that directory either.
        let copies = ["Project One Copy", "project-one"].map { library.appendingPathComponent($0) }
        for copy in copies { try fm.copyItem(at: original.directory, to: copy) }

        // Test both a resolver that saw the original and a fresh app instance.
        for resolver in [paths, ProjectStoragePaths(libraryFolder: { library })] {
            do {
                _ = try resolver.location(projectId: "project-one")
                preconditionFailure("Resolved an ambiguous identity")
            } catch let error as CocoaError {
                precondition(error.code == .fileReadCorruptFile)
            }
            let other = try resolver.location(projectId: "project-two")
            let value = try readDatabase(other.database)
            precondition(value == "Project Two")
            let ids = try resolver.projectIds()
            precondition(ids == ["project-two"], "A duplicate must not hide unrelated projects")
            let newLocation = try resolver.location(projectId: "project-three")
            precondition(newLocation.directory.path == library.resolvingSymlinksInPath().appendingPathComponent("project-three").path)
        }
        try paths.ensureDirectories(projectId: "project-three", createProject: true, projectName: "Project Three")
        let created = try paths.location(projectId: "project-three")
        try writeDatabase(created.database, value: "Project Three")
        let createdValue = try readDatabase(created.database)
        precondition(createdValue == "Project Three")
        // Discovery must not rewrite identities or choose a copy arbitrarily.
        for directory in [original.directory] + copies {
            let persistedIdentity = try Data(contentsOf: directory.appendingPathComponent(".routevn-project.json"))
            precondition(persistedIdentity == identity)
        }
        for copy in copies { try fm.removeItem(at: copy) }
        let recovered = try paths.location(projectId: "project-one")
        precondition(recovered.directory == original.directory)
        let ids = try paths.projectIds()
        precondition(ids == ["project-one", "project-three", "project-two"])
        print("PASS: duplicate identities isolated, cached/fresh lookups rejected, unrelated projects readable, creation and recovery preserved")
    }

    static func libraryCopies() throws {
        let fm = FileManager.default
        let library = fm.temporaryDirectory.appendingPathComponent("routevn-library-copy-test-\(UUID().uuidString)")
        let outside = fm.temporaryDirectory.appendingPathComponent("routevn-library-copy-outside-\(UUID().uuidString)")
        defer {
            try? fm.removeItem(at: library)
            try? fm.removeItem(at: outside)
        }
        try fm.createDirectory(at: library, withIntermediateDirectories: true)
        let paths = ProjectStoragePaths(libraryFolder: { library })
        try paths.ensureDirectories(projectId: "project-one", createProject: true, projectName: "Project One")
        try paths.ensureDirectories(projectId: "project-two", createProject: true, projectName: "Project Two")
        let original = try paths.location(projectId: "project-one")
        try writeDatabase(original.database, value: "Project One")
        let copy = library.appendingPathComponent("Project One Copy", isDirectory: true)
        try fm.copyItem(at: original.directory, to: copy)
        try fm.copyItem(at: original.directory, to: outside)

        // Either folder of a duplicated id is a copy, even when the picked URL
        // spells the path differently (/var is a link to /private/var).
        let spelledCopy = URL(fileURLWithPath: copy.resolvingSymlinksInPath().path.hasPrefix("/var/")
            ? "/private" + copy.resolvingSymlinksInPath().path
            : copy.path, isDirectory: true)
        let pickedCopy = try paths.libraryCopy(of: "project-one", at: spelledCopy)
        precondition(pickedCopy?.lastPathComponent == "Project One Copy")
        let pickedOriginal = try paths.libraryCopy(of: "project-one", at: original.directory)
        precondition(pickedOriginal?.lastPathComponent == "Project One")
        // The one folder that holds an id, and folders outside the library,
        // are not copies.
        let soleHolder = try paths.location(projectId: "project-two")
        let soleHolderCopy = try paths.libraryCopy(of: "project-two", at: soleHolder.directory)
        precondition(soleHolderCopy == nil)
        let outsideCopy = try paths.libraryCopy(of: "project-one", at: outside)
        precondition(outsideCopy == nil)
        do {
            try paths.replaceIdentity(projectId: "project-outside", directory: outside)
            preconditionFailure("Gave a folder outside the library an identity")
        } catch {}

        // The copy takes a new id; the original is found again under its own.
        try paths.replaceIdentity(projectId: "project-copy", directory: pickedCopy!)
        let ids = try paths.projectIds()
        precondition(ids == ["project-copy", "project-one", "project-two"])
        let originalLocation = try paths.location(projectId: "project-one")
        precondition(originalLocation.directory.lastPathComponent == "Project One")
        let copyLocation = try paths.location(projectId: "project-copy")
        precondition(copyLocation.directory.lastPathComponent == "Project One Copy")
        let originalAfter = try paths.libraryCopy(of: "project-one", at: original.directory)
        precondition(originalAfter == nil)
        let copyAfter = try paths.libraryCopy(of: "project-copy", at: copy)
        precondition(copyAfter == nil)

        // A folder with no identity file whose database names a listed project
        // is a copy too.
        let bare = library.appendingPathComponent("Bare Copy", isDirectory: true)
        try fm.createDirectory(at: bare, withIntermediateDirectories: false)
        let bareCopy = try paths.libraryCopy(of: "project-one", at: bare)
        precondition(bareCopy?.lastPathComponent == "Bare Copy")

        // The copy is returned as the library lists it, however the picker
        // spelled it (composed and decomposed accents), because the app's open
        // database connections are keyed by the listed path.
        let accented = library.appendingPathComponent("Caf\u{E9} Copy", isDirectory: true)
        try fm.copyItem(at: original.directory, to: accented)
        let listedAccented = try fm.contentsOfDirectory(at: library, includingPropertiesForKeys: nil)
            .first { $0.lastPathComponent.precomposedStringWithCanonicalMapping == "Caf\u{E9} Copy" }!
        let decomposedPick = library.appendingPathComponent("Cafe\u{301} Copy", isDirectory: true)
        let accentedCopy = try paths.libraryCopy(of: "project-one", at: decomposedPick)
        precondition(accentedCopy?.lastPathComponent == listedAccented.lastPathComponent)
        print("PASS: library copies found by any path spelling, sole holders and outside folders left alone, copy identity replaced")
    }

    static func listedFolderKeepsDuplicatedId() throws {
        let fm = FileManager.default
        let library = fm.temporaryDirectory.appendingPathComponent("routevn-listed-folder-test-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: library) }
        try fm.createDirectory(at: library, withIntermediateDirectories: true)
        let paths = ProjectStoragePaths(libraryFolder: { library })
        try paths.ensureDirectories(projectId: "project-one", createProject: true, projectName: "Project One")
        try paths.ensureDirectories(projectId: "project-two", createProject: true, projectName: "Project Two")
        let original = try paths.location(projectId: "project-one")
        try writeDatabase(original.database, value: "Project One")
        let identity = try Data(contentsOf: original.directory.appendingPathComponent(".routevn-project.json"))
        // The Projects list showed the original before Files duplicated it.
        paths.setListedProjectFiles(["project-one": original.database.path])
        let copy = library.appendingPathComponent("Project One 2", isDirectory: true)
        try fm.copyItem(at: original.directory, to: copy)

        let kept = try paths.location(projectId: "project-one")
        precondition(kept.directory.path == original.directory.path)
        let value = try readDatabase(kept.database)
        precondition(value == "Project One")
        let ids = try paths.projectIds()
        precondition(ids == ["project-one", "project-two"])
        // The copy is the one an import adopts; the original is not a copy.
        let pickedCopy = try paths.libraryCopy(of: "project-one", at: copy)
        precondition(pickedCopy?.lastPathComponent == "Project One 2")
        let pickedOriginal = try paths.libraryCopy(of: "project-one", at: original.directory)
        precondition(pickedOriginal == nil)
        // Nothing in either folder changes.
        for directory in [original.directory, copy] {
            let stored = try Data(contentsOf: directory.appendingPathComponent(".routevn-project.json"))
            precondition(stored == identity)
        }

        // A listed path that is neither folder decides nothing.
        paths.setListedProjectFiles(["project-one": library.appendingPathComponent("Elsewhere/project.db").path])
        do {
            _ = try paths.location(projectId: "project-one")
            preconditionFailure("Resolved a duplicated id without its listed folder")
        } catch let error as CocoaError {
            precondition(error.code == .fileReadCorruptFile)
        }
        let unresolvedIds = try paths.projectIds()
        precondition(unresolvedIds == ["project-two"])
        print("PASS: the listed folder keeps a duplicated id, the copy is left untouched for import, an unknown listed path decides nothing")
    }

    static func invalidIdentities() throws {
        let fm = FileManager.default
        let library = fm.temporaryDirectory.appendingPathComponent("routevn-invalid-identity-test-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: library) }
        try fm.createDirectory(at: library, withIntermediateDirectories: true)
        let paths = ProjectStoragePaths(libraryFolder: { library })
        try paths.ensureDirectories(projectId: "project-one", createProject: true, projectName: "Project One")
        let original = try paths.location(projectId: "project-one")
        try writeDatabase(original.database, value: "Project One")
        let invalidMetadata = [
            "{invalid JSON",
            "{}",
            "{\"version\":2,\"id\":\"project-two\"}",
            "{\"version\":1,\"id\":\"../escape\"}",
        ]
        for (index, metadata) in invalidMetadata.enumerated() {
            let directory = library.appendingPathComponent("invalid-\(index)")
            try fm.createDirectory(at: directory, withIntermediateDirectories: false)
            try Data(metadata.utf8).write(to: directory.appendingPathComponent(".routevn-project.json"))
        }
        // Warm and fresh instances must leave valid projects usable without
        // treating malformed metadata as a legacy folder-name identity.
        for resolver in [paths, ProjectStoragePaths(libraryFolder: { library })] {
            let ids = try resolver.projectIds()
            precondition(ids == ["project-one"])
            let location = try resolver.location(projectId: "project-one")
            let value = try readDatabase(location.database)
            precondition(value == "Project One")
            let newLocation = try resolver.location(projectId: "project-three")
            precondition(newLocation.directory.lastPathComponent == "project-three")
            do {
                _ = try resolver.location(projectId: "invalid-0")
                preconditionFailure("Malformed identity resolved through its folder name")
            } catch {}
        }
        try paths.ensureDirectories(projectId: "project-three", createProject: true, projectName: "Project Three")
        for (index, metadata) in invalidMetadata.enumerated() {
            let file = library.appendingPathComponent("invalid-\(index)/.routevn-project.json")
            let bytes = try Data(contentsOf: file)
            precondition(bytes == Data(metadata.utf8), "Discovery must not modify invalid metadata")
        }
        // A metadata error belongs to one project; loss of the library still fails.
        try fm.removeItem(at: library)
        do {
            _ = try paths.projectIds()
            preconditionFailure("Missing library was treated as an empty library")
        } catch {}
        do {
            _ = try paths.location(projectId: "project-one")
            preconditionFailure("Missing library returned a cached project")
        } catch {}
        print("PASS: malformed identities isolated, valid reads/creation preserved, invalid files untouched and library failures retained")
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
