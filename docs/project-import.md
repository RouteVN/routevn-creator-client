# Project Import

## Purpose

Import brings an existing RouteVN project folder into the Projects list. It is
different from [Asset Package import](import-packages.md), which adds resources
to a project that is already open.

A project folder contains:

```text
project.db            (plus optional project.db-wal, -shm, -journal)
files/<fileId>
file-metadata/<fileId>.mime   (mobile exports)
```

File ids match `^[A-Za-z0-9_-]{1,128}$` and never contain a dot.

## Sources

| Platform | From local                | From URL                  |
| -------- | ------------------------- | ------------------------- |
| Desktop  | Project folder (in place) | Zip, into a chosen folder |
| Android  | Project folder or zip     | Zip                       |
| iOS      | Project folder or zip     | Zip                       |
| Web      | Not supported             | Not supported             |

The choices live in one dropdown with two levels, never in a second menu that
replaces the first. The leaves are **From local** and **From URL**:

- Android and iOS: **Create** opens a menu with **Create Project** and **Import
  Project**. Import Project opens a second level in the same dropdown with **From
  local** and **From URL**.
- Desktop: the **Open** button opens a dropdown with **From local** and **From
  URL**.

**From local** accepts either a project folder or a zip file:

- Desktop opens the folder picker straight away. There is no local zip choice, and
  **From URL** asks for a parent folder after the URL is entered.
- Android and iOS have no single system picker that can select both a folder and a
  file, so **From local** first shows the app's `showFormDialog` source dialog with
  vertically stacked **Project folder** and **Zip file** buttons, the same pattern
  as the Gallery and File picker buttons on the media pickers. Each button launches
  the matching system picker, and dismissing the dialog does nothing. It is app-owned
  JavaScript UI, not a second dropdown.

Desktop registers the imported folder where it is. Android and iOS copy the
project and keep no reference to the source: Android into app-private storage, iOS
into the project library folder chosen in Files.

### Where the imported project lives

| Platform | Folder                                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop  | A picked folder stays where it is. For a URL import, a new subfolder of the chosen parent named after the downloaded file (see URL download below).                   |
| Android  | `files/projects/<random id>`. Every import gets a new random id, written into the project's database.                                                                 |
| iOS      | A folder in the library named after the **project name**, sanitized, with ` (2)`, ` (3)` and so on when the name is taken, exactly like a project created in the app. |

On iOS the folder name is only for people. The project's identity is the id inside
`project.db`, and a hidden `.routevn-project.json` file in the folder maps that id to
the folder, so the app finds the project whatever the folder is called, even after it
is renamed in Files. The name is sanitized by replacing `< > : " / \ | ? *` and control
characters with `-`, trimming spaces and dots, limiting it to 180 bytes, prefixing
Windows reserved names with `_`, and using "Untitled Project" when nothing is left.
Non-Latin names are kept. Projects imported by earlier builds keep their id-named
folders and are still found.

## Extension stripping (Rule A)

Every import stores the files directly inside `files/` under their file id. The rule
lives in `planFileRenames` (`src/internal/projectImportPlan.js`); native code only
performs the renames it is given. For a project folder, JavaScript lists `files/` and
sends the plan along: desktop renames inside the folder the user picked, so it changes
that folder (only after the folder has been checked to be a project: it must have
`project.db` and `files/`, and its database must be readable), while Android and iOS
apply the renames to their own copy and never touch the user's source folder. For a zip, the plan is applied while extracting: each file is
written straight to its final name, so nothing is renamed afterwards.

A `files` folder that is itself a link is refused on every platform, so a rename can
never reach outside the project. Links and directories inside `files/` are never
renamed, but they still occupy their name: `abc.png` next to a link called `abc` fails
with `fileNameConflict` instead of replacing the link.

- The file id is the name up to, but not including, the first `.`. Names with no
  `.` are unchanged.
- Names that start with `.` (`.DS_Store`, `._x`) and sub-directories are left
  alone.
- If the resulting id is not a valid file id (`[A-Za-z0-9_-]{1,128}`), the import
  fails with `invalidFileName`.
- If two names map to the same id, compared case-insensitively, or the target
  name is already taken by a directory or link, the import fails with
  `fileNameConflict` before anything is renamed. On desktop, if a rename fails partway,
  the renames already made are undone.
- `file-metadata/` is never touched.

| Name                  | Result             |
| --------------------- | ------------------ |
| `abc.png`             | `abc`              |
| `a_b-1.tar.gz`        | `a_b-1`            |
| `abc.png` + `abc.jpg` | `fileNameConflict` |
| `abc` + `abc.png`     | `fileNameConflict` |
| `a b.png`             | `invalidFileName`  |

## Zip layout and safety (Rule B)

JavaScript reads the zip's entry table and decides what to extract
(`planArchiveExtraction`). Native code lists the entries and extracts the ones it is
asked for, and nothing else.

A zip is accepted when its root, or its single top-level folder, contains
`project.db`. `__MACOSX/` and dot-entries are ignored. A missing `files/` is
treated as empty: Android and iOS create it natively, and the desktop host creates it
after extraction. Only `project.db` and its sidecars (`-wal`, `-shm`, `-journal`),
`files/<name>` and `file-metadata/<name>` are extracted; everything else is skipped,
including anything nested deeper. An archive that contains the incomplete-export
marker, as a file or a directory, is rejected with `invalidArchive`.

JavaScript checks the entry table before anything is written:

- Entry names containing a backslash, NUL, or `:`, and names with an empty, `.`,
  or `..` segment (including a leading `/` or `./`), are rejected as
  `unsafeArchiveEntry`.
- Entries whose paths differ only by case are rejected as `invalidArchive`, so one
  entry can never silently replace another.
- More than 50,000 entries, or more than 8 GiB declared for the entries to extract,
  is rejected (`invalidArchive`, `archiveTooLarge`).
- Rule A is applied to the destination names, so a name clash or an invalid file id
  fails before the first byte is written.

Native extraction keeps the filesystem and the byte counts honest:

- Every destination `path` must be relative and made of plain names, otherwise
  `unsafeArchiveEntry`.
- Output files are created exclusively, so an existing file or a planted symlink is an
  error and is never written through, and no folder on the way may be a symlink.
- Every extracted entry's byte count and CRC32 must match its header, otherwise
  `invalidArchive`.
- The bytes actually written are counted against the limit (8 GiB), so a header that
  lies about its size cannot fill the disk (`archiveTooLarge`).
- When extraction fails, everything it created is removed.

The downloaded or picked zip itself is limited to 4 GiB.

Before a zip library opens an archive, desktop and iOS check its end-of-central-directory
record and central directory themselves, and reject a malformed or hostile archive as
`invalidArchive`: the end record must be at the end of the file (a zip comment is limited
to 1,024 bytes), the declared entry count must not exceed the limit (50,000), the central
directory must be at most 64 MiB and consist of exactly that many well-formed records,
and no entry name may be longer than 4,096 bytes (on desktop an entry may also carry at
most 16 extra fields). This keeps a tiny crafted file from making the zip library run for
minutes or allocate gigabytes (desktop), or crash the app (iOS). iOS also rejects an
encrypted entry, checks that every entry's offset and sizes fit the file, and requires the
number of entries the library returns to equal the declared count, so an unreadable entry
can no longer make a listing silently incomplete.

Entries that are not regular files are only partly special-cased: iOS rejects a
requested symlink entry (`unsafeArchiveEntry`), while desktop and Android write it as an
ordinary small file holding the link's text, which is never followed. Android 14 and later refuse to open a zip that has an entry name with `..` or a
leading `/`; the import reports that as `invalidArchive` instead of
`unsafeArchiveEntry`. The platform zip libraries also decide how encrypted entries,
unusual compression methods and duplicate raw entry names behave (the desktop library
shows duplicate names as one entry, iOS rejects them), and a failure there is reported
as `invalidArchive`. Re-zipping the project folder with the system's normal "compress"
command produces an accepted archive. A rejection is always safe: nothing reaches app
storage or the chosen folder.

## URL download (Rule C)

The URL is assumed to be a zip. `parseProjectImportUrl` (`src/internal/projectImportUrl.js`)
accepts only `https:`; `http:` is accepted only for `localhost`, `127.0.0.1`, and
`[::1]`. URLs with embedded credentials are rejected. Native code enforces the same
rule on every hop of the download: at most 5 redirects, each one re-checked. On desktop
and Android, connections time out after 15 seconds and stalled reads after 30 seconds.
iOS has no separate connect timeout, so its single 30-second idle timeout covers both.
There is no overall deadline. The archive streams to a temporary file and is never held
in memory. The server's `Content-Type` is not trusted; the file is validated by parsing
it as a zip.

### Google Drive links

Drive share links open a viewer page, and Drive's older download links stop at a
virus-scan warning page for large files, so neither returns the zip. The URL check
rewrites them before the download starts. The rewrite is shared by every platform
and gives the same result when applied to its own output.

| Input                                                                           | Result                                                                            |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `drive.google.com/file/d/<id>/view` (also `/file/u/0/d/<id>/…`)                 | `https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t` |
| `drive.google.com/open?id=<id>`, `drive.google.com/uc?id=<id>&export=download`  | same                                                                              |
| `docs.google.com/uc?…&id=<id>`, `drive.usercontent.google.com/download?id=<id>` | same                                                                              |
| `drive.google.com/drive/folders/<id>`, `folderview?id=<id>`                     | rejected as `unsupportedUrl`                                                      |

- `confirm=t` skips the virus-scan page, which Drive shows for files over about
  100 MB. A `resourcekey` parameter on newer share links is kept.
- The file must be shared as "Anyone with the link". Folder links cannot be
  downloaded as one file, so share the zip itself.
- Drive answers with a web page instead of the file when a file is private or has
  hit its download limit. When a Drive import ends in `invalidArchive` or
  `downloadFailed`, the error is reported as `googleDriveFailed` with a message that
  says to check the sharing setting and the download limit.
- This relies on Drive's public download endpoint, which is not a documented API
  and can change.

On Android, the calls that move a lot of data (`downloadImportFile`, `copyImportFile`,
`extractImportArchive` and the storage step for both a staged and a picked folder) opt
out of the JavaScript bridge's default 30-minute response timeout, because a large archive on a slow connection can legitimately take longer. The
native side bounds the download itself with the connect and stall timeouts.

Downloads and extraction run natively, not through the WebView, because most
hosts do not send CORS headers and a WebView fetch would buffer the whole archive
in JavaScript memory.

## Progress

Archive imports (From URL and a local zip file on Android and iOS) keep the progress
dialog up with a status line and a progress bar that follow the import through its
stages. Folder imports show no stage.

| Stage         | Status line                        | Bar                                                                                               |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| (start, URL)  | Connecting…                        | Indeterminate until the server answers                                                            |
| (start, zip)  | Preparing…                         | Indeterminate while the zip is copied into staging                                                |
| `downloading` | Downloading… 76 MB of 195 MB (39%) | Bytes received of `Content-Length`; indeterminate with the size so far when the length is unknown |
| `extracting`  | Extracting files… 83%              | Uncompressed bytes written of the declared total of the extracted entries                         |
| `finishing`   | Finishing up…                      | Indeterminate: moving or copying into place and registration                                      |

Native calls report only `{ current, total }` in bytes (see "Progress events" below).
`projectImportService` knows which call it is waiting for and turns the numbers into
`{ stage, current, total }` for the dialog, adding the `finishing` event itself before the
storage step. `downloading` reports bytes written to the temporary archive; `total` is 0
when the server sends no length. `extracting` counts bytes actually written, chunk by
chunk, so one large file advances smoothly. `finishing` has `current` and `total` 0.
Progress is best effort. A failure to deliver an event never changes the import result.

Delivery per platform:

- Desktop: `download_file` and `extract_archive` take a Tauri `Channel` argument named
  `onProgress`.
- Android and iOS: the native side calls `window.__routeVNAndroidProjectImportProgress` or
  `window.__routeVNIOSProjectImportProgress` with `{ stagingId, current, total }`;
  JavaScript only accepts events for the staging folder of its own import.

The listener is registered for the duration of one native call and removed when it settles,
whether it succeeds or fails. The status text lives in the `projectsPage` i18n catalogs
(`importConnectingStatus`, `importPreparingStatus`, `importDownloadingStatus`,
`importDownloadingUnknownStatus`, `importExtractingStatus`, `importFinishingStatus`).

## Temporary data

JavaScript removes the staging folder when an import settles, on success and on failure.
There is no cancel button, so there is no cancelled state.

| Platform | Staging folder (holds `archive.zip` and `extracted/`)          | Then                                                                  |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Desktop  | `routevn-import-<random>` folder inside the chosen destination | `extracted/` is moved into place beside it, which stays on one volume |
| Android  | `cacheDir/project-import/<stagingId>/`                         | The payload is moved into `files/projects/<projectId>`                |
| iOS      | `tmp/project-import/<stagingId>/`                              | The payload is copied into the project library folder                 |

The archive is always kept outside `extracted/`, the folder that becomes the project, so
it can never end up inside a project. The extracted folder holds only the files the plan
asked for.

On desktop the staging folder is visible while the import runs, because the fs plugin's
scope does not match names with a leading dot. If the app is killed mid-import the
folder stays in the destination and can be deleted by hand. The destination folder name
comes from the server's `Content-Disposition` filename, else the last URL path segment,
else `RouteVN Project` (`deriveImportFolderName`). Unsafe characters become `-`, spaces
and dots at the ends are trimmed, the name is limited to 180 bytes, and Windows reserved
device names are prefixed with `_`. If the name is taken, ` 2`, ` 3`, and so on are tried
so an existing folder is never overwritten or merged. If registering the project fails,
the moved folder is removed again.

Android and iOS also remove staging folders older than 24 hours when a new one is created.

## Importing a project that already exists

| Platform | Importing the same project again                                                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android  | Always a new project: every import gets a new random id, so nothing is overwritten.                                                                                                       |
| Desktop  | Projects are registered by folder path. The same folder again refreshes the existing entry and shows the normal "imported" toast; the same project in another folder is a separate entry. |
| iOS      | The id inside `project.db` is the project's identity, whatever its folder is called. See below.                                                                                           |

On iOS, a project is "in the library" when its folder has both `project.db` and `files/`.
Folder, zip and URL imports share one tail, which treats an id that is already in the
library like this:

- **Listed project:** nothing is copied, nothing is renamed, nothing is deleted and the
  list entry is not touched. The incoming source (the folder, the unzipped archive or the
  download) is ignored. (JavaScript still plans Rule A for the incoming copy before
  native code reports that the project exists, so an incoming copy that also has a name
  clash or an invalid file id ends with `fileNameConflict` or `invalidFileName` instead.)
  The import ends with `projectExists`, and the user sees an alert
  titled "Project Already Added", not a success toast and not the failure alert. It says
  in one sentence that the project has already been added, so nothing was imported and the
  existing project was not changed. On iOS a second sentence says how to use the incoming
  copy instead: delete the project's folder in the Files app, then import again. Removing
  the project in the app does not do this, because Remove only hides it (see **Hidden
  project**). Desktop only raises it when a different project turns up at a path that is
  already listed, and shows the alert without that sentence because there is nothing to
  replace.
- **Hidden project:** a project that was removed from the list but is still on disk is
  restored by importing it again. The restored entry describes the library's own copy
  (its own name, description and icon), never the incoming one, and no renames are applied
  (the plan is still checked, as above).
  If its folder is still named after the id, as older builds made them, the folder is
  renamed after the project (sanitized, with ` (2)` when taken), so the result looks like
  every other import. A folder with any other name is left alone.
- **Unfinished folder:** a folder that is clearly an unfinished earlier import of this
  same project is not a project the app lists. That means a folder whose identity file
  names this id, or the id-named folder an older build made (it has `project.db` and no
  `files/`). It is removed and replaced by the incoming copy in a new folder named after
  the project, so the result never keeps the leftover's name. Any other folder or file
  that merely uses the id as its name is never deleted: the import fails with
  `importFailed` instead.

`projectExists` is raised in JavaScript, by the iOS registration and by the duplicate check
when a different project is added at a path that is already listed, and is mapped like the
native error codes. Importing the very same folder again on desktop is not an error: it
refreshes the existing entry, so the user sees the usual "imported" toast and no second
entry appears.

## Errors

Every failure raised by the import code is an `Error` whose message starts with a stable
code, then `: `, then a technical detail. The client maps the code to a localized message
and appends the detail with `withErrorDetails` (`src/internal/projectImportErrors.js`).
Failures that come from the platform have no code and show the generic alert with their
text as the detail: Tauri's `invoke` rejects with plain text (not an `Error`), and the
folder checks of a picked desktop folder, the project service and some storage-step
errors raise uncoded messages.

`invalidUrl`, `downloadFailed`, `archiveTooLarge`, `invalidArchive`,
`unsafeArchiveEntry`, `invalidFileName`, `fileNameConflict`, `projectExists`,
`importFailed`, `unsupportedUrl`, `googleDriveFailed`.

Native code raises only `invalidUrl`, `downloadFailed`, `archiveTooLarge`,
`invalidArchive`, `unsafeArchiveEntry` and `importFailed`. The rest are raised in
JavaScript: `invalidFileName`, `fileNameConflict` (Rule A), `unsupportedUrl` (for
example a Drive folder link), `googleDriveFailed` (see Google Drive links above),
`projectExists`, and the layout failures of the zip plan (`invalidArchive`,
`unsafeArchiveEntry`, `archiveTooLarge`). A redirect loop is `downloadFailed` on desktop and iOS and
`invalidUrl` on Android, so the alert text differs.

Android and iOS report any failure of the storage step as `importFailed`, so a
`project.db` that cannot be read shows as an import failure with its detail.

## Native contract

Import is app logic, so it lives in JavaScript. Native code only exposes basic
operations that a WebView cannot do itself (stream a large download to disk, read and
extract a zip, touch the app's private files) and does not decide what a project is.
JavaScript decides the zip layout, the file names, the limits, the progress stages, the
desktop folder names and the error to show. The exception is each platform's existing
storage step (`importProjectFolder`): on iOS it also names the library folder, decides
whether the project is already in the library and removes an unfinished earlier import
(see above), and iOS additionally exposes `renameLegacyProjectFolder` for a hidden
project; on Android a picked folder that holds the incomplete-export marker is rejected
there. Picking a zip goes through the platform's `openArchivePicker`, which is not part
of the import contract.

Every native error message is `<code>: <detail>` using only these codes:
`invalidUrl`, `downloadFailed`, `archiveTooLarge`, `invalidArchive`,
`unsafeArchiveEntry`, `importFailed`.

### Progress events

A call that moves bytes (`download`, `extract`) reports `{ current, total }` in bytes;
`total` is 0 when unknown. The first event is sent as soon as the work starts with
`current` 0 (for a download, once the server's response headers have arrived, so the
app can show "Connecting" until then), events inside the call are throttled to one per
100 ms, and the last event is always sent. Progress is best effort: failing to deliver an
event never changes the result. JavaScript knows which call it is waiting for, so events
carry no stage name.

### Desktop (Tauri commands)

Paths are absolute. JavaScript creates folders, renames and removes with the Tauri fs
plugin (the `fs:allow-rename` permission is in `src-tauri/capabilities/default.json`);
native code only provides these three commands.

| Command           | Arguments                                                                                                  | Result                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `download_file`   | `url`, `destination` (new file, parent exists), `maxBytes`, `onProgress` (Channel)                         | `{ finalUrl, contentDisposition?, bytes }`   |
| `list_archive`    | `archive`, `maxEntries`                                                                                    | `{ entries: [{ name, size, isDirectory }] }` |
| `extract_archive` | `archive`, `destination` (existing folder), `files: [{ entry, path }]`, `maxBytes`, `onProgress` (Channel) | `{ files, bytes }`                           |

### Android and iOS (bridge methods)

The two bridges expose the same methods with the same payloads. A **staging folder**
is a native-owned temporary folder, addressed by an opaque `stagingId`; all `path`
values are relative to it. Native rejects any path that is absolute or has an empty,
`.` or `..` segment, a backslash, `:` or NUL, so JavaScript can never leave it.

| Method                 | Payload                                                                                          | Result                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `createImportStaging`  | none                                                                                             | `{ stagingId }`. Also removes staging folders older than 24 hours.                         |
| `removeImportStaging`  | `stagingId`                                                                                      | `{}`. Idempotent.                                                                          |
| `downloadImportFile`   | `stagingId`, `url`, `path`, `maxBytes`                                                           | `{ finalUrl, contentDisposition?, bytes }`. Progress events.                               |
| `copyImportFile`       | `stagingId`, `uri` (picked file), `path`, `maxBytes`                                             | `{ bytes }`                                                                                |
| `listImportArchive`    | `stagingId`, `path`, `maxEntries`                                                                | `{ entries: [{ name, size, isDirectory }] }`                                               |
| `extractImportArchive` | `stagingId`, `path`, `destination`, `files: [{ entry, path }]`, `maxBytes`                       | `{ files, bytes }`. Progress events.                                                       |
| `listImportDirectory`  | `{ stagingId, path }` or `{ uri, path }` (a picked folder); an empty `path` is the folder itself | `{ entries: [{ name, kind, size }] }`, `kind` is `file`, `directory`, `symlink` or `other` |
| `importProjectFolder`  | `{ stagingId, path }` or `{ uri }`, `projectId` (Android only), `fileRenames?: [{ from, to }]`   | The registered project, as before                                                          |

Progress events are delivered to `window.__routeVNAndroidProjectImportProgress` and
`window.__routeVNIOSProjectImportProgress` as `{ stagingId, current, total }`.

`importProjectFolder` is the platform's storage step: it copies or moves the project
into the app's project storage, restores the identity, and reports the project. When
the source is a staging folder and `files/` or `file-metadata/` is missing from it, the
copy gets an empty one (an archive may legitimately hold no assets). It applies
`fileRenames` to the files directly inside the copy's `files/` (each `from` becomes
`to`, never overwriting) and does not decide which renames are needed.

### Native download and extraction rules

These are transport and filesystem safety, so they stay native:

- Download: `https:` only (`http:` for `localhost`, `127.0.0.1`, `[::1]`), no
  credentials in the URL, at most 5 redirects with every hop passing the same check,
  15 s connect and 30 s stalled-read timeouts, streamed to the new file and never held
  in memory, `archiveTooLarge` past `maxBytes`. The new file must not already exist.
- `list_archive` / `listImportArchive` reads the zip's entry table and returns raw
  names; it fails with `invalidArchive` for a file that is not a readable zip or has
  more than `maxEntries` entries.
- `extract_archive` / `extractImportArchive` writes only the requested entries, each to
  the requested relative `path`. It creates missing folders, creates files exclusively
  (an existing file or symlink is an error, never written through), refuses a
  destination `path` that is unsafe (`unsafeArchiveEntry`), checks each entry's CRC32
  and size (`invalidArchive`), and fails with `archiveTooLarge` once the bytes
  actually written pass `maxBytes`.
- Temporary data is removed by JavaScript when an import settles; a staging folder that
  is left behind by a crash is removed by the 24-hour sweep.

### What JavaScript owns

- URL parsing and Google Drive links (`src/internal/projectImportUrl.js`).
- Zip layout, entry-name checks, limits, and Rule A names
  (`src/internal/projectImportPlan.js`).
- The import sequence, progress stages and cleanup
  (`src/deps/services/shared/projectImportService.js`), written once and driven
  through a small per-platform host in `src/deps/clients/<platform>/projectImportHost.js`.
- Folder naming on desktop, and which error to show.

Findings from the review that were not fixed in the first release are listed in
`docs/project-import-followups.md`.

## Implementation map

- UI flow: `src/pages/projects/` (progress dialog updates in `support/projectImportFlows.js`,
  status text in `src/internal/projectImportProgress.js`)
- Rules: `src/internal/projectImportUrl.js` (URL checks, Google Drive links),
  `src/internal/projectImportPlan.js` (zip layout, entry names, Rule A, limits),
  `src/internal/projectImportFolderName.js` (desktop folder names),
  `src/internal/projectImportErrors.js`
- Sequence and cleanup: `src/deps/services/shared/projectImportService.js`
- Platform hosts (thin mappings onto the native operations):
  `src/deps/clients/tauri/projectImportHost.js`,
  `src/deps/clients/mobileProjectImportHost.js` with the Android and iOS wrappers in
  `src/deps/clients/{android,ios}/projectImportHost.js`
- Progress listeners: `src/deps/clients/projectImportProgress.js`
- Desktop native: `src-tauri/src/project_import.rs` (`download_file`, `list_archive`,
  `extract_archive`)
- Android native: `ImportStaging`, `ImportDownloader`, `ImportArchive`, `ImportProject`
  and `ImportProgress` in `android/routevn/app/src/main/java/com/routevn/creator/`, with the
  bridge methods in `MainActivity.java`
- iOS native: `ImportStaging.swift`, `ImportDownloader.swift`, `ImportArchive.swift`
  (ZIPFoundation) and the bridge methods in `RouteVNApp.swift`
