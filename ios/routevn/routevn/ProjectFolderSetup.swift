import Foundation

enum ProjectFolderSetupError: String, LocalizedError {
    case appFolder, localFolder, notDirectory, nameConflict

    var errorDescription: String? { rawValue }
}

/// Owns the selected project library and its security-scoped access. Existing
/// projects are never moved when the user selects a library.
final class ProjectFolderSetup {
    private let configurationURL: URL
    private let appContainerURL: URL
    private let deviceName: String
    private let folderName = "RouteVN Projects"
    private let accessLock = NSLock()
    private var activeConfiguration: Data?
    private var activeFolder: URL?
    // SQLite handles and asset streams can outlive an individual bridge call.
    // Retain each acquired scope until storage is released, balancing every start.
    private var accessedSelections: [URL] = []

    deinit {
        for selection in accessedSelections {
            selection.stopAccessingSecurityScopedResource()
        }
    }

    private struct Configuration: Codable {
        let version: Int
        let parentBookmark: Data
        let childName: String
    }

    init(configurationURL: URL, appContainerURL: URL = URL(fileURLWithPath: NSHomeDirectory()), deviceName: String = "iPhone") {
        self.configurationURL = configurationURL
        self.appContainerURL = appContainerURL.resolvingSymlinksInPath()
        self.deviceName = deviceName
    }

    func preview(selection: URL) throws -> [String: Any] {
        let parent = try validateSelection(selection)
        let target = projectFolder(in: parent)
        if FileManager.default.fileExists(atPath: target.path) {
            guard try target.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true else {
                throw ProjectFolderSetupError.nameConflict
            }
        }
        return descriptor(target)
    }

    func confirm(selection: URL) throws -> [String: Any] {
        let parent = try validateSelection(selection)
        let target = projectFolder(in: parent)
        var coordinationError: NSError?
        var operationError: Error?
        NSFileCoordinator().coordinate(writingItemAt: parent, options: .forMerging, error: &coordinationError) { _ in
            do {
                _ = try self.preview(selection: parent)
                if !FileManager.default.fileExists(atPath: target.path) {
                    try FileManager.default.createDirectory(at: target, withIntermediateDirectories: false)
                }
                try self.checkReadWriteAccess(target)
                let bookmark = try selection.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
                let configuration = Configuration(
                    version: 1,
                    parentBookmark: bookmark,
                    childName: target == parent ? "" : self.folderName
                )
                try FileManager.default.createDirectory(at: self.configurationURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                try JSONEncoder().encode(configuration).write(to: self.configurationURL, options: .atomic)
            } catch {
                operationError = error
            }
        }
        if let coordinationError { throw coordinationError }
        if let operationError { throw operationError }
        return ["configured": true, "folder": descriptor(target), "deviceName": deviceName]
    }

    func status() -> [String: Any] {
        guard FileManager.default.fileExists(atPath: configurationURL.path) else {
            return ["configured": false, "deviceName": deviceName]
        }
        do {
            return ["configured": true, "folder": descriptor(try openProjectFolder()), "deviceName": deviceName]
        } catch {
            // Keep the bookmark for recovery; never silently create another library.
            return ["configured": false, "reason": "reconnect", "deviceName": deviceName]
        }
    }

    func openProjectFolder() throws -> URL {
        accessLock.lock()
        defer { accessLock.unlock() }
        let data = try Data(contentsOf: configurationURL)
        if data == activeConfiguration, let folder = activeFolder {
            try requireAvailableFolder(folder)
            return folder
        }

        let configuration = try JSONDecoder().decode(Configuration.self, from: data)
        guard configuration.version == 1,
              configuration.childName.isEmpty || configuration.childName == folderName else {
            throw ProjectFolderSetupError.notDirectory
        }
        var stale = false
        let selection = try URL(resolvingBookmarkData: configuration.parentBookmark, bookmarkDataIsStale: &stale)
        let accessed = selection.startAccessingSecurityScopedResource()
        do {
            let parent = try validateSelection(selection)
            let target = configuration.childName.isEmpty ? parent : parent.appendingPathComponent(configuration.childName, isDirectory: true)
            var coordinationError: NSError?
            var operationError: Error?
            NSFileCoordinator().coordinate(readingItemAt: target, options: [], error: &coordinationError) { coordinatedURL in
                do {
                    try self.requireAvailableFolder(coordinatedURL)
                    _ = try FileManager.default.contentsOfDirectory(at: coordinatedURL, includingPropertiesForKeys: nil)
                } catch { operationError = error }
            }
            if let coordinationError { throw coordinationError }
            if let operationError { throw operationError }
            var savedData = data
            if stale {
                let refreshed = Configuration(version: 1, parentBookmark: try selection.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil), childName: configuration.childName)
                savedData = try JSONEncoder().encode(refreshed)
                try savedData.write(to: configurationURL, options: .atomic)
            }
            if accessed { accessedSelections.append(selection) }
            activeConfiguration = savedData
            activeFolder = target
            return target
        } catch {
            if accessed { selection.stopAccessingSecurityScopedResource() }
            throw error
        }
    }

    private func requireAvailableFolder(_ folder: URL) throws {
        guard try folder.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true,
              FileManager.default.isWritableFile(atPath: folder.path) else {
            throw ProjectFolderSetupError.notDirectory
        }
    }

    private func validateSelection(_ selection: URL) throws -> URL {
        let url = selection.resolvingSymlinksInPath().standardizedFileURL
        let path = url.path
        guard url.isFileURL else { throw ProjectFolderSetupError.localFolder }
        if path == appContainerURL.path || path.hasPrefix(appContainerURL.path + "/") ||
            path.contains("/Containers/Data/Application/") {
            throw ProjectFolderSetupError.appFolder
        }
        let values = try url.resourceValues(forKeys: [.isDirectoryKey, .isUbiquitousItemKey])
        guard values.isDirectory == true else { throw ProjectFolderSetupError.notDirectory }
        // The system local provider's URLs are discovered through the picker,
        // never constructed from a hard-coded app-group UUID. Restrict project libraries
        // to its recognizable local storage; don't label an unknown
        // provider (or iCloud) as storage on this device.
        guard values.isUbiquitousItem != true,
              url.pathComponents.contains("File Provider Storage") else {
            throw ProjectFolderSetupError.localFolder
        }
        return url
    }

    private func projectFolder(in parent: URL) -> URL {
        let components = parent.pathComponents
        let isLocalRoot = components.firstIndex(of: "File Provider Storage") == components.count - 1
        return isLocalRoot ? parent.appendingPathComponent(folderName, isDirectory: true) : parent
    }

    private func descriptor(_ url: URL) -> [String: Any] {
        let components = url.pathComponents
        let storageIndex = components.firstIndex(of: "File Provider Storage")!
        let relativeComponents = Array(components.dropFirst(storageIndex + 1))
        return [
            "name": url.lastPathComponent,
            "displayPath": (["On My \(deviceName)"] + relativeComponents).joined(separator: "/"),
        ]
    }

    private func checkReadWriteAccess(_ folder: URL) throws {
        _ = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
        let probe = folder.appendingPathComponent(".routevn-access-\(UUID().uuidString)")
        let data = Data("RouteVN folder access check".utf8)
        try data.write(to: probe, options: .withoutOverwriting)
        defer { try? FileManager.default.removeItem(at: probe) }
        guard try Data(contentsOf: probe) == data else { throw ProjectFolderSetupError.notDirectory }
        try FileManager.default.removeItem(at: probe)
    }
}
