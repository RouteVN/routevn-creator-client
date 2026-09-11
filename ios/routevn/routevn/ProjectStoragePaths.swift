import Foundation

/// Resolves project databases and assets only within the library selected in Files.
final class ProjectStoragePaths {
    struct Location {
        let database: URL
        let directory: URL
    }

    private let libraryFolder: () throws -> URL
    private let lock = NSRecursiveLock()
    private var locationsByRoot: [String: [String: URL]] = [:]
    private let identityFilename = ".routevn-project.json"

    private struct Identity: Codable {
        let version: Int
        let id: String
    }

    init(libraryFolder: @escaping () throws -> URL) {
        self.libraryFolder = libraryFolder
    }

    func location(projectId: String) throws -> Location {
        lock.lock()
        defer { lock.unlock() }
        guard projectId.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else {
            throw CocoaError(.fileReadInvalidFileName)
        }
        let root = try libraryFolder().resolvingSymlinksInPath().standardizedFileURL
        if let cached = locationsByRoot[root.path]?[projectId],
           FileManager.default.fileExists(atPath: cached.path),
           try projectIdentity(in: checkedDirectory(cached, root: root)) == projectId {
            return Location(database: cached.appendingPathComponent("project.db"), directory: cached)
        }
        let discovered = try discover(in: root)
        let directory = try checkedDirectory(discovered[projectId] ?? root.appendingPathComponent(projectId, isDirectory: true), root: root)
        if let owner = try projectIdentity(in: directory), owner != projectId {
            throw CocoaError(.fileReadCorruptFile)
        }
        return Location(database: directory.appendingPathComponent("project.db"), directory: directory)
    }

    func projectIds() throws -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return try discover(in: libraryFolder().resolvingSymlinksInPath().standardizedFileURL).keys.sorted()
    }

    func preview(projectName: String) throws -> URL {
        let root = try libraryFolder().resolvingSymlinksInPath().standardizedFileURL
        return try availableDirectory(projectName: projectName, root: root)
    }

    // Keep names readable, including non-Latin writing. Restrict only unsafe
    // filename characters, hidden/dot names, and excessive UTF-8 byte lengths.
    static func sanitizedFolderName(_ name: String) -> String {
        let invalid = CharacterSet(charactersIn: "<>:\"/\\|?*").union(.controlCharacters)
        let replaced = String(String.UnicodeScalarView(name.precomposedStringWithCanonicalMapping.unicodeScalars.map {
            invalid.contains($0) ? UnicodeScalar(45)! : $0
        }))
        var result = replaced.trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: ".")))
        while result.utf8.count > 180 { result.removeLast() }
        result = result.trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: ".")))
        if result.isEmpty { return "Untitled Project" }
        if result.range(of: "^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\\..*)?$", options: [.regularExpression, .caseInsensitive]) != nil {
            result = "_" + result
        }
        return result
    }

    private func availableDirectory(projectName: String, root: URL) throws -> URL {
        let name = Self.sanitizedFolderName(projectName)
        let existing = Set(try FileManager.default.contentsOfDirectory(atPath: root.path).map { $0.precomposedStringWithCanonicalMapping.lowercased() })
        var candidate = name
        var suffix = 2
        while existing.contains(candidate.lowercased()) {
            candidate = "\(name) (\(suffix))"
            suffix += 1
        }
        return root.appendingPathComponent(candidate, isDirectory: true)
    }

    private func checkedDirectory(_ directory: URL, root: URL) throws -> URL {
        let resolved = directory.resolvingSymlinksInPath().standardizedFileURL
        guard resolved.deletingLastPathComponent() == root else { throw CocoaError(.fileReadNoPermission) }
        return resolved
    }

    private func projectIdentity(in directory: URL) throws -> String? {
        let file = directory.appendingPathComponent(identityFilename)
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        guard file.resolvingSymlinksInPath().deletingLastPathComponent() == directory else { throw CocoaError(.fileReadNoPermission) }
        let identity = try JSONDecoder().decode(Identity.self, from: Data(contentsOf: file))
        guard identity.version == 1, identity.id.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else { throw CocoaError(.fileReadCorruptFile) }
        return identity.id
    }

    private func discover(in root: URL) throws -> [String: URL] {
        var locations: [String: URL] = [:]
        for child in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey], options: .skipsHiddenFiles) {
            let values = try child.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard values.isDirectory == true, values.isSymbolicLink != true else { continue }
            let directory = try checkedDirectory(child, root: root)
            let id: String
            if let identity = try projectIdentity(in: directory) {
                id = identity
            } else if child.lastPathComponent.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil {
                id = child.lastPathComponent
            } else { continue }
            guard locations[id] == nil else { throw CocoaError(.fileReadCorruptFile) }
            locations[id] = directory
        }
        locationsByRoot[root.path] = locations
        return locations
    }

    func recordIdentity(projectId: String, directory: URL) throws {
        lock.lock()
        defer { lock.unlock() }
        guard projectId.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else { throw CocoaError(.fileWriteInvalidFileName) }
        let root = try libraryFolder().resolvingSymlinksInPath().standardizedFileURL
        let target = try checkedDirectory(directory, root: root)
        if let owner = try projectIdentity(in: target) {
            guard owner == projectId else { throw CocoaError(.fileWriteFileExists) }
        } else {
            try JSONEncoder().encode(Identity(version: 1, id: projectId)).write(to: target.appendingPathComponent(identityFilename), options: .withoutOverwriting)
        }
        locationsByRoot[root.path, default: [:]][projectId] = target
    }

    func ensureDirectories(projectId: String, createProject: Bool, projectName: String? = nil) throws {
        lock.lock()
        defer { lock.unlock() }
        if createProject, let projectName {
            let existing = try location(projectId: projectId)
            guard !FileManager.default.fileExists(atPath: existing.directory.path),
                  !FileManager.default.fileExists(atPath: existing.database.deletingLastPathComponent().path) else {
                throw CocoaError(.fileWriteFileExists)
            }
            let root = try libraryFolder().resolvingSymlinksInPath().standardizedFileURL
            var coordinationError: NSError?
            var operationError: Error?
            NSFileCoordinator().coordinate(writingItemAt: root, options: .forMerging, error: &coordinationError) { coordinatedRoot in
                do {
                    let directory = try self.availableDirectory(projectName: projectName, root: coordinatedRoot)
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
                    do {
                        try self.createAssetDirectories(in: directory)
                        try self.recordIdentity(projectId: projectId, directory: directory)
                    } catch {
                        try? FileManager.default.removeItem(at: directory)
                        throw error
                    }
                } catch { operationError = error }
            }
            if let coordinationError { throw coordinationError }
            if let operationError { throw operationError }
            return
        }
        let target = try location(projectId: projectId)
        if !createProject && !FileManager.default.fileExists(atPath: target.directory.path) {
            throw CocoaError(.fileNoSuchFile)
        }
        var coordinationError: NSError?
        var operationError: Error?
        NSFileCoordinator().coordinate(writingItemAt: target.directory, options: .forMerging, error: &coordinationError) { directory in
            do {
                try self.createAssetDirectories(in: directory)
            } catch { operationError = error }
        }
        if let coordinationError { throw coordinationError }
        if let operationError { throw operationError }
    }

    private func createAssetDirectories(in directory: URL) throws {
        try FileManager.default.createDirectory(at: directory.appendingPathComponent("files", isDirectory: true), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: directory.appendingPathComponent("file-metadata", isDirectory: true), withIntermediateDirectories: true)
    }
}
