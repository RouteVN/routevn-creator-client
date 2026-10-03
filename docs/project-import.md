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

Every import renames the files directly inside `files/` so the on-disk name
equals the file id. Desktop folder import renames inside the folder the user
picked, so it changes that folder. Android and iOS rename only the app-private
copy; the user's source folder is never modified. Source comments refer to this
rule, the zip rules, and the URL rules as Rule A, Rule B, and Rule C.

Desktop and iOS refuse a `files` folder that is itself a symlink, so a rename can
never reach outside the project folder. Symlinks and directories inside `files/` are
never renamed, but they still occupy their name: `abc.png` next to a link called `abc`
fails with `fileNameConflict` instead of replacing the link.

- The file id is the name up to, but not including, the first `.`. Names with no
  `.` are unchanged.
- Names that start with `.` (`.DS_Store`, `._x`) and sub-directories are left
  alone.
- If the resulting id is not a valid file id, the import fails with
  `invalidFileName`.
- If two names map to the same id, compared case-insensitively, or the target
  name already exists as another file, the import fails with `fileNameConflict`
  before anything is renamed. If a rename fails partway, the renames already
  applied are rolled back on a best-effort basis.
- `file-metadata/` is never touched.

| Name                  | Result             |
| --------------------- | ------------------ |
| `abc.png`             | `abc`              |
| `a_b-1.tar.gz`        | `a_b-1`            |
| `abc.png` + `abc.jpg` | `fileNameConflict` |
| `abc` + `abc.png`     | `fileNameConflict` |
| `a b.png`             | `invalidFileName`  |

## Zip layout and safety (Rule B)

A zip is accepted when its root, or its single top-level folder, contains
`project.db`. `__MACOSX/` and dot-entries are ignored. A missing `files/` is
treated as empty. Only `project.db` and its sidecars, `files/<name>` and
`file-metadata/<name>` are extracted; everything else is skipped. An archive that
contains the incomplete-export marker, as a file or a directory, is rejected.

Archives are untrusted, so extraction checks the entry table before it writes
anything:

- Entry names containing a backslash, NUL, or `:`, and names with an empty, `.`,
  or `..` segment, are rejected as `unsafeArchiveEntry`. So are absolute paths and
  symlink or other special entries.
- Duplicate entries are rejected as `invalidArchive`, whether the raw names match
  or only the normalized, case-insensitive paths do, so one entry can never
  silently replace another.
- The entry count and central-directory size are read from the end-of-archive
  record and checked before the directory is parsed.
- Every extracted entry's CRC32 and byte count must match its header, otherwise
  `invalidArchive`.
- Desktop checks that `project.db` starts with the SQLite header before anything is
  promoted into the chosen folder, so a zip with a non-database `project.db` fails as
  `invalidArchive` and leaves no folder behind. Android and iOS read the project info
  from the database before they promote.
- Output files are created exclusively, so an existing file or a planted symlink is
  an error and is never written through.

Limits, enforced on the bytes actually written:

- 50,000 entries
- 64 MiB central directory
- 8 GiB uncompressed
- 4 GiB archive, whether downloaded or picked from the device

### Archives the importer rejects on purpose

The importer fails closed on layouts it cannot check completely. Each of these
reports `invalidArchive` or `unsafeArchiveEntry` with a localized message instead of
importing partially:

- entry names that start with `./` (for example Python `zipfile` with an explicit
  `./project.db` arcname) or contain a backslash (some older Windows zippers)
- archives with data in front of the first entry, such as self-extracting stubs
- archives with a central-directory digital signature record, or with the optional
  ZIP64 comment records that the `zip` crate writes after `set_zip64_comment`
- encrypted entries, and compression methods other than stored and deflate
- an archive that is not exactly one end-of-central-directory record with a central
  directory that ends where it starts

Re-zipping the project folder with the system's normal "compress" command produces
an accepted archive. Rejection is always safe: nothing is written to app storage or
to the chosen folder.

Two rare cases are known and accepted. A cancelled desktop command cannot stop an
import that has already begun extracting, so the finished project can appear in the
chosen folder even though the app did not report it. A skipped entry such as
`__MACOSX/link` with unusual host metadata is ignored rather than rejected, and is
never extracted.

## URL download (Rule C)

The URL is assumed to be a zip. Only `https:` is accepted; `http:` is accepted
only for `localhost`, `127.0.0.1`, and `[::1]`. URLs with embedded credentials
are rejected. At most 5 redirects are followed, and every hop must pass the same
check. On desktop and Android, connections time out after 15 seconds and stalled
reads after 30 seconds. iOS has no separate connect timeout, so its single
30-second idle timeout covers both. There is no overall deadline. The archive streams to a temporary file and is
never held in memory. The server's `Content-Type` is not trusted; the file is
validated by parsing it as a zip.

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

On Android, the two import bridge calls opt out of the JavaScript bridge's default
30-minute response timeout, because a large archive on a slow connection can
legitimately take longer. The native side bounds the call itself with the connect and
stall timeouts.

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
| `finishing`   | Finishing up…                      | Indeterminate: Rule A renames, copy or rename into place, registration                            |

Native code reports `{ stage, current, total }`:

- The first event of a stage has `current` 0 and is sent as soon as the stage starts. Events
  inside a stage are throttled to one per 100 ms, and the last event of a stage is always
  sent (`current` equals `total` for `extracting`).
- `downloading` reports bytes written to the temporary archive; `total` is 0 when the server
  sends no length. `extracting` counts bytes actually written, chunk by chunk, so one large
  file advances smoothly. `finishing` has `current` and `total` 0.
- Progress is best effort. A failure to deliver an event never changes the import result.

Delivery per platform:

- Desktop: `download_project_archive` takes a Tauri `Channel` argument named `onProgress`.
  JavaScript adds its own `finishing` event after the command returns, for the Rule A rename
  and registration that happen in JavaScript.
- Android: the native side calls `window.__routeVNAndroidProjectImportProgress` with the
  event plus the `projectId` of the import call; JavaScript only accepts events for its own
  `projectId`.
- iOS: the native side calls `window.__routeVNIOSProjectImportProgress`. The iOS bridge does
  not receive a project id from JavaScript, so events are accepted without one, which is safe
  because only one archive import runs at a time.

The listener is registered for the duration of one import and removed when it settles, whether
it succeeds or fails. The status text lives in the `projectsPage` i18n catalogs
(`importConnectingStatus`, `importPreparingStatus`, `importDownloadingStatus`,
`importDownloadingUnknownStatus`, `importExtractingStatus`, `importFinishingStatus`).

## Temporary data

Temporary data is always deleted on success, failure, and cancellation.

| Platform | Archive                                                   | Extraction                                                                                 |
| -------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Desktop  | OS temp directory (`tempfile`)                            | Hidden `.routevn-import-<random>` folder inside the chosen parent, then renamed into place |
| Android  | `cacheDir/project-import/<projectId>.archive/archive.zip` | `cacheDir/project-import/<projectId>/`, then promoted into `files/projects/<projectId>`    |
| iOS      | `tmp/project-import/<uuid>/archive.zip`                   | `tmp/project-import/<uuid>/extracted`, then copied into app storage                        |

The archive is always kept outside the folder that is promoted, so it can never end
up inside a project. Android deletes it as soon as extraction finishes.

On desktop the extraction folder is created beside the destination so the final
rename stays on one volume. The extracted project folder is the imported project;
only the downloaded zip is deleted. The destination folder name comes from the
server's `Content-Disposition` filename, else the last URL path segment, else
`RouteVN Project`. Windows reserved device names are prefixed with `_`. If the name
is taken, ` 2`, ` 3`, and so on are tried, and the name is claimed atomically so an
existing folder is never overwritten or merged.

Android and iOS also remove stale `project-import` directories older than 24 hours
at the start of an import.

## Importing a project that already exists

| Platform | Importing the same project again                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Android  | Always a new project: every import gets a new random id, so nothing is overwritten.                                                            |
| Desktop  | Projects are registered by folder path. The same folder twice reports `projectExists`; the same project in another folder is a separate entry. |
| iOS      | The id inside `project.db` is the project's identity, whatever its folder is called. See below.                                                |

On iOS, a project is "in the library" when its folder has both `project.db` and `files/`.
Folder, zip and URL imports share one tail, which treats an id that is already in the
library like this:

- **Listed project:** nothing is copied, nothing is renamed, nothing is deleted and the
  list entry is not touched. The incoming source (the folder, the unzipped archive or the
  download) is ignored. The import ends with `projectExists`, and the user sees an alert
  titled "Project Already Added", not a success toast and not the failure alert. It says
  in one sentence that the project has already been added, so nothing was imported and the
  existing project was not changed. On iOS a second sentence says how to use the incoming
  copy instead: remove the existing project first, then import again. Desktop shows the
  alert without that sentence, because there the same folder was added twice and there is
  nothing to replace.
- **Hidden project:** a project that was removed from the list but is still on disk is
  restored by importing it again. The restored entry describes the library's own copy
  (its own name, description and icon), never the incoming one, and Rule A does not run.
- **Unfinished folder:** a folder with `project.db` but no `files/` is not a project the
  app lists. It is treated as an unfinished earlier import, removed, and replaced by the
  incoming copy in a new folder named after the project, so the result never keeps the
  leftover's name (older builds named imported folders after the id).

`projectExists` is raised in JavaScript, by the iOS registration and by the duplicate check
when a project entry is added twice, and is mapped like the native error codes.

## Errors

Native failures start their message with a stable code, then `: `, then a
technical detail. The client maps the code to a localized message and appends the
detail with `withErrorDetails`.

`invalidUrl`, `downloadFailed`, `archiveTooLarge`, `invalidArchive`,
`unsafeArchiveEntry`, `invalidFileName`, `fileNameConflict`, `projectExists`,
`importFailed`.

Two more codes are raised in JavaScript before or after the native call:
`unsupportedUrl` (for example a Drive folder link) and `googleDriveFailed` (see
Google Drive links above).

## Implementation map

- UI flow: `src/pages/projects/` (progress dialog updates in `support/projectImportFlows.js`,
  status text in `src/internal/projectImportProgress.js`)
- URL validation and Google Drive link rewriting: `src/internal/projectImportUrl.js`
- Progress listeners: `src/deps/clients/projectImportProgress.js` with the Android and iOS wrappers
- Desktop: `src-tauri/src/project_import.rs`
  (`download_project_archive`, `normalize_project_file_names`)
- Android: `importProjectArchive`, `importProjectArchiveFromUrl`,
  `openArchivePicker` in `MainActivity.java`
- iOS: the same bridge names in `RouteVNApp.swift`, with ZIPFoundation for
  extraction
