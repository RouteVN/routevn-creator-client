// Run with the production ProjectFolderSetup.swift using swiftc on macOS.
// Exercises actual Foundation filesystem/bookmark operations in a disposable
// directory. Physical iOS provider permissions still require device testing.
import Foundation

@main
struct ProjectFolderSetupNativeTests {
    static func main() throws {
        let fm = FileManager.default
        let fixture = fm.temporaryDirectory.appendingPathComponent("routevn-folder-test-\(UUID().uuidString)", isDirectory: true)
        defer { try? fm.removeItem(at: fixture) }
        let local = fixture.appendingPathComponent("File Provider Storage", isDirectory: true)
        let app = fixture.appendingPathComponent("App", isDirectory: true)
        try fm.createDirectory(at: local, withIntermediateDirectories: true)
        try fm.createDirectory(at: app, withIntermediateDirectories: true)
        let config = app.appendingPathComponent("setup.json")
        let setup = ProjectFolderSetup(configurationURL: config, appContainerURL: app)
        let projects = local.appendingPathComponent("RouteVN Projects", isDirectory: true)

        precondition(setup.status()["configured"] as? Bool == false)
        let preview = try setup.preview(selection: local)
        precondition(preview["displayPath"] as? String == "On My iPhone/RouteVN Projects")
        precondition(!fm.fileExists(atPath: projects.path))
        precondition(!fm.fileExists(atPath: config.path))

        let confirmed = try setup.confirm(selection: local)
        precondition(confirmed["configured"] as? Bool == true)
        let emptyContents = try fm.contentsOfDirectory(atPath: projects.path)
        precondition(emptyContents.isEmpty)
        let saved = try Data(contentsOf: config)
        let reloaded = ProjectFolderSetup(configurationURL: config, appContainerURL: app)
        precondition(reloaded.status()["configured"] as? Bool == true)

        // The hardware name changes only display text, never the saved folder.
        let tabletConfig = app.appendingPathComponent("tablet-setup.json")
        let tablet = ProjectFolderSetup(configurationURL: tabletConfig, appContainerURL: app, deviceName: "iPad")
        precondition(tablet.status()["deviceName"] as? String == "iPad")
        let tabletPreview = try tablet.preview(selection: local)
        precondition(tabletPreview["displayPath"] as? String == "On My iPad/RouteVN Projects")
        let tabletConfirmed = try tablet.confirm(selection: local)
        precondition(tabletConfirmed["deviceName"] as? String == "iPad")
        let tabletReloaded = ProjectFolderSetup(configurationURL: tabletConfig, appContainerURL: app, deviceName: "iPad")
        let tabletFolder = try tabletReloaded.openProjectFolder()
        precondition(tabletFolder == projects)
        let tabletDescriptor = tabletReloaded.status()["folder"] as? [String: Any]
        precondition(tabletDescriptor?["displayPath"] as? String == "On My iPad/RouteVN Projects")

        let existingData = projects.appendingPathComponent("Project One.txt")
        try Data("Existing project data".utf8).write(to: existingData)
        let existingProject = projects.appendingPathComponent("Project One", isDirectory: true)
        let existingAssets = existingProject.appendingPathComponent("files", isDirectory: true)
        try fm.createDirectory(at: existingAssets, withIntermediateDirectories: true)
        let database = existingProject.appendingPathComponent("project.db")
        let asset = existingAssets.appendingPathComponent("image.png")
        let databaseBytes = Data([0, 1, 2, 255, 0, 128])
        let assetBytes = Data([137, 80, 78, 71, 13, 10])
        try databaseBytes.write(to: database)
        try assetBytes.write(to: asset)

        // Choosing the parent again must reuse the whole existing tree. A Save
        // export could replace this directory before our callback; creation must
        // remain app-controlled, with no remove/copy/replace operation involved.
        for _ in 0..<2 {
            _ = try setup.confirm(selection: local)
            let preservedDatabase = try Data(contentsOf: database)
            let preservedAsset = try Data(contentsOf: asset)
            let libraryContents = try fm.contentsOfDirectory(atPath: projects.path).sorted()
            let projectContents = try fm.contentsOfDirectory(atPath: existingProject.path).sorted()
            let assetContents = try fm.contentsOfDirectory(atPath: existingAssets.path)
            precondition(preservedDatabase == databaseBytes)
            precondition(preservedAsset == assetBytes)
            precondition(libraryContents == ["Project One", "Project One.txt"])
            precondition(projectContents == ["files", "project.db"])
            precondition(assetContents == ["image.png"])
        }
        let reuse = try setup.preview(selection: projects)
        precondition(reuse["displayPath"] as? String == preview["displayPath"] as? String)
        _ = try setup.confirm(selection: projects)
        precondition(!fm.fileExists(atPath: projects.appendingPathComponent("RouteVN Projects").path))
        let preservedContents = try String(contentsOf: existingData, encoding: .utf8)
        precondition(preservedContents == "Existing project data")

        // A selected folder is already the library; never add another level.
        let custom = local.appendingPathComponent("My Projects", isDirectory: true)
        try fm.createDirectory(at: custom, withIntermediateDirectories: true)
        let customPreview = try setup.preview(selection: custom)
        precondition(customPreview["displayPath"] as? String == "On My iPhone/My Projects")
        precondition(!fm.fileExists(atPath: custom.appendingPathComponent("RouteVN Projects").path))
        _ = try setup.confirm(selection: custom)
        let customReloaded = ProjectFolderSetup(configurationURL: config, appContainerURL: app)
        let customLibrary = try customReloaded.openProjectFolder()
        precondition(customLibrary == custom)
        precondition(!fm.fileExists(atPath: custom.appendingPathComponent("RouteVN Projects").path))

        // A same-named file inside a custom folder must remain untouched.
        let existingFile = custom.appendingPathComponent("RouteVN Projects")
        try Data("Keep this file".utf8).write(to: existingFile)
        _ = try setup.confirm(selection: custom)
        let preservedFile = try String(contentsOf: existingFile, encoding: .utf8)
        precondition(preservedFile == "Keep this file")

        // A nested folder with the provider root's name is still a custom folder.
        let nested = custom.appendingPathComponent("File Provider Storage", isDirectory: true)
        try fm.createDirectory(at: nested, withIntermediateDirectories: true)
        let nestedPreview = try setup.preview(selection: nested)
        precondition(nestedPreview["displayPath"] as? String == "On My iPhone/My Projects/File Provider Storage")

        // Existing configurations keep their recorded child, including libraries
        // chosen under a custom folder before this selection rule changed.
        let legacyParent = local.appendingPathComponent("Older Location", isDirectory: true)
        let legacyLibrary = legacyParent.appendingPathComponent("RouteVN Projects", isDirectory: true)
        try fm.createDirectory(at: legacyLibrary, withIntermediateDirectories: true)
        let legacyBookmark = try legacyParent.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
        let legacyConfig: [String: Any] = ["version": 1, "parentBookmark": legacyBookmark.base64EncodedString(), "childName": "RouteVN Projects"]
        try JSONSerialization.data(withJSONObject: legacyConfig).write(to: config)
        let legacyReloaded = ProjectFolderSetup(configurationURL: config, appContainerURL: app)
        let restoredLegacyLibrary = try legacyReloaded.openProjectFolder()
        precondition(restoredLegacyLibrary == legacyLibrary)

        do {
            _ = try setup.preview(selection: app)
            preconditionFailure("An app-owned folder was accepted")
        } catch ProjectFolderSetupError.appFolder {}
        let cloud = fixture.appendingPathComponent("Cloud", isDirectory: true)
        try fm.createDirectory(at: cloud, withIntermediateDirectories: true)
        do {
            _ = try setup.preview(selection: cloud)
            preconditionFailure("An unknown provider was labeled as local storage")
        } catch ProjectFolderSetupError.localFolder {}

        let conflictParent = fixture.appendingPathComponent("Conflict/File Provider Storage", isDirectory: true)
        try fm.createDirectory(at: conflictParent, withIntermediateDirectories: true)
        try Data("Keep this file".utf8).write(to: conflictParent.appendingPathComponent("RouteVN Projects"))
        let configurationBeforeConflict = try Data(contentsOf: config)
        do {
            _ = try setup.confirm(selection: conflictParent)
            preconditionFailure("An existing file was replaced")
        } catch ProjectFolderSetupError.nameConflict {}
        let conflictContents = try String(contentsOf: conflictParent.appendingPathComponent("RouteVN Projects"), encoding: .utf8)
        let configurationAfterConflict = try Data(contentsOf: config)
        precondition(conflictContents == "Keep this file")
        precondition(configurationAfterConflict == configurationBeforeConflict)
        precondition(reloaded.status()["configured"] as? Bool == true)

        // Restore the parent-based bookmark and remove the child directory.
        // Reopening must request reconnection, never recreate an empty library.
        try saved.write(to: config)
        try fm.removeItem(at: projects)
        precondition(reloaded.status()["reason"] as? String == "reconnect")
        precondition(!fm.fileExists(atPath: projects.path))
        print("PASS: root-only default folder, custom/nested folders used directly, old bookmarks preserved, confirmation, existing-data preservation, app/provider rejection, name conflict and missing-folder recovery")
    }
}
