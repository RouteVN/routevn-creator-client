import Foundation
import CryptoKit
import SQLite3
import UIKit
import UniformTypeIdentifiers
import WebKit

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

@main
final class RouteVNAppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = RouteVNViewController()
        self.window = window
        window.makeKeyAndVisible()
        return true
    }
}

final class RouteVNViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler, UIDocumentPickerDelegate {
    private let storage = RouteVNNativeStorage()
    private var webView: WKWebView!
    private var sqliteDatabases: [String: OpaquePointer] = [:]
    private var canGoBackInWebApp = false
    private var pendingDocumentPicker: PendingDocumentPicker?
    private var didRunSmokeTest = false
    private var securityScopedFolders: [String: SecurityScopedFolderSelection] = [:]
    private let securityScopedFoldersLock = NSLock()
    private let backgroundBridgeQueue = DispatchQueue(
        label: "com.routevn.creator.ios.bridge.background",
        qos: .userInitiated
    )

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureWebView()
        loadInitialAppURL()
    }

    deinit {
        closeSqliteDatabases()
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "RouteVNIOS")
    }

    private func configureWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.setURLSchemeHandler(
            RouteVNSchemeHandler(storage: storage),
            forURLScheme: "routevn"
        )

        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = preferences

        let contentController = WKUserContentController()
        #if DEBUG
        let initialPath = ProcessInfo.processInfo.environment["ROUTEVN_IOS_INITIAL_PATH"] ?? ""
        if !initialPath.isEmpty {
            contentController.addUserScript(
                WKUserScript(
                    source: "window.__ROUTEVN_IOS_INITIAL_PATH__ = \(javaScriptStringLiteral(initialPath));",
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true
                )
            )
        }
        #endif
        if isSmokeTestEnabled() {
            contentController.addUserScript(
                WKUserScript(
                    source: "window.__ROUTEVN_IOS_SMOKE_TEST__ = true;",
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true
                )
            )
        }
        contentController.add(self, name: "RouteVNIOS")
        configuration.userContentController = contentController

        webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.allowsBackForwardNavigationGestures = false

        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        view.addSubview(webView)
    }

    private func loadInitialAppURL() {
        #if DEBUG
        let devServerURL = ProcessInfo.processInfo.environment["ROUTEVN_IOS_DEV_SERVER_URL"] ?? ""
        if let url = URL(string: devServerURL), !devServerURL.isEmpty {
            webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
            return
        }
        #endif

        let appURL = URL(string: "routevn://app/ios/index.html")!
        webView.load(URLRequest(url: appURL))
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        if isAppURL(url) || isDebugDevServerURL(url) {
            decisionHandler(.allow)
            return
        }

        if url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        runSmokeTestIfNeeded()
    }

    private func isAppURL(_ url: URL) -> Bool {
        url.scheme == "routevn" && url.host == "app"
    }

    private func isDebugDevServerURL(_ url: URL) -> Bool {
        #if DEBUG
        let devServerURL = ProcessInfo.processInfo.environment["ROUTEVN_IOS_DEV_SERVER_URL"] ?? ""
        guard let configuredURL = URL(string: devServerURL), !devServerURL.isEmpty else {
            return false
        }
        return url.scheme == configuredURL.scheme &&
            url.host == configuredURL.host &&
            url.port == configuredURL.port
        #else
        return false
        #endif
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "RouteVNIOS" else {
            return
        }

        guard
            let body = message.body as? [String: Any],
            let method = body["method"] as? String
        else {
            return
        }

        let requestId = body["id"] as? String
        let payload = body["payload"] as? [String: Any] ?? [:]

        if shouldHandleBridgeMethodInBackground(method) {
            handleBridgeMethodInBackground(method, payload: payload, requestId: requestId)
            return
        }

        do {
            let value = try handleBridgeMethod(method, payload: payload)
            if let requestId {
                sendBridgeSuccess(requestId: requestId, value: value)
            }
        } catch {
            if let requestId {
                sendBridgeFailure(requestId: requestId, error: error)
            } else {
                NSLog("RouteVN iOS bridge call failed: \(error)")
            }
        }
    }

    private func handleBridgeMethod(_ method: String, payload: [String: Any]) throws -> Any {
        switch method {
        case "isDebugBuild":
            #if DEBUG
            return true
            #else
            return false
            #endif
        case "updateBackState":
            canGoBackInWebApp = boolValue(payload["canGoBack"])
            return true
        case "openExternalUrl":
            let urlString = stringValue(payload["url"])
            guard let url = URL(string: urlString), !urlString.isEmpty else {
                throw RouteVNError.message("URL is required.")
            }
            UIApplication.shared.open(url)
            return true
        case "markSplashReady":
            return true
        case "smokeResult":
            if isSmokeTestEnabled() {
                try writeSmokeResult(payload)
            }
            return true
        case "sqliteOpen":
            _ = try openDatabase(dbPath: requiredString(payload, "dbPath"))
            return true
        case "sqliteQuery":
            let database = try openDatabase(dbPath: requiredString(payload, "dbPath"))
            return try queryDatabase(
                database,
                sql: requiredString(payload, "sql"),
                args: payload["args"] as? [Any] ?? []
            )
        case "sqliteExec":
            let database = try openDatabase(dbPath: requiredString(payload, "dbPath"))
            return try executeDatabaseStatement(
                database,
                sql: requiredString(payload, "sql"),
                args: payload["args"] as? [Any] ?? []
            )
        case "sqliteClose":
            closeDatabase(dbPath: try requiredString(payload, "dbPath"))
            return true
        case "ensureProjectStorage":
            try storage.ensureProjectDirectories(projectId: requiredString(payload, "projectId"))
            return true
        case "listProjectFolders":
            return try listProjectFolders()
        case "writeProjectFile":
            return try writeProjectFile(payload)
        case "readProjectFile":
            return try readProjectFile(payload)
        case "readProjectFileMetadata":
            return try readProjectFileMetadata(payload)
        case "writeDownloadFile":
            return try writeDownloadFile(payload)
        case "writeFileToUri":
            return try writeFileToUri(payload)
        case "createDistributionZipStreamedToUri":
            return try createDistributionZipStreamedToUri(payload)
        case "openFilePicker":
            try launchFilePicker(payload)
            return true
        case "openSaveFilePicker":
            try resolveSaveFilePicker(payload)
            return true
        case "openFolderPicker":
            try launchFolderPicker(payload)
            return true
        case "importProjectFolder":
            return try importProjectFolder(uriString: requiredString(payload, "uri"))
        case "exportProjectFolder":
            return try exportProjectFolder(
                projectId: requiredString(payload, "projectId"),
                destinationUriString: stringValue(payload["destinationUri"])
            )
        case "deletePickerRequest":
            try storage.deletePickerRequestFiles(requestId: requiredString(payload, "requestId"))
            return true
        default:
            throw RouteVNError.message("Unknown iOS bridge method: \(method)")
        }
    }

    private func shouldHandleBridgeMethodInBackground(_ method: String) -> Bool {
        switch method {
        case "createDistributionZipStreamedToUri", "importProjectFolder", "exportProjectFolder":
            return true
        default:
            return false
        }
    }

    private func handleBridgeMethodInBackground(
        _ method: String,
        payload: [String: Any],
        requestId: String?
    ) {
        backgroundBridgeQueue.async { [weak self] in
            guard let self else {
                return
            }

            do {
                let value = try self.handleBridgeMethod(method, payload: payload)
                if let requestId {
                    self.sendBridgeSuccess(requestId: requestId, value: value)
                }
            } catch {
                if let requestId {
                    self.sendBridgeFailure(requestId: requestId, error: error)
                } else {
                    NSLog("RouteVN iOS bridge call failed: \(error)")
                }
            }
        }
    }

    private func sendBridgeSuccess(requestId: String, value: Any) {
        let result: [String: Any] = [
            "id": requestId,
            "ok": true,
            "value": value
        ]
        evaluateJavaScriptCallback(name: "__routeVNIOSBridgeResult", result: result)
    }

    private func sendBridgeFailure(requestId: String, error: Error) {
        NSLog("RouteVN iOS bridge call failed: \(error)")
        let result: [String: Any] = [
            "id": requestId,
            "ok": false,
            "error": [
                "message": error.localizedDescription,
                "code": String(describing: type(of: error))
            ]
        ]
        evaluateJavaScriptCallback(name: "__routeVNIOSBridgeResult", result: result)
    }

    private func evaluateJavaScriptCallback(name: String, result: [String: Any]) {
        guard
            let data = try? JSONSerialization.data(withJSONObject: result),
            let json = String(data: data, encoding: .utf8)
        else {
            return
        }

        DispatchQueue.main.async { [weak self] in
            self?.webView.evaluateJavaScript(
                "(function(result){if(window.\(name)){window.\(name)(result);}})(\(json));",
                completionHandler: nil
            )
        }
    }

    private func isSmokeTestEnabled() -> Bool {
        boolValue(ProcessInfo.processInfo.environment["ROUTEVN_IOS_SMOKE_TEST"])
    }

    private func runSmokeTestIfNeeded() {
        guard isSmokeTestEnabled(), !didRunSmokeTest else {
            return
        }

        didRunSmokeTest = true
        let script = """
        (async function() {
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const bodyText = () => {
            const collectText = (node) => {
              if (!node) {
                return "";
              }
              if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent || "";
              }

              let text = "";
              if (node.shadowRoot) {
                text += " " + collectText(node.shadowRoot);
              }
              for (const child of node.childNodes || []) {
                text += " " + collectText(child);
              }
              return text;
            };

            return collectText(document.body);
          };
          const postResult = (payload) => {
            window.webkit.messageHandlers.RouteVNIOS.postMessage({
              method: "smokeResult",
              payload
            });
          };

          try {
            let helperReady = false;
            let renderedText = "";
            for (let index = 0; index < 100; index += 1) {
              helperReady = window.routeVNIOSSmoke && typeof window.routeVNIOSSmoke.run === "function";
              renderedText = bodyText();
              if (helperReady && renderedText.includes("Projects")) {
                break;
              }
              await sleep(100);
            }

            if (!helperReady) {
              postResult({
                ok: false,
                error: "iOS smoke helper was not ready.",
                bodyText: bodyText().slice(0, 500)
              });
              return;
            }

            const serviceResult = await window.routeVNIOSSmoke.run();
            const finalText = bodyText();
            postResult({
              ok: true,
              hasProjectsTitle: renderedText.includes("Projects") || finalText.includes("Projects"),
              hasCreatorVersion: renderedText.includes("RouteVN Creator") || finalText.includes("RouteVN Creator"),
              serviceResult
            });
          } catch (error) {
            postResult({
              ok: false,
              error: error && error.message ? error.message : String(error),
              stack: error && error.stack ? error.stack : ""
            });
          }
        })();
        """

        webView.evaluateJavaScript(script) { _, error in
            if let error {
                NSLog("RouteVN iOS smoke script failed: \(error)")
            }
        }
    }

    private func writeSmokeResult(_ result: [String: Any]) throws {
        try FileManager.default.createDirectory(at: storage.root, withIntermediateDirectories: true)
        let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
        let outputURL = storage.root.appendingPathComponent("ios-smoke-result.json")
        try data.write(to: outputURL, options: .atomic)
        NSLog("RouteVN iOS smoke result written: \(outputURL.path)")
    }

    private func openDatabase(dbPath: String) throws -> OpaquePointer {
        if let cachedDatabase = sqliteDatabases[dbPath] {
            return cachedDatabase
        }

        let databaseURL = try storage.databaseURL(dbPath: dbPath)
        try FileManager.default.createDirectory(
            at: databaseURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        var database: OpaquePointer?
        if sqlite3_open(databaseURL.path, &database) != SQLITE_OK {
            defer {
                if database != nil {
                    sqlite3_close(database)
                }
            }
            throw RouteVNError.message("Failed to open SQLite database.")
        }

        guard let openedDatabase = database else {
            throw RouteVNError.message("Failed to open SQLite database.")
        }

        sqlite3_busy_timeout(openedDatabase, 5_000)
        _ = try executeRawSQL(openedDatabase, sql: "PRAGMA journal_mode=WAL")
        _ = try executeRawSQL(openedDatabase, sql: "PRAGMA busy_timeout=5000")
        sqliteDatabases[dbPath] = openedDatabase
        return openedDatabase
    }

    private func closeDatabase(dbPath: String) {
        if let database = sqliteDatabases.removeValue(forKey: dbPath) {
            sqlite3_close(database)
        }
    }

    private func closeSqliteDatabases() {
        for database in sqliteDatabases.values {
            sqlite3_close(database)
        }
        sqliteDatabases.removeAll()
    }

    private func executeRawSQL(_ database: OpaquePointer, sql: String) throws -> [String: Any] {
        try executeDatabaseStatement(database, sql: sql, args: [])
    }

    private func queryDatabase(
        _ database: OpaquePointer,
        sql: String,
        args: [Any]
    ) throws -> [[String: Any]] {
        let statement = try prepareStatement(database, sql: sql, args: args)
        defer {
            sqlite3_finalize(statement)
        }

        var rows: [[String: Any]] = []
        while true {
            let stepResult = sqlite3_step(statement)
            if stepResult == SQLITE_DONE {
                return rows
            }
            if stepResult != SQLITE_ROW {
                throw sqliteError(database)
            }

            var row: [String: Any] = [:]
            for index in 0..<sqlite3_column_count(statement) {
                let columnName = String(cString: sqlite3_column_name(statement, index))
                row[columnName] = columnValue(statement, index: index)
            }
            rows.append(row)
        }
    }

    private func executeDatabaseStatement(
        _ database: OpaquePointer,
        sql: String,
        args: [Any]
    ) throws -> [String: Any] {
        let statement = try prepareStatement(database, sql: sql, args: args)
        defer {
            sqlite3_finalize(statement)
        }

        while true {
            let stepResult = sqlite3_step(statement)
            if stepResult == SQLITE_DONE {
                return ["rowsAffected": Int(sqlite3_changes(database))]
            }
            if stepResult == SQLITE_ROW {
                continue
            }
            throw sqliteError(database)
        }
    }

    private func prepareStatement(
        _ database: OpaquePointer,
        sql: String,
        args: [Any]
    ) throws -> OpaquePointer {
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(database, sql, -1, &statement, nil) != SQLITE_OK {
            throw sqliteError(database)
        }

        guard let preparedStatement = statement else {
            throw RouteVNError.message("Failed to prepare SQLite statement.")
        }

        do {
            try bindStatementArgs(preparedStatement, args: args)
            return preparedStatement
        } catch {
            sqlite3_finalize(preparedStatement)
            throw error
        }
    }

    private func bindStatementArgs(_ statement: OpaquePointer, args: [Any]) throws {
        for (index, arg) in args.enumerated() {
            let bindIndex = Int32(index + 1)
            if arg is NSNull {
                sqlite3_bind_null(statement, bindIndex)
            } else if let number = arg as? NSNumber {
                if CFGetTypeID(number) == CFBooleanGetTypeID() {
                    sqlite3_bind_int64(statement, bindIndex, number.boolValue ? 1 : 0)
                } else if floor(number.doubleValue) == number.doubleValue {
                    sqlite3_bind_int64(statement, bindIndex, number.int64Value)
                } else {
                    sqlite3_bind_double(statement, bindIndex, number.doubleValue)
                }
            } else if let object = arg as? [String: Any],
                      stringValue(object["__routevn_sql_type"]) == "bytes",
                      let values = object["data"] as? [Any] {
                let bytes = try values.map { value -> UInt8 in
                    guard let number = value as? NSNumber else {
                        throw RouteVNError.message("Invalid SQLite byte value.")
                    }
                    return UInt8(truncating: number)
                }
                _ = bytes.withUnsafeBytes { buffer in
                    sqlite3_bind_blob(statement, bindIndex, buffer.baseAddress, Int32(buffer.count), sqliteTransient)
                }
            } else {
                sqlite3_bind_text(statement, bindIndex, String(describing: arg), -1, sqliteTransient)
            }
        }
    }

    private func columnValue(_ statement: OpaquePointer, index: Int32) -> Any {
        switch sqlite3_column_type(statement, index) {
        case SQLITE_INTEGER:
            return NSNumber(value: sqlite3_column_int64(statement, index))
        case SQLITE_FLOAT:
            return NSNumber(value: sqlite3_column_double(statement, index))
        case SQLITE_BLOB:
            let byteCount = Int(sqlite3_column_bytes(statement, index))
            guard let bytes = sqlite3_column_blob(statement, index), byteCount > 0 else {
                return [
                    "__routevn_sql_type": "bytes",
                    "base64": ""
                ]
            }
            let data = Data(bytes: bytes, count: byteCount)
            return [
                "__routevn_sql_type": "bytes",
                "base64": data.base64EncodedString()
            ]
        case SQLITE_NULL:
            return NSNull()
        case SQLITE_TEXT:
            fallthrough
        default:
            guard let text = sqlite3_column_text(statement, index) else {
                return ""
            }
            return String(cString: text)
        }
    }

    private func sqliteError(_ database: OpaquePointer) -> RouteVNError {
        if let message = sqlite3_errmsg(database) {
            return .message(String(cString: message))
        }
        return .message("SQLite operation failed.")
    }

    private func writeProjectFile(_ payload: [String: Any]) throws -> [String: Any] {
        let projectId = try storage.safePathSegment(requiredString(payload, "projectId"))
        let fileId = try storage.safePathSegment(requiredString(payload, "fileId"))
        let mimeType = normalizeMimeType(stringValue(payload["mimeType"]))
        let base64 = try requiredString(payload, "base64")
        guard let data = Data(base64Encoded: base64) else {
            throw RouteVNError.message("Invalid project file payload.")
        }

        try storage.ensureProjectDirectories(projectId: projectId)
        try storage.writeProjectFile(
            projectId: projectId,
            fileId: fileId,
            data: data,
            mimeType: mimeType
        )

        return [
            "url": storage.projectFileURL(projectId: projectId, fileId: fileId, mimeType: mimeType)
        ]
    }

    private func readProjectFile(_ payload: [String: Any]) throws -> [String: Any] {
        let projectId = try storage.safePathSegment(requiredString(payload, "projectId"))
        let fileId = try storage.safePathSegment(requiredString(payload, "fileId"))
        let fileURL = try storage.projectFilePath(projectId: projectId, fileId: fileId)
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw RouteVNError.message("Project file was not found.")
        }

        return [
            "base64": try Data(contentsOf: fileURL).base64EncodedString(),
            "mimeType": try storage.projectFileMimeType(projectId: projectId, fileId: fileId)
        ]
    }

    private func readProjectFileMetadata(_ payload: [String: Any]) throws -> [String: Any] {
        let projectId = try storage.safePathSegment(requiredString(payload, "projectId"))
        let fileId = try storage.safePathSegment(requiredString(payload, "fileId"))
        let fileURL = try storage.projectFilePath(projectId: projectId, fileId: fileId)
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw RouteVNError.message("Project file was not found.")
        }

        let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
        return [
            "mimeType": try storage.projectFileMimeType(projectId: projectId, fileId: fileId),
            "size": NSNumber(value: attributes[.size] as? Int64 ?? 0)
        ]
    }

    private func writeDownloadFile(_ payload: [String: Any]) throws -> String {
        let filename = sanitizeFilename(stringValue(payload["filename"]), fallback: "download")
        let base64 = try requiredString(payload, "base64")
        guard let data = Data(base64Encoded: base64) else {
            throw RouteVNError.message("Invalid download payload.")
        }

        let outputURL = try storage.downloadURL(filename: filename)
        try data.write(to: outputURL, options: .atomic)
        return outputURL.absoluteString
    }

    private func writeFileToUri(_ payload: [String: Any]) throws -> String {
        let uri = try requiredString(payload, "uri")
        let base64 = try requiredString(payload, "base64")
        guard let data = Data(base64Encoded: base64) else {
            throw RouteVNError.message("Invalid file payload.")
        }
        guard let url = URL(string: uri), url.isFileURL else {
            throw RouteVNError.message("Only file URLs are supported by the iOS save path.")
        }

        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try data.write(to: url, options: .atomic)
        return url.absoluteString
    }

    private func createDistributionZipStreamedToUri(_ payload: [String: Any]) throws -> [String: Any] {
        let projectId = try storage.safePathSegment(requiredString(payload, "projectId"))
        let uri = try requiredString(payload, "uri")
        let instructionsJson = try requiredString(payload, "instructionsJson")
        guard let targetURL = URL(string: uri), targetURL.isFileURL else {
            throw RouteVNError.message("Only file URLs are supported by the iOS ZIP export path.")
        }

        let usePartFile = boolValue(payload["usePartFile"])
        let workURL = usePartFile ? URL(fileURLWithPath: targetURL.path + ".part") : targetURL
        let didAccess = targetURL.startAccessingSecurityScopedResource()
        defer {
            if didAccess {
                targetURL.stopAccessingSecurityScopedResource()
            }
        }

        let plan = try createDistributionPackagePlan(
            projectId: projectId,
            fileEntries: payload["fileEntries"] as? [[String: Any]] ?? [],
            instructionsJson: instructionsJson
        )

        try FileManager.default.createDirectory(
            at: targetURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try FileManager.default.removeItemIfExists(at: workURL)

        do {
            let writer = try RouteVNZipStreamWriter(fileURL: workURL)
            try writeDistributionPackageBin(plan: plan, writer: writer)
            if let indexHtml = optionalString(payload, key: "indexHtml") {
                try writer.addDataEntry(name: "index.html", data: Data(indexHtml.utf8))
            }
            if let mainJs = optionalString(payload, key: "mainJs") {
                try writer.addDataEntry(name: "main.js", data: Data(mainJs.utf8))
            }
            if let manifestJson = optionalString(payload, key: "manifestJson") {
                try writer.addDataEntry(name: "manifest.webmanifest", data: Data(manifestJson.utf8))
            }
            if let requestedWebIconFileId = optionalString(payload, key: "webIconFileId") {
                let webIconFileId = try storage.safePathSegment(requestedWebIconFileId)
                let webIconURL = try storage.projectFilePath(
                    projectId: projectId,
                    fileId: webIconFileId
                )
                guard FileManager.default.fileExists(atPath: webIconURL.path) else {
                    throw RouteVNError.message("The Web application icon could not be exported.")
                }
                try writer.addDataEntry(
                    name: "app-icon.png",
                    data: try Data(contentsOf: webIconURL)
                )
            }
            let zipBytes = try writer.finalize()

            if usePartFile {
                try FileManager.default.removeItemIfExists(at: targetURL)
                try FileManager.default.moveItem(at: workURL, to: targetURL)
            }

            return [
                "uri": targetURL.absoluteString,
                "stats": plan.stats.dictionary(zipBytes: zipBytes)
            ]
        } catch {
            if usePartFile {
                try? FileManager.default.removeItemIfExists(at: workURL)
            }
            throw error
        }
    }

    private func createDistributionPackagePlan(
        projectId: String,
        fileEntries: [[String: Any]],
        instructionsJson: String
    ) throws -> RouteVNPackageBinPlan {
        var assets: [RouteVNDistributionAsset] = []
        var missingFileCount = 0

        for entry in fileEntries {
            let requestedFileId = stringValue(entry["id"]).isEmpty ?
                stringValue(entry["fileId"]) :
                stringValue(entry["id"])
            if requestedFileId.isEmpty {
                continue
            }

            let fileId = try storage.safePathSegment(requestedFileId)
            let fileURL = try storage.projectFilePath(projectId: projectId, fileId: fileId)
            guard FileManager.default.fileExists(atPath: fileURL.path) else {
                missingFileCount += 1
                NSLog("Skipping missing file during native iOS ZIP export: \(fileId)")
                continue
            }

            let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
            let size = (attributes[.size] as? NSNumber)?.uint64Value ?? 0
            let mimeType = try resolveDistributionAssetMimeType(
                projectId: projectId,
                fileId: fileId,
                fileURL: fileURL,
                preferredMimeType: stringValue(entry["mimeType"])
            )
            let sha256 = size == 0 ? "" : try sha256Hex(fileURL: fileURL)
            assets.append(
                RouteVNDistributionAsset(
                    id: fileId,
                    mimeType: mimeType,
                    fileURL: fileURL,
                    size: size,
                    sha256: sha256
                )
            )
        }

        return try buildPackageBinPlan(
            assets: assets,
            instructionsJson: instructionsJson,
            missingFileCount: missingFileCount
        )
    }

    private func resolveDistributionAssetMimeType(
        projectId: String,
        fileId: String,
        fileURL: URL,
        preferredMimeType: String
    ) throws -> String {
        let normalizedPreferredMimeType = normalizeMimeType(preferredMimeType)
        if !isUnreliableMimeType(normalizedPreferredMimeType) {
            return normalizedPreferredMimeType
        }

        let storedMimeType = try storage.projectFileMimeType(projectId: projectId, fileId: fileId)
        if !isUnreliableMimeType(storedMimeType) {
            return storedMimeType
        }

        return mimeTypeForURL(fileURL, fallbackName: fileId)
    }

    private func buildPackageBinPlan(
        assets: [RouteVNDistributionAsset],
        instructionsJson: String,
        missingFileCount: Int
    ) throws -> RouteVNPackageBinPlan {
        let instructionsData = Data(instructionsJson.utf8)
        let instructionsSha256 = instructionsData.isEmpty ? "" : sha256Hex(data: instructionsData)
        var assetEntries: [String: Any] = [:]
        var chunkPayloads: [RouteVNChunkPayload] = []
        var chunkIndexById: [String: Int] = [:]
        var rawAssetBytes: UInt64 = 0
        var chunkReferenceCount = 0

        func registerChunk(id: String, size: UInt64, source: RouteVNChunkSource) {
            if chunkIndexById[id] != nil {
                return
            }
            chunkIndexById[id] = chunkPayloads.count
            chunkPayloads.append(RouteVNChunkPayload(id: id, size: size, source: source))
        }

        for asset in assets {
            rawAssetBytes += asset.size
            let chunkIds = asset.size == 0 ? [] : [asset.sha256]
            if asset.size > 0 {
                registerChunk(
                    id: asset.sha256,
                    size: asset.size,
                    source: .file(asset.fileURL)
                )
                chunkReferenceCount += 1
            }

            assetEntries[asset.id] = [
                "encoding": "raw",
                "mime": asset.mimeType,
                "size": NSNumber(value: asset.size),
                "chunks": chunkIds
            ]
        }

        let instructionChunkIds = instructionsData.isEmpty ? [] : [instructionsSha256]
        if !instructionsData.isEmpty {
            registerChunk(
                id: instructionsSha256,
                size: UInt64(instructionsData.count),
                source: .data(instructionsData)
            )
            chunkReferenceCount += 1
        }

        var chunks: [String: Any] = [:]
        var currentChunkOffset: UInt64 = 0
        for chunk in chunkPayloads {
            chunks[chunk.id] = [
                "start": NSNumber(value: currentChunkOffset),
                "length": NSNumber(value: chunk.size),
                "sha256": chunk.id
            ]
            currentChunkOffset += chunk.size
        }

        let manifest: [String: Any] = [
            "chunking": [
                "algorithm": "none",
                "mode": "whole-file-only"
            ],
            "chunks": chunks,
            "assets": assetEntries,
            "atlases": [:],
            "instructions": [
                "encoding": "raw",
                "mime": "application/json",
                "size": NSNumber(value: instructionsData.count),
                "chunks": instructionChunkIds
            ]
        ]

        let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: [.sortedKeys])
        if manifestData.count > Int(UInt32.max) {
            throw RouteVNError.message("Bundle manifest is too large.")
        }

        let headerData = try createBundleHeader(manifestLength: manifestData.count)
        let packageBinBytes =
            UInt64(headerData.count) + UInt64(manifestData.count) + currentChunkOffset
        let sourceBytes = rawAssetBytes + UInt64(instructionsData.count)
        let stats = RouteVNDistributionZipStats(
            assetCount: assets.count,
            missingFileCount: missingFileCount,
            rawAssetBytes: rawAssetBytes,
            packageBinBytes: packageBinBytes,
            uniqueChunkCount: chunkPayloads.count,
            chunkReferenceCount: chunkReferenceCount,
            storedChunkBytes: currentChunkOffset,
            dedupedBytes: sourceBytes > currentChunkOffset ? sourceBytes - currentChunkOffset : 0
        )

        return RouteVNPackageBinPlan(
            headerData: headerData,
            manifestData: manifestData,
            chunkPayloads: chunkPayloads,
            stats: stats
        )
    }

    private func writeDistributionPackageBin(
        plan: RouteVNPackageBinPlan,
        writer: RouteVNZipStreamWriter
    ) throws {
        var crc32 = RouteVNCRC32()
        crc32.update(plan.headerData)
        crc32.update(plan.manifestData)
        try updateCRC32ForChunkPayloads(plan.chunkPayloads, crc32: &crc32)

        try writer.addEntry(
            name: "package.bin",
            size: plan.stats.packageBinBytes,
            crc32: crc32.finalize()
        ) {
            try writer.writeEntryData(plan.headerData)
            try writer.writeEntryData(plan.manifestData)
            try writeChunkPayloads(plan.chunkPayloads, writer: writer)
        }
    }

    private func updateCRC32ForChunkPayloads(
        _ chunkPayloads: [RouteVNChunkPayload],
        crc32: inout RouteVNCRC32
    ) throws {
        for payload in chunkPayloads {
            switch payload.source {
            case .data(let data):
                crc32.update(data)
            case .file(let url):
                try forEachFileChunk(url) { data in
                    crc32.update(data)
                }
            }
        }
    }

    private func writeChunkPayloads(
        _ chunkPayloads: [RouteVNChunkPayload],
        writer: RouteVNZipStreamWriter
    ) throws {
        for payload in chunkPayloads {
            switch payload.source {
            case .data(let data):
                try writer.writeEntryData(data)
            case .file(let url):
                try writer.writeFileContents(url)
            }
        }
    }

    private func launchFilePicker(_ payload: [String: Any]) throws {
        guard pendingDocumentPicker == nil else {
            throw RouteVNError.message("Another document picker is already open.")
        }

        let requestId = try storage.safePathSegment(requiredString(payload, "requestId"))
        try storage.deletePickerRequestFiles(requestId: requestId)

        pendingDocumentPicker = PendingDocumentPicker(
            kind: .file,
            requestId: requestId,
            multiple: boolValue(payload["multiple"]),
            writable: false
        )

        let picker = UIDocumentPickerViewController(
            forOpeningContentTypes: resolveAcceptedContentTypes(stringValue(payload["accept"])),
            asCopy: true
        )
        picker.allowsMultipleSelection = boolValue(payload["multiple"])
        picker.delegate = self
        present(picker, animated: true)
    }

    private func resolveSaveFilePicker(_ payload: [String: Any]) throws {
        let requestId = try storage.safePathSegment(requiredString(payload, "requestId"))
        let filename = sanitizeFilename(stringValue(payload["filename"]), fallback: "download")
        let url = try storage.downloadURL(filename: filename)
        sendSaveFilePickerResult([
            "requestId": requestId,
            "uri": url.absoluteString
        ])
    }

    private func launchFolderPicker(_ payload: [String: Any]) throws {
        guard pendingDocumentPicker == nil else {
            throw RouteVNError.message("Another document picker is already open.")
        }

        let requestId = try storage.safePathSegment(requiredString(payload, "requestId"))
        pendingDocumentPicker = PendingDocumentPicker(
            kind: .folder,
            requestId: requestId,
            multiple: false,
            writable: boolValue(payload["writable"])
        )

        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
        picker.allowsMultipleSelection = false
        picker.delegate = self
        present(picker, animated: true)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let pending = pendingDocumentPicker else {
            return
        }
        pendingDocumentPicker = nil

        switch pending.kind {
        case .file:
            sendFilePickerResult([
                "requestId": pending.requestId,
                "files": []
            ])
        case .folder:
            sendFolderPickerResult([
                "requestId": pending.requestId,
                "folder": NSNull()
            ])
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let pending = pendingDocumentPicker else {
            return
        }
        pendingDocumentPicker = nil

        do {
            switch pending.kind {
            case .file:
                let selectedURLs = pending.multiple ? urls : Array(urls.prefix(1))
                var files: [[String: Any]] = []
                for (index, url) in selectedURLs.enumerated() {
                    files.append(try createPickerFileResult(requestId: pending.requestId, sourceURL: url, index: index))
                }
                sendFilePickerResult([
                    "requestId": pending.requestId,
                    "files": files
                ])
            case .folder:
                guard let url = urls.first else {
                    sendFolderPickerResult([
                        "requestId": pending.requestId,
                        "folder": NSNull()
                    ])
                    return
                }
                let folderResult = try createFolderPickerResult(requestId: pending.requestId, sourceURL: url)
                sendFolderPickerResult([
                    "requestId": pending.requestId,
                    "folder": folderResult
                ])
            }
        } catch {
            switch pending.kind {
            case .file:
                sendFilePickerError(requestId: pending.requestId, message: error.localizedDescription)
            case .folder:
                sendFolderPickerError(requestId: pending.requestId, message: error.localizedDescription)
            }
        }
    }

    private func createFolderPickerResult(requestId: String, sourceURL: URL) throws -> [String: Any] {
        let safeRequestId = try storage.safePathSegment(requestId)
        storeSecurityScopedFolderSelection(requestId: safeRequestId, url: sourceURL)

        return [
            "uri": securityScopedFolderURI(requestId: safeRequestId),
            "name": sourceURL.lastPathComponent,
            "sourceUri": sourceURL.absoluteString
        ]
    }

    private func createPickerFileResult(requestId: String, sourceURL: URL, index: Int) throws -> [String: Any] {
        let fileId = try storage.safePathSegment("file-\(index)")
        let displayName = sourceURL.lastPathComponent.isEmpty ? fileId : sourceURL.lastPathComponent
        let mimeType = mimeTypeForURL(sourceURL, fallbackName: displayName)
        let didAccess = sourceURL.startAccessingSecurityScopedResource()
        defer {
            if didAccess {
                sourceURL.stopAccessingSecurityScopedResource()
            }
        }

        let data = try Data(contentsOf: sourceURL)
        try storage.writePickerFile(
            requestId: requestId,
            fileId: fileId,
            data: data,
            mimeType: mimeType
        )

        return [
            "requestId": requestId,
            "fileId": fileId,
            "name": displayName,
            "type": mimeType,
            "size": NSNumber(value: data.count),
            "url": "routevn://app/ios-files/picker/\(requestId)/files/\(fileId)"
        ]
    }

    private func securityScopedFolderURI(requestId: String) -> String {
        "routevn-folder://selected/\(requestId)"
    }

    private func securityScopedFolderRequestId(uriString: String) -> String? {
        guard let url = URL(string: uriString), url.scheme == "routevn-folder" else {
            return nil
        }

        if url.host == "selected" {
            return url.pathComponents.dropFirst().first
        }

        return url.host
    }

    private func storeSecurityScopedFolderSelection(requestId: String, url: URL) {
        securityScopedFoldersLock.lock()
        defer {
            securityScopedFoldersLock.unlock()
        }

        securityScopedFolders[requestId] = SecurityScopedFolderSelection(url: url)
    }

    private func loadSecurityScopedFolderSelection(requestId: String) -> SecurityScopedFolderSelection? {
        securityScopedFoldersLock.lock()
        defer {
            securityScopedFoldersLock.unlock()
        }

        return securityScopedFolders[requestId]
    }

    private func accessFolderURL(
        uriString: String,
        fallbackURL: URL? = nil,
        missingMessage: String
    ) throws -> SecurityScopedFolderAccess {
        if let requestId = securityScopedFolderRequestId(uriString: uriString) {
            let safeRequestId = try storage.safePathSegment(requestId)
            guard let selection = loadSecurityScopedFolderSelection(requestId: safeRequestId) else {
                throw RouteVNError.message("Selected folder access has expired.")
            }
            let didAccess = selection.url.startAccessingSecurityScopedResource()
            return SecurityScopedFolderAccess(url: selection.url, didAccess: didAccess)
        }

        if let selectedURL = URL(string: uriString), selectedURL.isFileURL {
            let didAccess = selectedURL.startAccessingSecurityScopedResource()
            return SecurityScopedFolderAccess(url: selectedURL, didAccess: didAccess)
        }

        if let fallbackURL {
            return SecurityScopedFolderAccess(url: fallbackURL, didAccess: false)
        }

        throw RouteVNError.message(missingMessage)
    }

    private func sendFilePickerError(requestId: String, message: String) {
        sendFilePickerResult([
            "requestId": requestId,
            "error": ["message": message]
        ])
    }

    private func sendFilePickerResult(_ result: [String: Any]) {
        evaluateJavaScriptCallback(name: "__routeVNIOSFilePickerResult", result: result)
    }

    private func sendSaveFilePickerResult(_ result: [String: Any]) {
        evaluateJavaScriptCallback(name: "__routeVNIOSSaveFileResult", result: result)
    }

    private func sendFolderPickerError(requestId: String, message: String) {
        sendFolderPickerResult([
            "requestId": requestId,
            "error": ["message": message]
        ])
    }

    private func sendFolderPickerResult(_ result: [String: Any]) {
        evaluateJavaScriptCallback(name: "__routeVNIOSFolderPickerResult", result: result)
    }

    private func listProjectFolders() throws -> [[String: Any]] {
        let projectDirectories = try? FileManager.default.contentsOfDirectory(
            at: storage.projectDatabasesRoot,
            includingPropertiesForKeys: [.isDirectoryKey]
        )
        var projects: [[String: Any]] = []

        for projectDirectory in projectDirectories ?? [] {
            let resourceValues = try? projectDirectory.resourceValues(forKeys: [.isDirectoryKey])
            guard resourceValues?.isDirectory == true else {
                continue
            }

            let projectId: String
            do {
                projectId = try storage.safePathSegment(projectDirectory.lastPathComponent)
            } catch {
                continue
            }

            let projectDbURL = projectDirectory.appendingPathComponent("project.db")
            let filesURL = try storage.projectFilesRoot(projectId: projectId)
            guard
                FileManager.default.fileExists(atPath: projectDbURL.path),
                FileManager.default.fileExists(atPath: filesURL.path)
            else {
                continue
            }

            do {
                let projectInfo = try readProjectInfo(databaseURL: projectDbURL)
                guard try storage.safePathSegment(stringValue(projectInfo["id"])) == projectId else {
                    continue
                }
                projects.append(projectEntry(projectId: projectId, projectInfo: projectInfo))
            } catch {
                NSLog("Skipping invalid iOS project folder \(projectId): \(error)")
            }
        }

        return projects
    }

    private func importProjectFolder(uriString: String) throws -> [String: Any] {
        let folderAccess = try accessFolderURL(
            uriString: uriString,
            missingMessage: "Project folder is required."
        )
        let folderURL = folderAccess.url
        defer {
            folderAccess.stop()
        }

        let projectDbURL = folderURL.appendingPathComponent("project.db")
        let sourceFilesURL = folderURL.appendingPathComponent("files")
        guard FileManager.default.fileExists(atPath: projectDbURL.path) else {
            throw RouteVNError.message("Selected folder is missing project.db.")
        }
        guard FileManager.default.fileExists(atPath: sourceFilesURL.path) else {
            throw RouteVNError.message("Selected folder is missing files.")
        }

        let projectInfo = try readProjectInfo(databaseURL: projectDbURL)
        let projectId = try storage.safePathSegment(stringValue(projectInfo["id"]))
        let projectDbPath = storage.projectDatabasePath(projectId: projectId)
        let targetDbURL = try storage.databaseURL(dbPath: projectDbPath)
        let targetProjectRoot = try storage.projectRoot(projectId: projectId)
        let targetFilesURL = try storage.projectFilesRoot(projectId: projectId)
        let targetMetadataURL = try storage.projectMetadataRoot(projectId: projectId)
        let alreadyImported =
            FileManager.default.fileExists(atPath: targetDbURL.path) &&
            FileManager.default.fileExists(atPath: targetFilesURL.path)

        if !alreadyImported {
            closeDatabase(dbPath: projectDbPath)
            try FileManager.default.removeItemIfExists(at: targetDbURL.deletingLastPathComponent())
            try FileManager.default.removeItemIfExists(at: targetProjectRoot)
            try FileManager.default.createDirectory(
                at: targetDbURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try FileManager.default.copyItem(at: projectDbURL, to: targetDbURL)
            try copySidecarIfPresent(source: projectDbURL, suffix: "-wal", target: targetDbURL)
            try copySidecarIfPresent(source: projectDbURL, suffix: "-shm", target: targetDbURL)
            try copySidecarIfPresent(source: projectDbURL, suffix: "-journal", target: targetDbURL)
            try FileManager.default.createDirectory(
                at: targetFilesURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try FileManager.default.copyItem(at: sourceFilesURL, to: targetFilesURL)

            let sourceMetadataURL = folderURL.appendingPathComponent("file-metadata")
            if FileManager.default.fileExists(atPath: sourceMetadataURL.path) {
                try FileManager.default.copyItem(at: sourceMetadataURL, to: targetMetadataURL)
            }
        }

        var result = projectEntry(projectId: projectId, projectInfo: projectInfo)
        result["sourceUri"] = folderURL.absoluteString
        result["sourceName"] = folderURL.lastPathComponent
        result["alreadyImported"] = alreadyImported
        return result
    }

    private func exportProjectFolder(projectId: String, destinationUriString: String) throws -> [String: Any] {
        let safeProjectId = try storage.safePathSegment(projectId)
        try checkpointProjectDatabase(projectId: safeProjectId)

        let projectDbURL = try storage.databaseURL(dbPath: storage.projectDatabasePath(projectId: safeProjectId))
        let projectFilesURL = try storage.projectFilesRoot(projectId: safeProjectId)
        guard FileManager.default.fileExists(atPath: projectDbURL.path),
              FileManager.default.fileExists(atPath: projectFilesURL.path) else {
            throw RouteVNError.message("Project storage was not found.")
        }

        let projectInfo = try readProjectInfo(databaseURL: projectDbURL)
        let exportFolderName = resolveProjectExportFolderName(projectInfo: projectInfo)
        let destinationAccess = try accessFolderURL(
            uriString: destinationUriString,
            fallbackURL: storage.exportsRoot,
            missingMessage: "Project export folder is required."
        )
        let destinationRootURL = destinationAccess.url
        defer {
            destinationAccess.stop()
        }

        let exportRootURL = destinationRootURL.appendingPathComponent(exportFolderName)
        if FileManager.default.fileExists(atPath: exportRootURL.path) {
            throw RouteVNError.message("A project export folder with this name already exists.")
        }

        try FileManager.default.createDirectory(at: exportRootURL, withIntermediateDirectories: true)
        try FileManager.default.copyItem(
            at: projectDbURL,
            to: exportRootURL.appendingPathComponent("project.db")
        )
        try FileManager.default.copyItem(
            at: projectFilesURL,
            to: exportRootURL.appendingPathComponent("files")
        )

        let metadataURL = try storage.projectMetadataRoot(projectId: safeProjectId)
        if FileManager.default.fileExists(atPath: metadataURL.path) {
            try FileManager.default.copyItem(
                at: metadataURL,
                to: exportRootURL.appendingPathComponent("file-metadata")
            )
        }

        return [
            "uri": exportRootURL.absoluteString,
            "name": exportFolderName
        ]
    }

    private func checkpointProjectDatabase(projectId: String) throws {
        let dbPath = storage.projectDatabasePath(projectId: projectId)
        closeDatabase(dbPath: dbPath)

        let databaseURL = try storage.databaseURL(dbPath: dbPath)
        var database: OpaquePointer?
        if sqlite3_open(databaseURL.path, &database) != SQLITE_OK {
            defer {
                if database != nil {
                    sqlite3_close(database)
                }
            }
            throw RouteVNError.message("Failed to checkpoint project database.")
        }

        guard let openedDatabase = database else {
            throw RouteVNError.message("Failed to checkpoint project database.")
        }
        defer {
            sqlite3_close(openedDatabase)
        }

        _ = try executeRawSQL(openedDatabase, sql: "PRAGMA wal_checkpoint(TRUNCATE)")
    }

    private func readProjectInfo(databaseURL: URL) throws -> [String: Any] {
        var database: OpaquePointer?
        if sqlite3_open_v2(databaseURL.path, &database, SQLITE_OPEN_READONLY, nil) != SQLITE_OK {
            defer {
                if database != nil {
                    sqlite3_close(database)
                }
            }
            throw RouteVNError.message("Selected folder is not a RouteVN project.")
        }

        guard let openedDatabase = database else {
            throw RouteVNError.message("Selected folder is not a RouteVN project.")
        }
        defer {
            sqlite3_close(openedDatabase)
        }

        let rawProjectInfo =
            try readAppStateValue(database: openedDatabase, tableName: "app_state", key: "projectInfo") ??
            readAppStateValue(database: openedDatabase, tableName: "kv", key: "projectInfo")
        guard let rawProjectInfo, !rawProjectInfo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw RouteVNError.message("Selected folder is not a RouteVN project.")
        }

        guard
            let data = rawProjectInfo.data(using: .utf8),
            let projectInfo = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            !stringValue(projectInfo["id"]).isEmpty
        else {
            throw RouteVNError.message("Selected project is missing an id.")
        }

        return projectInfo
    }

    private func readAppStateValue(database: OpaquePointer, tableName: String, key: String) throws -> String? {
        guard try hasTable(database: database, tableName: tableName) else {
            return nil
        }

        let rows = try queryDatabase(
            database,
            sql: "SELECT value FROM \(tableName) WHERE key = ?",
            args: [key]
        )
        return rows.first?["value"] as? String
    }

    private func hasTable(database: OpaquePointer, tableName: String) throws -> Bool {
        let rows = try queryDatabase(
            database,
            sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            args: [tableName]
        )
        return !rows.isEmpty
    }

    private func projectEntry(projectId: String, projectInfo: [String: Any]) -> [String: Any] {
        var entry: [String: Any] = [
            "id": projectId,
            "name": stringValue(projectInfo["name"]),
            "description": stringValue(projectInfo["description"]),
            "language": stringValue(projectInfo["language"])
        ]
        if let iconFileId = projectInfo["iconFileId"], !(iconFileId is NSNull) {
            entry["iconFileId"] = stringValue(iconFileId)
        } else {
            entry["iconFileId"] = NSNull()
        }
        return entry
    }

    private func resolveAcceptedContentTypes(_ accept: String) -> [UTType] {
        let tokens = accept
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { !$0.isEmpty }
        let contentTypes = tokens.compactMap { token -> UTType? in
            if let wildcardType = wildcardContentType(token) {
                return wildcardType
            }

            if token.hasPrefix(".") {
                return UTType(filenameExtension: String(token.dropFirst()))
            }
            return UTType(mimeType: token)
        }
        return contentTypes.isEmpty ? [.item] : contentTypes
    }

    private func wildcardContentType(_ token: String) -> UTType? {
        switch token {
        case "image/*":
            return .image
        case "audio/*":
            return .audio
        case "video/*":
            return .movie
        case "text/*":
            return .text
        default:
            return nil
        }
    }

    private func copySidecarIfPresent(source: URL, suffix: String, target: URL) throws {
        let sourceSidecar = URL(fileURLWithPath: source.path + suffix)
        guard FileManager.default.fileExists(atPath: sourceSidecar.path) else {
            return
        }
        let targetSidecar = URL(fileURLWithPath: target.path + suffix)
        try FileManager.default.copyItem(at: sourceSidecar, to: targetSidecar)
    }
}

private enum RouteVNError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let message):
            return message
        }
    }
}

private enum PendingDocumentPickerKind {
    case file
    case folder
}

private struct PendingDocumentPicker {
    let kind: PendingDocumentPickerKind
    let requestId: String
    let multiple: Bool
    let writable: Bool
}

private struct SecurityScopedFolderSelection {
    let url: URL
}

private struct SecurityScopedFolderAccess {
    let url: URL
    let didAccess: Bool

    func stop() {
        if didAccess {
            url.stopAccessingSecurityScopedResource()
        }
    }
}

private struct RouteVNDistributionAsset {
    let id: String
    let mimeType: String
    let fileURL: URL
    let size: UInt64
    let sha256: String
}

private enum RouteVNChunkSource {
    case data(Data)
    case file(URL)
}

private struct RouteVNChunkPayload {
    let id: String
    let size: UInt64
    let source: RouteVNChunkSource
}

private struct RouteVNPackageBinPlan {
    let headerData: Data
    let manifestData: Data
    let chunkPayloads: [RouteVNChunkPayload]
    let stats: RouteVNDistributionZipStats
}

private struct RouteVNDistributionZipStats {
    let assetCount: Int
    let missingFileCount: Int
    let rawAssetBytes: UInt64
    let packageBinBytes: UInt64
    let uniqueChunkCount: Int
    let chunkReferenceCount: Int
    let storedChunkBytes: UInt64
    let dedupedBytes: UInt64

    func dictionary(zipBytes: UInt64) -> [String: Any] {
        [
            "assetCount": NSNumber(value: assetCount),
            "missingFileCount": NSNumber(value: missingFileCount),
            "rawAssetBytes": NSNumber(value: rawAssetBytes),
            "packageBinBytes": NSNumber(value: packageBinBytes),
            "zipBytes": NSNumber(value: zipBytes),
            "uniqueChunkCount": NSNumber(value: uniqueChunkCount),
            "chunkReferenceCount": NSNumber(value: chunkReferenceCount),
            "storedChunkBytes": NSNumber(value: storedChunkBytes),
            "dedupedBytes": NSNumber(value: dedupedBytes),
            "dicedAssetCount": NSNumber(value: 0),
            "atlasCount": NSNumber(value: 0),
            "imageOptimizedBytesSaved": NSNumber(value: 0)
        ]
    }
}

private struct RouteVNCRC32 {
    private static let table: [UInt32] = {
        (0..<256).map { index -> UInt32 in
            var value = UInt32(index)
            for _ in 0..<8 {
                if value & 1 == 1 {
                    value = 0xedb88320 ^ (value >> 1)
                } else {
                    value >>= 1
                }
            }
            return value
        }
    }()

    private var value: UInt32 = 0xffffffff

    mutating func update(_ data: Data) {
        data.withUnsafeBytes { buffer in
            guard let baseAddress = buffer.bindMemory(to: UInt8.self).baseAddress else {
                return
            }
            for index in 0..<buffer.count {
                let tableIndex = Int((value ^ UInt32(baseAddress[index])) & 0xff)
                value = RouteVNCRC32.table[tableIndex] ^ (value >> 8)
            }
        }
    }

    func finalize() -> UInt32 {
        value ^ 0xffffffff
    }
}

private final class RouteVNZipStreamWriter {
    private struct CentralDirectoryEntry {
        let nameData: Data
        let crc32: UInt32
        let size: UInt64
        let localHeaderOffset: UInt64
    }

    private let handle: FileHandle
    private var offset: UInt64 = 0
    private var entries: [CentralDirectoryEntry] = []
    private var isClosed = false

    init(fileURL: URL) throws {
        FileManager.default.createFile(atPath: fileURL.path, contents: nil)
        handle = try FileHandle(forWritingTo: fileURL)
        handle.truncateFile(atOffset: 0)
    }

    deinit {
        close()
    }

    func addDataEntry(name: String, data: Data) throws {
        var crc32 = RouteVNCRC32()
        crc32.update(data)
        try addEntry(name: name, size: UInt64(data.count), crc32: crc32.finalize()) {
            try writeEntryData(data)
        }
    }

    func addEntry(
        name: String,
        size: UInt64,
        crc32: UInt32,
        writeBody: () throws -> Void
    ) throws {
        try assertUInt32Size(size, label: "\(name) zip entry")
        let nameData = Data(name.utf8)
        guard nameData.count <= Int(UInt16.max) else {
            throw RouteVNError.message("ZIP entry name is too long.")
        }
        try assertUInt32Size(offset, label: "\(name) zip offset")

        let localHeaderOffset = offset
        try writeUInt32LE(0x04034b50)
        try writeUInt16LE(20)
        try writeUInt16LE(0)
        try writeUInt16LE(0)
        try writeUInt16LE(0)
        try writeUInt16LE(0)
        try writeUInt32LE(crc32)
        try writeUInt32LE(UInt32(size))
        try writeUInt32LE(UInt32(size))
        try writeUInt16LE(UInt16(nameData.count))
        try writeUInt16LE(0)
        try writeRawData(nameData)

        let bodyStartOffset = offset
        try writeBody()
        let bodyBytes = offset - bodyStartOffset
        guard bodyBytes == size else {
            throw RouteVNError.message("ZIP entry size mismatch for \(name).")
        }

        entries.append(
            CentralDirectoryEntry(
                nameData: nameData,
                crc32: crc32,
                size: size,
                localHeaderOffset: localHeaderOffset
            )
        )
    }

    func writeEntryData(_ data: Data) throws {
        try writeRawData(data)
    }

    func writeFileContents(_ url: URL) throws {
        try forEachFileChunk(url) { data in
            try writeRawData(data)
        }
    }

    func finalize() throws -> UInt64 {
        guard entries.count <= Int(UInt16.max) else {
            throw RouteVNError.message("ZIP archive has too many entries.")
        }

        let centralDirectoryOffset = offset
        try assertUInt32Size(centralDirectoryOffset, label: "ZIP central directory offset")
        for entry in entries {
            try assertUInt32Size(entry.size, label: "ZIP central directory entry")
            try assertUInt32Size(entry.localHeaderOffset, label: "ZIP local header offset")
            try writeUInt32LE(0x02014b50)
            try writeUInt16LE(20)
            try writeUInt16LE(20)
            try writeUInt16LE(0)
            try writeUInt16LE(0)
            try writeUInt16LE(0)
            try writeUInt16LE(0)
            try writeUInt32LE(entry.crc32)
            try writeUInt32LE(UInt32(entry.size))
            try writeUInt32LE(UInt32(entry.size))
            try writeUInt16LE(UInt16(entry.nameData.count))
            try writeUInt16LE(0)
            try writeUInt16LE(0)
            try writeUInt16LE(0)
            try writeUInt16LE(0)
            try writeUInt32LE(0)
            try writeUInt32LE(UInt32(entry.localHeaderOffset))
            try writeRawData(entry.nameData)
        }

        let centralDirectorySize = offset - centralDirectoryOffset
        try assertUInt32Size(centralDirectorySize, label: "ZIP central directory size")
        try writeUInt32LE(0x06054b50)
        try writeUInt16LE(0)
        try writeUInt16LE(0)
        try writeUInt16LE(UInt16(entries.count))
        try writeUInt16LE(UInt16(entries.count))
        try writeUInt32LE(UInt32(centralDirectorySize))
        try writeUInt32LE(UInt32(centralDirectoryOffset))
        try writeUInt16LE(0)

        handle.synchronizeFile()
        close()
        return offset
    }

    private func close() {
        if !isClosed {
            handle.closeFile()
            isClosed = true
        }
    }

    private func writeRawData(_ data: Data) throws {
        if data.isEmpty {
            return
        }
        handle.write(data)
        offset += UInt64(data.count)
    }

    private func writeUInt16LE(_ value: UInt16) throws {
        var littleEndianValue = value.littleEndian
        try withUnsafeBytes(of: &littleEndianValue) { bytes in
            try writeRawData(Data(bytes))
        }
    }

    private func writeUInt32LE(_ value: UInt32) throws {
        var littleEndianValue = value.littleEndian
        try withUnsafeBytes(of: &littleEndianValue) { bytes in
            try writeRawData(Data(bytes))
        }
    }

    private func assertUInt32Size(_ value: UInt64, label: String) throws {
        if value > UInt64(UInt32.max) {
            throw RouteVNError.message("\(label) exceeds the current iOS ZIP writer limit.")
        }
    }
}

final class RouteVNSchemeHandler: NSObject, WKURLSchemeHandler {
    private let storage: RouteVNNativeStorage

    init(storage: RouteVNNativeStorage) {
        self.storage = storage
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        do {
            guard let url = urlSchemeTask.request.url else {
                throw RouteVNError.message("Invalid routevn URL.")
            }

            let resolved = try storage.resolveRouteVNURL(url)
            let data = try Data(contentsOf: resolved.url)
            let response = HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: "HTTP/1.1",
                headerFields: [
                    "Content-Type": resolved.mimeType,
                    "Content-Length": String(data.count),
                    "Access-Control-Allow-Origin": "*",
                    "Cross-Origin-Resource-Policy": "cross-origin"
                ]
            ) ?? URLResponse(
                url: url,
                mimeType: resolved.mimeType,
                expectedContentLength: data.count,
                textEncodingName: nil
            )

            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

final class RouteVNNativeStorage {
    let root: URL
    let databasesRoot: URL
    let projectDatabasesRoot: URL
    let projectsRoot: URL
    let pickerRoot: URL
    let downloadsRoot: URL
    let exportsRoot: URL
    let webRoot: URL

    init() {
        let fileManager = FileManager.default
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        root = appSupport.appendingPathComponent("RouteVN Creator", isDirectory: true)
        databasesRoot = root.appendingPathComponent("databases", isDirectory: true)
        projectDatabasesRoot = databasesRoot.appendingPathComponent("projects", isDirectory: true)
        projectsRoot = root.appendingPathComponent("projects", isDirectory: true)
        pickerRoot = root.appendingPathComponent("picker", isDirectory: true)
        downloadsRoot = documents.appendingPathComponent("RouteVN Creator", isDirectory: true)
        exportsRoot = downloadsRoot.appendingPathComponent("Exports", isDirectory: true)
        webRoot = Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true) ?? Bundle.main.bundleURL

        try? fileManager.createDirectory(at: root, withIntermediateDirectories: true)
        try? fileManager.createDirectory(at: databasesRoot, withIntermediateDirectories: true)
        try? fileManager.createDirectory(at: projectsRoot, withIntermediateDirectories: true)
        try? fileManager.createDirectory(at: pickerRoot, withIntermediateDirectories: true)
        try? fileManager.createDirectory(at: downloadsRoot, withIntermediateDirectories: true)
        try? fileManager.createDirectory(at: exportsRoot, withIntermediateDirectories: true)
    }

    func databaseURL(dbPath: String) throws -> URL {
        try safeRelativeURL(root: databasesRoot, relativePath: dbPath)
    }

    func projectDatabasePath(projectId: String) -> String {
        "projects/\(projectId)/project.db"
    }

    func projectRoot(projectId: String) throws -> URL {
        try safeRelativeURL(root: projectsRoot, relativePath: safePathSegment(projectId))
    }

    func projectFilesRoot(projectId: String) throws -> URL {
        try projectRoot(projectId: projectId).appendingPathComponent("files", isDirectory: true)
    }

    func projectMetadataRoot(projectId: String) throws -> URL {
        try projectRoot(projectId: projectId).appendingPathComponent("file-metadata", isDirectory: true)
    }

    func projectFilePath(projectId: String, fileId: String) throws -> URL {
        try safeRelativeURL(root: projectFilesRoot(projectId: projectId), relativePath: safePathSegment(fileId))
    }

    func ensureProjectDirectories(projectId: String) throws {
        let safeProjectId = try safePathSegment(projectId)
        try FileManager.default.createDirectory(
            at: projectFilesRoot(projectId: safeProjectId),
            withIntermediateDirectories: true
        )
        try FileManager.default.createDirectory(
            at: projectMetadataRoot(projectId: safeProjectId),
            withIntermediateDirectories: true
        )
    }

    func writeProjectFile(projectId: String, fileId: String, data: Data, mimeType: String) throws {
        try ensureProjectDirectories(projectId: projectId)
        try data.write(to: projectFilePath(projectId: projectId, fileId: fileId), options: .atomic)
        try writeMimeType(
            mimeType,
            metadataRoot: projectMetadataRoot(projectId: projectId),
            fileId: fileId
        )
    }

    func projectFileMimeType(projectId: String, fileId: String) throws -> String {
        try readMimeType(metadataRoot: projectMetadataRoot(projectId: projectId), fileId: fileId)
    }

    func projectFileURL(projectId: String, fileId: String, mimeType: String) -> String {
        let extensionValue = projectFileExtension(mimeType: mimeType)
        if let extensionValue {
            return "routevn://app/ios-files/projects/\(projectId)/typed-files/\(fileId)/asset.\(extensionValue)"
        }
        return "routevn://app/ios-files/projects/\(projectId)/files/\(fileId)"
    }

    func writePickerFile(requestId: String, fileId: String, data: Data, mimeType: String) throws {
        let filesRoot = try safeRelativeURL(
            root: pickerRequestRoot(requestId: requestId),
            relativePath: "files"
        )
        let metadataRoot = try safeRelativeURL(
            root: pickerRequestRoot(requestId: requestId),
            relativePath: "file-metadata"
        )
        try FileManager.default.createDirectory(at: filesRoot, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: metadataRoot, withIntermediateDirectories: true)
        try data.write(to: try safeRelativeURL(root: filesRoot, relativePath: fileId), options: .atomic)
        try writeMimeType(mimeType, metadataRoot: metadataRoot, fileId: fileId)
    }

    func deletePickerRequestFiles(requestId: String) throws {
        try FileManager.default.removeItemIfExists(at: pickerRequestRoot(requestId: requestId))
    }

    func downloadURL(filename: String) throws -> URL {
        try FileManager.default.createDirectory(at: downloadsRoot, withIntermediateDirectories: true)
        return downloadsRoot.appendingPathComponent(sanitizeFilename(filename, fallback: "download"))
    }

    func resolveRouteVNURL(_ url: URL) throws -> (url: URL, mimeType: String) {
        let path = normalizedPath(url.path)
        if path == "" || path == "/" {
            return try resolveWebPath("ios/index.html")
        }
        if path.hasPrefix("ios-files/") {
            return try resolveInternalFilePath(String(path.dropFirst("ios-files/".count)))
        }
        return try resolveWebPath(path)
    }

    func safePathSegment(_ value: String) throws -> String {
        let segment = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard segment.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else {
            throw RouteVNError.message("Invalid app storage path segment.")
        }
        return segment
    }

    private func pickerRequestRoot(requestId: String) throws -> URL {
        try safeRelativeURL(root: pickerRoot, relativePath: safePathSegment(requestId))
    }

    private func resolveWebPath(_ path: String) throws -> (url: URL, mimeType: String) {
        let fileURL = try safeRelativeURL(root: webRoot, relativePath: normalizedPath(path))
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw RouteVNError.message("Packaged web asset was not found.")
        }
        return (fileURL, mimeTypeForURL(fileURL, fallbackName: fileURL.lastPathComponent))
    }

    private func resolveInternalFilePath(_ path: String) throws -> (url: URL, mimeType: String) {
        let parts = normalizedPath(path).split(separator: "/").map(String.init)
        if parts.count == 4 && parts[0] == "projects" && parts[2] == "files" {
            let projectId = try safePathSegment(parts[1])
            let fileId = try safePathSegment(parts[3])
            let fileURL = try projectFilePath(projectId: projectId, fileId: fileId)
            return (fileURL, try projectFileMimeType(projectId: projectId, fileId: fileId))
        }

        if parts.count == 5 && parts[0] == "projects" && parts[2] == "typed-files" && parts[4].hasPrefix("asset.") {
            let projectId = try safePathSegment(parts[1])
            let fileId = try safePathSegment(parts[3])
            let fileURL = try projectFilePath(projectId: projectId, fileId: fileId)
            return (fileURL, try projectFileMimeType(projectId: projectId, fileId: fileId))
        }

        if parts.count == 4 && parts[0] == "picker" && parts[2] == "files" {
            let requestId = try safePathSegment(parts[1])
            let fileId = try safePathSegment(parts[3])
            let requestRoot = try pickerRequestRoot(requestId: requestId)
            let filesRoot = try safeRelativeURL(root: requestRoot, relativePath: "files")
            let metadataRoot = try safeRelativeURL(root: requestRoot, relativePath: "file-metadata")
            let fileURL = try safeRelativeURL(root: filesRoot, relativePath: fileId)
            return (fileURL, try readMimeType(metadataRoot: metadataRoot, fileId: fileId))
        }

        throw RouteVNError.message("Invalid app file URL.")
    }

    private func safeRelativeURL(root: URL, relativePath: String) throws -> URL {
        let normalizedRelativePath = normalizedPath(relativePath)
        guard !normalizedRelativePath.isEmpty else {
            throw RouteVNError.message("Relative path is required.")
        }

        let rootURL = root.standardizedFileURL
        let targetURL = rootURL.appendingPathComponent(normalizedRelativePath).standardizedFileURL
        let rootPath = rootURL.path
        let targetPath = targetURL.path
        guard targetPath == rootPath || targetPath.hasPrefix(rootPath + "/") else {
            throw RouteVNError.message("Path escapes app storage.")
        }
        return targetURL
    }

    private func normalizedPath(_ value: String) -> String {
        var path = value.trimmingCharacters(in: .whitespacesAndNewlines)
        while path.hasPrefix("/") {
            path.removeFirst()
        }
        return path
    }

    private func writeMimeType(_ mimeType: String, metadataRoot: URL, fileId: String) throws {
        try FileManager.default.createDirectory(at: metadataRoot, withIntermediateDirectories: true)
        try normalizeMimeType(mimeType)
            .data(using: .utf8)?
            .write(to: metadataRoot.appendingPathComponent("\(try safePathSegment(fileId)).mime"), options: .atomic)
    }

    private func readMimeType(metadataRoot: URL, fileId: String) throws -> String {
        let metadataURL = metadataRoot.appendingPathComponent("\(try safePathSegment(fileId)).mime")
        guard let data = try? Data(contentsOf: metadataURL),
              let mimeType = String(data: data, encoding: .utf8) else {
            return "application/octet-stream"
        }
        return normalizeMimeType(mimeType)
    }
}

private extension FileManager {
    func removeItemIfExists(at url: URL) throws {
        if fileExists(atPath: url.path) {
            try removeItem(at: url)
        }
    }
}

private func requiredString(_ payload: [String: Any], _ key: String) throws -> String {
    let value = stringValue(payload[key])
    if value.isEmpty {
        throw RouteVNError.message("\(key) is required.")
    }
    return value
}

private func stringValue(_ value: Any?) -> String {
    if let value = value as? String {
        return value
    }
    if let value = value {
        return String(describing: value)
    }
    return ""
}

private func optionalString(_ payload: [String: Any], key: String) -> String? {
    guard let value = payload[key], !(value is NSNull) else {
        return nil
    }
    return stringValue(value)
}

private func javaScriptStringLiteral(_ value: String) -> String {
    guard
        let data = try? JSONEncoder().encode(value),
        let json = String(data: data, encoding: .utf8)
    else {
        return "\"\""
    }

    return json
}

private func boolValue(_ value: Any?) -> Bool {
    if let value = value as? Bool {
        return value
    }
    if let value = value as? NSNumber {
        return value.boolValue
    }
    let normalizedValue = stringValue(value).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return ["1", "true", "yes", "on"].contains(normalizedValue)
}

private func normalizeMimeType(_ value: String) -> String {
    let mimeType = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return mimeType.isEmpty ? "application/octet-stream" : mimeType
}

private func isUnreliableMimeType(_ value: String) -> Bool {
    let mimeType = normalizeMimeType(value).lowercased()
    return mimeType == "application/octet-stream" || mimeType == "text/plain"
}

private func mimeTypeForURL(_ url: URL, fallbackName: String) -> String {
    if let resourceValues = try? url.resourceValues(forKeys: [.contentTypeKey]),
       let mimeType = resourceValues.contentType?.preferredMIMEType {
        return normalizeMimeType(mimeType)
    }

    if let type = UTType(filenameExtension: url.pathExtension),
       let mimeType = type.preferredMIMEType {
        return normalizeMimeType(mimeType)
    }

    if let type = UTType(filenameExtension: URL(fileURLWithPath: fallbackName).pathExtension),
       let mimeType = type.preferredMIMEType {
        return normalizeMimeType(mimeType)
    }

    return "application/octet-stream"
}

private func createBundleHeader(manifestLength: Int) throws -> Data {
    if manifestLength > Int(UInt32.max) {
        throw RouteVNError.message("Bundle manifest is too large.")
    }

    var header = Data(repeating: 0, count: 16)
    header[0] = 4
    var bigEndianManifestLength = UInt32(manifestLength).bigEndian
    let lengthData = withUnsafeBytes(of: &bigEndianManifestLength) { Data($0) }
    header.replaceSubrange(1..<5, with: lengthData)
    return header
}

private func sha256Hex(data: Data) -> String {
    hexString(SHA256.hash(data: data))
}

private func sha256Hex(fileURL: URL) throws -> String {
    var hasher = SHA256()
    try forEachFileChunk(fileURL) { data in
        hasher.update(data: data)
    }
    return hexString(hasher.finalize())
}

private func hexString<DigestBytes: Sequence>(_ bytes: DigestBytes) -> String where DigestBytes.Element == UInt8 {
    bytes.map { String(format: "%02x", $0) }.joined()
}

private func forEachFileChunk(_ url: URL, body: (Data) throws -> Void) throws {
    let handle = try FileHandle(forReadingFrom: url)
    defer {
        handle.closeFile()
    }

    while true {
        let data = handle.readData(ofLength: 1024 * 1024)
        if data.isEmpty {
            return
        }
        try body(data)
    }
}

private func projectFileExtension(mimeType: String) -> String? {
    switch normalizeMimeType(mimeType).lowercased() {
    case "audio/mpeg", "audio/mp3":
        return "mp3"
    case "audio/ogg":
        return "ogg"
    case "audio/wav", "audio/wave", "audio/x-wav":
        return "wav"
    case "image/gif":
        return "gif"
    case "image/jpeg":
        return "jpg"
    case "image/png":
        return "png"
    case "image/svg+xml":
        return "svg"
    case "image/webp":
        return "webp"
    case "video/mp4":
        return "mp4"
    case "video/quicktime":
        return "mov"
    case "video/webm":
        return "webm"
    default:
        return nil
    }
}

private func sanitizeFilename(_ filename: String, fallback: String) -> String {
    var resolvedFilename = filename.trimmingCharacters(in: .whitespacesAndNewlines)
    if resolvedFilename.isEmpty {
        resolvedFilename = fallback
    }
    resolvedFilename = resolvedFilename.replacingOccurrences(of: "/", with: "-")
    resolvedFilename = resolvedFilename.replacingOccurrences(of: "\\", with: "-")
    resolvedFilename = resolvedFilename.replacingOccurrences(of: "\n", with: " ")
    resolvedFilename = resolvedFilename.replacingOccurrences(of: "\r", with: " ")
    resolvedFilename = resolvedFilename.replacingOccurrences(of: "\t", with: " ")
    if resolvedFilename.count > 160 {
        resolvedFilename = String(resolvedFilename.prefix(160))
    }
    return resolvedFilename
}

private func resolveProjectExportFolderName(projectInfo: [String: Any]) -> String {
    var title = sanitizeFilename(stringValue(projectInfo["name"]), fallback: "RouteVN Project")
    title = title.replacingOccurrences(of: ":", with: " ")
    title = title.replacingOccurrences(of: "*", with: " ")
    title = title.replacingOccurrences(of: "?", with: " ")
    title = title.replacingOccurrences(of: "\"", with: " ")
    title = title.replacingOccurrences(of: "<", with: " ")
    title = title.replacingOccurrences(of: ">", with: " ")
    title = title.replacingOccurrences(of: "|", with: " ")
    title = title.split(separator: " ").joined(separator: " ")
    if title.count > 80 {
        title = String(title.prefix(80)).trimmingCharacters(in: .whitespacesAndNewlines)
    }
    if title.isEmpty {
        title = "RouteVN Project"
    }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyyMMdd-HHmmss"
    return "\(title)-\(formatter.string(from: Date()))"
}
