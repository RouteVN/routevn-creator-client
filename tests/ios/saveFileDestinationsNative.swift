import Foundation

@main
struct SaveFileDestinationsNativeTests {
    static func main() throws {
        let fm = FileManager.default
        let fixture = fm.temporaryDirectory.appendingPathComponent("routevn-save-test-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: fixture) }
        let folder = fixture.appendingPathComponent("Chosen Folder", isDirectory: true)
        let staging = fixture.appendingPathComponent("Cache", isDirectory: true)
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        let destinations = SaveFileDestinations(stagingRoot: staging)
        let filename = "Project One_v1.zip"
        let uri = try destinations.select(folder: folder, filename: filename)
        precondition(SaveFileDestinations.isSaveURI(uri))
        let beforeExport = try fm.contentsOfDirectory(atPath: folder.path)
        precondition(beforeExport.isEmpty, "Selecting a destination must not create output")

        let bytes = Data([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])
        let result = try destinations.write(to: uri) { url in
            precondition(url.path.hasPrefix(staging.path + "/"))
            try bytes.write(to: url)
            return "export statistics"
        }
        precondition(result.url == folder.appendingPathComponent(filename))
        precondition(result.value == "export statistics")
        let savedBytes = try Data(contentsOf: result.url)
        precondition(savedBytes == bytes)
        do {
            _ = try destinations.write(to: uri) { _ in }
            preconditionFailure("A completed save token must not be reusable")
        } catch SaveFileDestinationError.unavailable {}

        // Choose the same name again. The existing ZIP must remain untouched.
        let duplicate = try destinations.select(folder: folder, filename: filename)
        let secondBytes = Data("second export".utf8)
        let second = try destinations.write(to: duplicate) { try secondBytes.write(to: $0) }
        precondition(second.url.lastPathComponent == "Project One_v1 (2).zip")
        let originalBytes = try Data(contentsOf: result.url)
        let duplicateBytes = try Data(contentsOf: second.url)
        precondition(originalBytes == bytes && duplicateBytes == secondBytes)

        // A failed native build leaves no partial export, and the JS fallback
        // can retry the same chosen destination.
        let retry = try destinations.select(folder: folder, filename: "Retry.zip")
        do {
            _ = try destinations.write(to: retry) { url in
                try Data("incomplete".utf8).write(to: url)
                throw SaveFileDestinationError.unavailable
            }
            preconditionFailure("A failed build must not publish output")
        } catch SaveFileDestinationError.unavailable {}
        precondition(!fm.fileExists(atPath: folder.appendingPathComponent("Retry.zip").path))
        let retried = try destinations.write(to: retry) { try bytes.write(to: $0) }
        let retriedBytes = try Data(contentsOf: retried.url)
        precondition(retriedBytes == bytes)

        // Removing a selected folder must not recreate it or save elsewhere.
        let removed = fixture.appendingPathComponent("Removed Folder", isDirectory: true)
        try fm.createDirectory(at: removed, withIntermediateDirectories: true)
        let missing = try destinations.select(folder: removed, filename: "Missing.zip")
        try fm.removeItem(at: removed)
        do {
            _ = try destinations.write(to: missing) { try bytes.write(to: $0) }
            preconditionFailure("Saving into a missing folder must fail")
        } catch {}
        precondition(!fm.fileExists(atPath: removed.path))

        for invalid in ["../escape.zip", "a/b.zip", "a\\b.zip", "", ".", ".."] {
            do {
                _ = try destinations.select(folder: folder, filename: invalid)
                preconditionFailure("Invalid filename accepted")
            } catch SaveFileDestinationError.invalidFilename {}
        }
        let stagingFiles = try fm.contentsOfDirectory(atPath: staging.path)
        let publishedFiles = try fm.contentsOfDirectory(atPath: folder.path)
        precondition(stagingFiles.isEmpty)
        precondition(publishedFiles.sorted() == [filename, "Project One_v1 (2).zip", "Retry.zip"].sorted())
        print("PASS: selected-folder exports, unique filenames, failed-write cleanup, fallback retry, expired targets and path validation")
    }
}
