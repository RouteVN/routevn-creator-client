# Project Import

## Purpose

Import brings an existing RouteVN project into the Projects list, from a folder, a zip or a URL. It is
different from [Asset Package import](import-packages.md), which adds resources to a project that is
already open.

A project folder contains `project.db` (plus optional `-wal`, `-shm`, `-journal`), `files/<fileId>` and
`file-metadata/<fileId>.mime` (mobile exports). File ids match `^[A-Za-z0-9_-]{1,128}$` and never contain a
dot.

Rules, limits and error codes live in JavaScript and apply to every platform. Native code only provides
basic operations (see **Native contract**). Findings from the review that were not fixed in the first
release are in [project-import-followups.md](project-import-followups.md).

## Sources

| Platform | From local                | From URL                  | Where the imported project lives                                        |
| -------- | ------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| Desktop  | Project folder (in place) | Zip, into a chosen folder | A picked folder stays where it is; a URL import creates a new subfolder |
| Android  | Project folder or zip     | Zip                       | App-private `files/projects/<random id>`; every import gets a new id    |
| iOS      | Project folder or zip     | Zip                       | A folder in the library named after the project (see below)             |
| Web      | Not supported             | Not supported             |                                                                         |

The choices live in one dropdown with two levels: **Create** opens **Create Project** and **Import Project**,
and Import Project opens **From local** and **From URL**. On desktop the **Open** button opens the same two
choices. On desktop **From local** opens the folder picker straight away (there is no local zip choice) and
**From URL** asks for a parent folder after the URL is entered. On Android and iOS no single system picker
can select a folder or a file, so **From local** first shows an app-owned `showFormDialog` with **Project
folder** and **Zip file** buttons.

Android and iOS copy the project and keep no reference to the source.

**iOS folder names.** The folder is named after the project (sanitized: `< > : " / \ | ? *` and control
characters become `-`, spaces and dots at the ends are trimmed, at most 180 bytes, Windows reserved names get
a `_` prefix, "Untitled Project" when nothing is left, ` (2)`, ` (3)` when taken), like a project created in
the app. The folder name is only for people: the project's identity is the id inside `project.db`, and a
hidden `.routevn-project.json` in the folder maps that id to it, so the app finds the project even if the
folder is renamed in Files. Projects imported by earlier builds keep their id-named folders.

## Extension stripping (Rule A)

Every import stores the files directly inside `files/` under their file id: the name up to, but not
including, the first `.` (`abc.png` becomes `abc`, `a_b-1.tar.gz` becomes `a_b-1`). The rule is
`planFileRenames` in `src/internal/projectImportPlan.js`; native code only performs the renames it is given.

- Names that start with `.` and sub-directories are left alone. Links and directories are never renamed but
  keep their name occupied.
- An id that is not a valid file id fails with `invalidFileName` (`a b.png`).
- Two names that map to the same id (compared case-insensitively), or a target taken by a directory or link,
  fail with `fileNameConflict` before anything is renamed (`abc.png` + `abc.jpg`, `abc` + `abc.png`).
- A `files` folder that is itself a link is refused, so a rename can never leave the project.
  `file-metadata/` is never touched.

For a **picked folder**, JavaScript lists `files/` and plans the renames. Desktop renames inside the picked
folder, but only after the folder is known to be a project (`project.db` and `files/` exist and the database
is readable), and undoes the renames already made if one fails. Android and iOS pass the plan to
`importProjectFolder` and rename their own copy, never the source. For a **zip**, the plan is applied while
extracting: each file is written straight to its final name.

## Zip layout and safety (Rule B)

JavaScript reads the zip's entry table and decides what to extract (`planArchiveExtraction`). A zip is
accepted when its root, or its single top-level folder, contains `project.db`. `__MACOSX/` and dot entries
are ignored. Only `project.db` and its sidecars, `files/<name>` and `file-metadata/<name>` are extracted. A
missing `files/` is treated as empty (Android and iOS create it natively, the desktop host after
extraction). An archive holding `ROUTEVN_EXPORT_INCOMPLETE.txt` is rejected (`invalidArchive`).

Checked in JavaScript before anything is written: entry names with a backslash, NUL or `:`, or an empty, `.`
or `..` segment (including a leading `/`) are `unsafeArchiveEntry`; entries that differ only by case are
`invalidArchive`; more than 50,000 entries or 8 GiB declared to extract is rejected (`invalidArchive`,
`archiveTooLarge`); Rule A runs on the destination names. The zip file itself is limited to 4 GiB.

Native extraction keeps the filesystem honest: every destination path is re-checked (relative, plain names),
files are created exclusively (an existing file or a planted symlink is an error and no folder on the way
may be a symlink), bytes actually written are counted against the 8 GiB limit, each entry's size and CRC32
must match its header, and a failed extraction removes everything it created.

Before a zip library opens an archive, desktop and iOS check the end-of-central-directory record and the
central directory themselves and reject a malformed or hostile archive as `invalidArchive`: the end record
must end the file (comment at most 1,024 bytes), the entry count must be within the limit, the central
directory (at most 64 MiB, names at most 4,096 bytes, on desktop at most 16 extra fields per entry) must
consist of exactly that many well-formed records. This stops a tiny crafted file from making the library run
for minutes or allocate gigabytes (desktop) or crash the app (iOS). iOS also rejects encrypted entries,
checks that offsets and sizes fit the file, and requires the iterated entry count to equal the declared one.

Symlink entries: iOS rejects a requested one (`unsafeArchiveEntry`); desktop and Android write it as a small
regular file holding the link text, which is never followed. Android 14+ refuses to open a zip with a `..` or
leading-`/` entry name (reported as `invalidArchive`). Other library behavior (encrypted entries, unusual
compression, duplicate raw names) is reported as `invalidArchive`. A rejection is always safe: nothing
reaches app storage or the chosen folder.

## URL download (Rule C)

The URL is assumed to be a zip. `parseProjectImportUrl` (`src/internal/projectImportUrl.js`) accepts only
`https:` (`http:` only for `localhost`, `127.0.0.1`, `[::1]`) and rejects embedded credentials. Native code
enforces the same rule on every hop: at most 5 redirects, each re-checked. Connect timeout 15 s and stalled
read 30 s (iOS has one 30 s idle timeout); no overall deadline. The archive streams to a file and is never
held in memory, and `Content-Type` is not trusted. Downloads run natively because a WebView `fetch` only works
when the host sends CORS headers, and many do not (see **Native contract** for what the download does).

**Google Drive.** Share links open a viewer page and old download links stop at a virus-scan page, so the URL
check rewrites them (same result on every platform, idempotent):

| Input                                                                                                                                                                                          | Result                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `drive.google.com/file/d/<id>/view` (also `/file/u/0/d/<id>/…`), `open?id=<id>`, `uc?id=<id>&export=download`, `docs.google.com/uc?…&id=<id>`, `drive.usercontent.google.com/download?id=<id>` | `https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t` |
| `drive.google.com/drive/folders/<id>`, `folderview?id=<id>`                                                                                                                                    | rejected as `unsupportedUrl`                                                      |

`confirm=t` skips the virus-scan page (files over about 100 MB); a `resourcekey` parameter is kept. The file
must be shared as "Anyone with the link". When a Drive import ends in `invalidArchive` or an HTTP
`downloadFailed`, the error is reported as `googleDriveFailed` with a message to check sharing and the
download limit. This relies on Drive's public download endpoint, which is not a documented API.

On Android the calls that move a lot of data (`downloadFile`, `copyImportFile`, `extractImportArchive`
and the storage step, staged or picked) opt out of the bridge's 30-minute response timeout.

## Progress

Archive imports keep a progress dialog up with a status line and bar. Folder imports show no stage.

| Stage         | Status line                        | Bar                                                            |
| ------------- | ---------------------------------- | -------------------------------------------------------------- |
| (start, URL)  | Connecting…                        | Indeterminate until the server answers                         |
| (start, zip)  | Preparing…                         | Indeterminate while the zip is copied into staging             |
| `downloading` | Downloading… 76 MB of 195 MB (39%) | Bytes received of `Content-Length`; indeterminate when unknown |
| `extracting`  | Extracting files… 83%              | Uncompressed bytes written of the declared total               |
| `finishing`   | Finishing up…                      | Indeterminate: move or copy into place and registration        |

Native calls report only `{ current, total }` in bytes (`total` 0 when unknown); `projectImportService` knows
which call it waits for, adds the stage and the `finishing` event, and passes `{ stage, current, total }` to
the dialog. The first event is sent when the work starts (for a download, once headers arrive), events are
throttled to one per 100 ms and the last is always sent. Progress is best effort: failing to deliver an
event never changes the result. Desktop passes a Tauri `Channel` named `onProgress`; Android and iOS call
`window.__routeVNAndroidTransferProgress` / `window.__routeVNIOSTransferProgress` with
`{ tempFolderId, current, total }`, and JavaScript accepts only its own temporary folder id. The listener lives for one
native call. Status text is in the `projectsPage` i18n catalogs (`import*Status`).

## Temporary data

JavaScript removes the staging folder when an import settles, on success and failure; there is no cancel.
Android and iOS also sweep staging folders older than 24 hours when a new one is created.

| Platform | Staging folder (`archive.zip` and `extracted/`)                | Then                                                   |
| -------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| Desktop  | `routevn-import-<random>` folder inside the chosen destination | `extracted/` is moved into place beside it             |
| Android  | `cacheDir/project-import/<tempFolderId>/`                      | The payload is moved into `files/projects/<projectId>` |
| iOS      | `tmp/project-import/<tempFolderId>/`                           | The payload is copied into the project library folder  |

The archive stays outside `extracted/`, so it can never end up inside a project. On desktop the staging folder
is visible while the import runs (the fs plugin scope does not match leading-dot names) and stays if the app
is killed mid-import. The desktop destination folder is named from `Content-Disposition`, else the last URL
segment, else `RouteVN Project` (`deriveImportFolderName`; unsafe characters become `-`, at most 180 bytes,
Windows reserved names prefixed with `_`); a taken name gets ` 2`, ` 3`, so an existing folder is never
overwritten, and the moved folder is removed again if registering fails.

## Importing a project that already exists

- **Android:** always a new project (new random id).
- **Desktop:** projects are registered by folder path. The same folder again refreshes its entry and shows the
  normal "imported" toast; the same project in another folder is a separate entry.
- **iOS:** the id inside `project.db` is the identity, and a project is "in the library" when its folder has
  `project.db` and `files/`. Folder, zip and URL imports share one tail:
  - **Listed project:** nothing is copied, renamed or deleted and the list entry is untouched. The import ends
    with `projectExists` and the alert "Project Already Added" says nothing was imported; on iOS it adds that
    the way to use the incoming copy is to delete the project's folder in the Files app and import again (in-app
    Remove only hides a project). JavaScript still plans Rule A for the incoming copy first, so a copy that also
    has a name clash ends with `fileNameConflict` or `invalidFileName` instead.
  - **Hidden project:** one removed from the list but still on disk is restored by importing it again, with
    the library's own name, description and icon and no renames applied. An id-named folder from an older build
    is renamed after the project; any other folder name is left alone.
  - **Unfinished import:** a folder that is clearly an unfinished import of this same project (its identity file
    names this id, or it is the id-named folder an older build made, with `project.db` and no `files/`) is removed
    and replaced by the incoming copy. Any other folder or file that merely uses the id as its name is never
    deleted: the import fails with `importFailed`.

`projectExists` is raised in JavaScript (iOS registration, and the duplicate check when a different project is
added at an already-listed path on desktop).

## Errors

Every failure raised by the import code is an `Error` whose message is a stable code, `: ` and a technical
detail; the client maps the code to a localized alert and appends the detail with `withErrorDetails`
(`src/internal/projectImportErrors.js`). Failures that come from the platform have no code and show the generic
alert with their text as the detail (Tauri's `invoke` rejects with plain text; picked-desktop-folder checks, the
project service and some storage-step errors are uncoded).

Native code raises only `invalidUrl`, `downloadFailed`, `tooLarge`, `writeFailed`, `invalidArchive`,
`unsafeArchiveEntry` and `importFailed`. JavaScript raises `invalidFileName`, `fileNameConflict` (Rule A),
`unsupportedUrl`, `googleDriveFailed`, `projectExists`, `archiveTooLarge` (the zip plan's size limit) and the
layout failures of the zip plan. A redirect loop is `downloadFailed` on every platform. `tooLarge` and
`archiveTooLarge` show the same message, and so do `writeFailed` and `importFailed`. Android and iOS report any
storage-step failure as `importFailed`.

## Native contract

Import is app logic, so it lives in JavaScript. Native code only exposes operations a WebView cannot do itself
(stream a download to disk, read and extract a zip, touch the app's private files) and does not decide what a
project is. JavaScript owns URL parsing and Drive links (`projectImportUrl.js`), the zip layout, entry-name
checks, limits and Rule A (`projectImportPlan.js`), the sequence, progress stages and cleanup
(`projectImportService.js`, driven through a small per-platform `projectImportHost.js`), desktop folder naming
and which error to show. The exception is each platform's storage step (`importProjectFolder`): on iOS it also
names the library folder, decides "already in the library" and removes an unfinished import, and iOS exposes
`renameLegacyProjectFolder` for a hidden project; on Android a picked folder with the incomplete-export marker
is rejected there. Picking a zip goes through the platform's `openArchivePicker`, outside this contract.

Every native error message is `<code>: <detail>` using only the seven native codes above.

**The download is a general operation.** `download_file` / `downloadFile` is a plain GET of one URL into a new
file. It knows nothing about projects, zips or Google Drive: link rewriting, the zip's meaning and the Drive
error hint are JavaScript (`projectImportUrl.js`, `projectImportFlows.js`). Every caller gets the same rules: https
only (http for loopback hosts), no credentials in the URL, at most 5 redirects with every hop checked again,
15 s connect and 30 s stalled-read timeouts, `Accept-Encoding: identity` (the bytes are saved as sent), a
`maxBytes` limit, a destination that must not exist (it is never overwritten) and the partial file removed on
failure. It returns `{ finalUrl, contentDisposition?, bytes }` and reports `{ current, total }` progress. Its
errors are `invalidUrl`, `downloadFailed` (network, a non-2xx status, redirect problems), `tooLarge` and
`writeFailed`. It sends no request headers or cookies; a caller that needs them adds an optional argument.

**Desktop (Tauri commands).** Paths are absolute. JavaScript creates, renames and removes folders with the Tauri
fs plugin (`fs:allow-rename` is in `src-tauri/capabilities/default.json`); native code provides three commands:

| Command           | Arguments                                                                                                  | Result                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `download_file`   | `url`, `destination` (new file, parent exists), `maxBytes`, `onProgress` (Channel)                         | `{ finalUrl, contentDisposition?, bytes }`   |
| `list_archive`    | `archive`, `maxEntries`                                                                                    | `{ entries: [{ name, size, isDirectory }] }` |
| `extract_archive` | `archive`, `destination` (existing folder), `files: [{ entry, path }]`, `maxBytes`, `onProgress` (Channel) | `{ files, bytes }`                           |

**Android and iOS (bridge methods).** Same methods and payloads on both. A temporary folder is native-owned and
addressed by an opaque `tempFolderId`; every `path` is relative to it, and native rejects absolute paths and
empty, `.` or `..` segments, backslash, `:` and NUL.

| Method                 | Payload                                                                                           | Result                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `createTempFolder`     | none                                                                                              | `{ tempFolderId }`; also removes temporary folders older than 24 hours                     |
| `removeTempFolder`     | `tempFolderId`                                                                                    | `{}`; idempotent                                                                           |
| `downloadFile`         | `tempFolderId`, `url`, `path`, `maxBytes`                                                         | `{ finalUrl, contentDisposition?, bytes }`; progress events                                |
| `copyImportFile`       | `tempFolderId`, `uri` (picked file), `path`, `maxBytes`                                           | `{ bytes }`                                                                                |
| `listImportArchive`    | `tempFolderId`, `path`, `maxEntries`                                                              | `{ entries: [{ name, size, isDirectory }] }`                                               |
| `extractImportArchive` | `tempFolderId`, `path`, `destination`, `files: [{ entry, path }]`, `maxBytes`                     | `{ files, bytes }`; progress events                                                        |
| `listImportDirectory`  | `{ tempFolderId, path }` or `{ uri, path }` (picked folder); an empty `path` is the folder itself | `{ entries: [{ name, kind, size }] }`, `kind` is `file`, `directory`, `symlink` or `other` |
| `importProjectFolder`  | `{ tempFolderId, path }` or `{ uri }`, `projectId` (Android only), `fileRenames?: [{ from, to }]` | The registered project                                                                     |

`importProjectFolder` copies or moves the project into app storage, restores the identity and reports it. For a
staging source with no `files/` or `file-metadata/` the copy gets an empty one. It applies `fileRenames` to the
files directly inside the copy's `files/` (never overwriting) and does not decide which renames are needed.

## Implementation map

- UI flow: `src/pages/projects/` (`support/projectImportFlows.js`), status text in
  `src/internal/projectImportProgress.js`
- Rules: `src/internal/projectImportUrl.js`, `projectImportPlan.js`, `projectImportFolderName.js`,
  `projectImportErrors.js`
- Sequence and cleanup: `src/deps/services/shared/projectImportService.js`; platform hosts
  `src/deps/clients/tauri/projectImportHost.js`, `mobileProjectImportHost.js` and the Android/iOS wrappers;
  progress listeners `src/deps/clients/transferProgress.js`
- Desktop native: `src-tauri/src/download.rs` (the download) and `src-tauri/src/project_import.rs` (zip list and extract)
- Android native: `FileDownloader.java`, `TempFolders.java`, `TransferProgress.java`, `CodedException.java`, `ImportArchive.java` and `ImportProject.java` in `android/routevn/app/src/main/java/com/routevn/creator/` and the bridge methods
  in `MainActivity.java`
- iOS native: `FileDownloader.swift`, `TempFolders.swift`, `TransferProgress.swift`, `CodedError.swift`, `ImportArchive.swift` (ZIPFoundation) and the bridge
  methods in `RouteVNApp.swift`
