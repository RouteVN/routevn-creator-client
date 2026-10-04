# Project import follow-ups

These come from an independent read-only review of the project import (PR #1244, reviewed at
commit `602b36e8`): five reviewers covered the JavaScript, Rust, Android and iOS code and
the agreement between the layers. The serious findings were fixed in the same PR (the iOS
library deletion, the iOS zip crash and short listing, the desktop zip hang and memory use,
the desktop empty-`files/` failure, the desktop rename-before-validate, and the Drive error
mapping on desktop). Everything below was found and not fixed. Behavior is described as the
reviewers traced it in code; where something was not run on a device, it says so.

Line numbers are not given because they drift; each item names the file and function.
`docs/project-import.md` describes how import works today.

## Worth doing first

### iOS: downloads fail when the screen locks or the app goes to the background

- **Where:** `ImportDownloader.swift`, the download task.
- **What happens:** the download is a plain `URLSession` data task on a blocked bridge thread,
  with no background task and no idle-timer control anywhere in `ios/`. When the app is
  suspended the connection is lost and the import ends with `downloadFailed`. A 500 MB import
  with Auto-Lock at 30 seconds (the default in Low Power Mode) is the likely case.
- **Idea:** keep the screen awake and request background time while an import runs, or use a
  background session.
- **Confidence:** likely; not tested on a device.

### iOS: an import killed mid-copy looks complete and cannot be repaired

- **Where:** `RouteVNApp.swift` (`importAccessibleProjectFolder`), `ProjectStoragePaths.swift`
  (`recordIdentity`, `createProjectDirectory`), `listProjectFolders`.
- **What happens:** the project is copied into its final named folder, with the identity file
  written first and `files/` created before its contents. "Complete" means only that
  `project.db` and `files/` exist. If the app is killed in between, the next launch lists a
  project with missing assets, and importing it again says "Project Already Added".
- **Idea:** copy into a hidden temporary sibling folder, rename it into place, and write the
  identity last. The old folder import had the same order; zip and URL imports now share it.
- **Confidence:** certain (logic); the kill timing was not reproduced.

### iOS: picked folders are copied without file coordination

- **Where:** `RouteVNApp.swift` (the copy of a picked folder), `ImportStaging.swift`
  (`listDirectory`).
- **What happens:** the folder is read without `NSFileCoordinator`. A project folder in iCloud
  Drive with "Optimize Storage" shows undownloaded files as `.name.icloud` placeholders. Rule A
  skips dot names and the copy copies the placeholders, so the import succeeds without those
  assets. This predates the PR.
- **Confidence:** likely.

### Android: staging in the cache folder can be trimmed while an import runs

- **Where:** `MainActivity.java` (`importRoot()` is `getCacheDir()/project-import`),
  `ImportProject.java` (only `project.db` is required), `projectImportService.js` (ignores the
  `{ files, bytes }` result of extraction).
- **What happens:** Android deletes cache files when storage runs low, oldest first, starting
  with apps over their cache quota, and a multi-GB import is what causes low storage. Files
  extracted early can disappear while extraction continues; the project is then registered
  with missing assets. If `archive.zip` is trimmed between listing and extraction the user
  gets a confusing `invalidArchive`.
- **Idea:** stage in `getNoBackupFilesDir()` as `ProjectBackup.java` already does, and/or check
  the extracted file count or bytes before the project moves into storage.
- **Confidence:** likely; documented platform behavior, not reproduced on a device.

### Android: an import is not tied to the page that started it

- **Where:** `MainActivity.java` (`importExecutor`, the import bridge methods,
  `recoverFromRenderProcessGone` / `resetDeadPageState`).
- **What happens:** if the renderer is killed in the background, the old download keeps running
  on the single import executor with its progress and reply dropped. A retry's
  `createImportStaging` waits behind it, so the dialog sits on "Connecting…" and may time out,
  and the dead page's staging folder (possibly GBs) stays until a sweep at least 24 hours later.
- **Idea:** track active import calls, cancel them when the page state is reset, and remove
  their staging folders.
- **Confidence:** likely.

## Android (lower priority)

- **A full disk during a download is reported as a download failure** with the reason dropped
  (`ImportDownloader.java`, `ImportStaging.java`), and some errors pass raw messages through, so
  absolute app-private paths can appear in the alert details (`ImportArchive.java`,
  `ProjectImportException.of`).
- **`java.net.URI` rejects URLs that JavaScript accepts:** `|`, `{ }`, `^`, backtick, `[ ]` in a
  path, `%zz`, host names with underscores (`ImportDownloader.java`). A redirect `Location` with
  a raw space fails, and a query-only `Location: ?token=x` resolves to the wrong URL.
- **Zips with non-UTF-8 entry names are rejected whole** (for example an older Windows Explorer
  zip with a Japanese folder name). Desktop and iOS fall back to CP437 and accept them; retrying
  `ZipFile` with `IBM437` would match (`ImportArchive.java`).
- **A truncated deflate stream is reported as `importFailed`** instead of `invalidArchive`
  (`EOFException` is not a `ZipException`, `ImportArchive.java`).
- **A picked-folder file name with a trailing space fails:** renames are planned from the raw
  name but the copy trims it (`listPickedDirectory`, `sanitizeImportedFilename`,
  `ImportProject.applyRenames`).
- **A redirect loop gives `invalidUrl`**, while desktop and iOS give `downloadFailed`, so the
  alert text differs (`ImportDownloader.java`).
- **Release builds block `http://localhost`** (`usesCleartextTraffic=false`), although the URL
  rules and the docs allow loopback http.
- **A failure after the native storage step leaves the project in app storage** when the
  identity check or `addProjectEntry` fails; JavaScript removes only staging
  (`android/appService.js`). The "fails and cleans up" test checks only staging.
- **Unused import** `java.util.concurrent.ConcurrentHashMap` in `MainActivity.java`.

## iOS (lower priority)

- **Symlinks other than `files` are copied as symlinks** from a picked folder (`project.db`, its
  sidecars, `file-metadata/`, entries inside `files/`), so later reads and writes follow them and
  two projects can end up sharing one database (`RouteVNApp.swift`).
- **Error details can show absolute paths and full `NSError` dumps** because Foundation errors are
  not `LocalizedError` (`codedImportError` falls back to `String(describing:)`); use
  `localizedDescription`.
- **`renameLegacyIdFolder` has no rollback:** it moves the folder before writing the identity, so
  a failed write leaves a renamed folder with no identity. `renameLegacyProjectFolder` errors also
  carry no import code (`ProjectStoragePaths.swift`, `RouteVNApp.swift`).
- **An orphaned download can block the bridge queue:** the serial `backgroundBridgeQueue` has no
  cancellation, so if the WebView process dies mid-download, startup and any retry wait for the
  old download (`RouteVNApp.swift`, `ImportDownloader.swift`).
- **`closeDatabase` runs on the background queue** against the `sqliteDatabases` dictionary that
  the main thread owns, a possible data race (`RouteVNApp.swift`; partly pre-existing).
- **On iOS 16, a redirect `Location` with raw spaces or non-ASCII characters fails** because
  `URL(string:)` returns nil; iOS 17 follows it (`ImportDownloader.swift`).
- **ZIPFoundation's overflow traps should be reported upstream.** The app now checks archives
  before opening them, but the library still traps on offsets above `Int64.max`.

## Desktop (lower priority)

- **A symlink entry in a zip is written as a small regular file** holding the link text. It is
  never followed, but iOS rejects such an entry. The old validator did the same as iOS; the
  docs now describe the current behavior (`project_import.rs`, `extract`).
- **Windows reserved names are not rejected in destination paths:** `files/NUL.png` becomes
  `files/NUL`, which Windows treats as a device, so the asset is silently dropped (`CON`,
  `COMn`, `LPTn` behave similarly). Reject reserved stems and segments that end in `.` or a space.
  Not run on Windows.
- **A public https URL can redirect the download to `http://127.0.0.1`, `localhost` or `[::1]`**
  on any port, because the loopback exception is checked per hop. Allow http on loopback only when
  the first URL is loopback itself (`validate_url`).
- **The native commands skip the fs plugin scope:** `download_file`, `list_archive` and
  `extract_archive` accept any absolute path from the webview, so a script in the window could
  download a file to any new path the user can write. Check `destination` and `archive` against
  the fs scope. This matches existing commands such as `create_distribution_zip_streamed`.
- **The OS proxy is ignored:** reqwest is built without `system-proxy`, so only proxy environment
  variables apply, and downloads fail behind a corporate proxy. The updater shares this build.
- **Calling `extract_archive` directly** on a hostile file (without `list_archive` first) can
  still use about 774 MB and a few seconds; the JavaScript flow always lists with `maxEntries`
  first, so it is not reachable through the app.
- **The zip crate 4.6.1 panics on an extended-timestamp extra field of length 0** in builds with
  overflow checks (debug and tests); release builds reject it. This is an upstream crate bug.

## JavaScript (lower priority)

- **Rule A is planned before the iOS "already added" check,** so a re-imported project whose
  incoming copy has a name clash shows `fileNameConflict` (or `invalidFileName`) instead of
  "Project Already Added" or restoring a hidden project (`ios/appService.js`,
  `projectImportService.js`). The docs now describe this.
- **The final progress call is not guarded:** a throwing listener aborts the import at the
  `finishing` event (`projectImportService.js`). On desktop, Tauri channel messages are not
  ordered against the command response, so a late "extracting" event can overwrite "Finishing".
- **`Content-Disposition` names are cut short or left encoded in some cases:** a quoted `;`,
  an apostrophe in `filename*`, an ISO-8859-1 `filename*`, and a percent-encoded plain
  `filename=` (`projectImportFolderName.js`). The folder name stays safe.
- **Account-scoped Drive links are not rewritten:** `drive.google.com/u/0/uc?id=…` and
  `/u/1/open?id=…` skip the `confirm=t` rewrite, so a large file hits the virus-scan page and
  shows the "check sharing" message (`projectImportUrl.js`).
- **`importFailed` and uncoded failures show "Please select a valid project folder"** for URL and
  zip imports too (`projectImportErrors.js`, `failedImportProject`), for example a full disk or
  an iOS project without an id.
- **AGENTS.md style items:** the Android archive picker resolves `null` and uses a `||` default
  (`android/filePicker.js`), and the new project handlers keep the existing `detail.item || detail`
  and `payload?._event?.detail || {}` fallbacks (`projects.handlers.js`).

## Tests

- **iOS has no Swift tests.** The path checks, archive check, downloader URL rules, the import
  tail (deletion guard, rollback, already-imported, renames), the legacy folder rename and the
  24-hour sweep were checked with scratch programs and on devices only.
- **Android:** written-byte counting is only tested with an honest declared size, the streaming
  download cap is never exercised (the test server always sends `Content-Length`), the bridge
  dispatch has no tests, and everything runs on the desktop JDK's zip and HTTP classes. The real
  storage step with `fileRenames` is untested.
- **Desktop:** no test for symlink entries, for a Deflated size or CRC mismatch, or for https
  (every download test uses loopback http), and one test binds and drops a port while others
  bind ports, a small flake risk.
