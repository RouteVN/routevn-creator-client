# Android Project Backup Design

Status: implemented; automated validation passes. Physical-device storage and uninstall/reinstall verification remains required before release.

This document describes how Android project backups work. Working storage and
Android system backup rules are documented in [Android development](android.md).

## Purpose And Scope

Android currently stores working projects in app-private storage. Uninstalling
the app or clearing its data removes those projects. Keep that working storage
for SQLite, and automatically copy projects to a user-selected local backup
folder outside app-specific storage.

This is disaster recovery, not real-time synchronization or a replacement for
ordinary editor autosave. Backups are incremental for assets and inexpensive
when nothing has changed, so they can run soon after every editing session.

Decisions:

- Keep the normal project folder format: `project.db`, `files/`, and
  `file-metadata/`. Users can re-import a completed backup as an ordinary project.
- Copy the whole database for each backup. It is expected to be a few MB; do not
  introduce database deltas or a custom archive format.
- Write the new database first, then use renames for publication and recovery.
- Store backup timestamps and other metadata in `backup.json`.
- Back up a changed project 30 seconds after edits stop, and at least every
  3 minutes while editing continues. Finish due work in a foreground service
  when the app leaves the screen.
- Native code owns scheduling and copying. Backups never hold up the splash
  screen, startup, setup, or navigation.
- Reserve 1 GB of free space after accounting for backup space requirements.
- Reuse the iOS folder-setup UI with Android backup wording and a skip flow.
- Show a card at the bottom of Projects when backups are not configured, the
  first backup is pending, or backup needs attention.

A backup on the same device protects against app uninstall and app-data
clearing. It does not protect against device loss, factory reset, storage
failure, or the user deleting the backup folder. Recovery reaches the latest
completed backup. The 30-second and 3-minute delays are scheduling targets, not a
guaranteed maximum data-loss window: copying, process death, failures, and
unavailable storage can extend it.

## Backup Folder Selection

Ask the user to choose a folder once through Android's system directory picker
(`ACTION_OPEN_DOCUMENT_TREE`). Persist the granted read/write URI permission so
later backups do not prompt again. When the selected location is the volume's
top-level `Documents` folder, create/use `Documents/RouteVN Backups`. Use every
other selected folder directly, including an existing `RouteVN Backups` folder.
Persist the selected parent grant separately from the actual backup directory.
When the user reconnects the same destination through a different tree grant,
keep successful snapshot counters and resolve project folders through the new
grant; never keep using a revoked grant embedded in an old URI.
Existing configurations keep their current destination until explicitly changed.
On first-time setup, request Documents as the initial picker location using
`DocumentsContract.EXTRA_INITIAL_URI` on Android 8+. The system picker may fall
back to its default location if unavailable. Changing an existing backup folder
and other folder pickers retain their normal initial location. This hint does
not create a folder or grant access; create the subfolder only after the user
chooses and confirms a location through the picker.

Before Android 10 the picker hides internal storage unless
`android.content.extra.SHOW_ADVANCED` is set, and an initial location that does
not exist opens Recent, where no folder can be chosen. Always set the extra, and
start at the storage root while `Documents` does not exist yet. On those
versions the storage provider also lists `Documents` as a root of its own, so
choosing it there gives `home:` document ids. Treat them as the primary volume's
`Documents` folder: create `RouteVN Backups` inside it and show its full path.

Android documents that files outside app-specific storage selected through the
[Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files)
remain after uninstall. Folder grants can be persisted across device restarts.
After reinstall, ask the user to select the existing folder again for recovery.

Validate the selected destination's access and required operations. Cancellation
or failed selection preserves the previous configuration. Losing access pauses
backup and requests reconnection; do not silently choose another destination.
Do not use an app-owned directory as the backup destination.

A removed SD card or USB drive counts as lost access. Android rejects every
document below the chosen folder with an `IllegalArgumentException` instead of a
missing-file error, so a failure with no clearer cause is reported as
`reconnect` when the backup folder itself cannot be reached. Removing a card
while a file on it is open stops the app's process; the last backup stays
intact, and the next pass after the card is back finishes the copy.

Before saving the selection, use disposable probe files to check create, write,
read, rename, and delete behavior, and establish usable free-space measurement.
Do not modify existing project files for these checks. Explain unsupported
destinations immediately. Low space is a recoverable paused state, not proof
that a folder is unsupported.

Android 9's storage provider renames a document, then looks it up under its old
name and throws `FileNotFoundException`. Accept such a rename only when the old
document is gone, the new one exists, and the new name was free before the
rename, so another file that already had the name is never taken for it; a taken
name is a name conflict.

If the actual backup destination contains existing files, confirm with
**Folder is not empty** and **Use this folder for backups? Existing files will be kept.**
Use **Use this folder** as the confirm action. Keep recovery instructions in the
docs rather than this confirmation. Never treat a fresh installation's empty project list as a reason
to delete existing backups. Reuse ordinary project-folder import for recovery;
no bulk-restore wizard or automatic merge is required. The current Android import
creates a new project identity, so the imported project receives a new backup
folder rather than automatically overwriting its source backup.
Ignore unrelated files in the selected parent when deciding whether this
confirmation is needed. A file named `RouteVN Backups` is a conflict; preserve it
and the previous configuration.

Changing to a different destination queues a fresh initial pass for all projects.
Do not reuse the old destination's success counters. Leave the old folder intact.

The first version targets local folders. Cloud-provider support is deferred.
Android 10+ can create owned Downloads entries through MediaStore without a
picker, but that is not the chosen design. One selected folder fits the existing
import/export workflow and older supported Android versions. No broad
`MANAGE_EXTERNAL_STORAGE` permission is required.

## Setup And Projects UI

### Setup Screen

The setup screen is the `src/pages/projectFolderSetup/` page, which only
Android uses; iOS chooses its projects folder from dialogs (see
[iOS setup](ios.md#project-folder-setup-and-storage)).
Android continues editing internal projects; the selected folder is only the
backup destination. Do not change iOS storage behavior.

Copy:

- Title: **Setup backup folder**
- Description: **Set up backups to keep your project files if you uninstall the app.**
- Folder note: **If you select Documents, we’ll create a RouteVN Backups folder.**
- Primary action: **Choose backup folder**
- Secondary action: **Skip for now**

Open setup only explicitly from the Projects card or settings; Android startup
goes directly to Projects with no first-run setup redirect and does not wait for
backup status; the backup card stays hidden until status loads. The footer
card's warning state is the persistent setup prompt, so no onboarding choice is
persisted: skipping returns to where setup was opened and records nothing. Native folder grants, backup scheduling metadata, and publication
checkpoints keep their existing storage. Skipping must leave ordinary project
creation and editing available.

Reuse iOS's presentation, not its requirement for available external working
storage. Backup failure or lost access must never block Android startup, project
discovery, or editing. After a valid selection, allow Continue immediately;
initial copying runs independently and reports progress on Projects.

**Skip for now** applies when backups are unconfigured. When changing or
reconnecting a configured folder, Back/close preserves the existing configuration
and must not disable backups.

### Skip Confirmation

Clicking **Skip for now** opens a warning dialog:

- Title: **Continue without backups?**
- Message: **If you uninstall the app or clear its data, ALL PROJECTS stored in
  the app will be permanently deleted. Without a backup or exported copy, they
  cannot be recovered.**
- Destructive action: **Continue without backups**

Emphasize **ALL PROJECTS**. Closing the dialog returns to setup; confirming
returns to where setup was opened. Use the dialog close affordance rather than
adding a redundant Cancel button.

### Projects Card

Place the card in the bottom footer, immediately above the RouteVN Creator
version text. Keep it separate from the project list so it does not interrupt
browsing projects. Show it even when there are no projects, and preserve the
project list's existing scroll spacer. The card stays hidden until native status
arrives; status is answered from memory, so this takes no disk work.

When backup is not configured:

- Yellow warning icon beside the title: **No backup set up**
- Description: **Uninstalling the app or clearing its data will delete all projects.**
- Action: **Set up backup folder**

Keep the card visible after skipping. Once configured, the card shows one state:

| State           | Icon and title                            | Text                                                                                                                            | Actions                                                                                    |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Needs attention | Amber warning, **Backups need attention** | The error message; for a project-specific error, the project name above it                                                      | **Choose folder again** for folder problems; otherwise **Try again** and **Change folder** |
| Backing up      | Upload icon, **Backing up…**              | **Backing up Project One…** and **Copying files: 12 of 80** while media is copied                                               | **Change folder**                                                                          |
| Backed up       | Green check, **Local backups**            | **Last backup: 5 min. ago** (the newest backup of any project), plus **Some projects are not backed up yet.** when one has none | **Change folder**                                                                          |
| No backup yet   | Green check, **Local backups**            | **Not backed up yet. The first backup starts shortly.**                                                                         | **Change folder**                                                                          |

Before media copying starts, **Backing up…** reads **Checking projects for
changes…**. Relative times refresh every 30 seconds. Keep failures to one
summary message in this fixed footer; never expand a list of every project's
errors here. A folder problem is shown first, since it stops every project, then
low space, then any other error. Project-specific details stay in Config, so many
failures cannot crowd out the project browser or folder action. Show the root
backup folder on one line using the last two path segments; Config uses the
selected project's backup subfolder instead. An empty library can finish setup
without manufacturing an empty project backup.

Short waits clear up by themselves within seconds and are not shown until they
keep coming back (six failures in a row): a project being saved or exported
(`busy`), media deleted mid-copy (`changed`), and an interrupted copy
(`interrupted`). Errors saved by an earlier run of the app are shown on the card
until the next backup of that project succeeds.

### Problem Dialogs

The app shows a dialog the first time after the page loads (normally once per
launch, and again after Android restarts a lost WebView renderer) that backups
need the user: a folder problem (`reconnect`, `unknownSpace`, `localFolder`,
`appFolder`, `nameConflict`, `invalidBackup`) or low space after one failure,
and any other error after three failures in a row. `projectDamaged` means the
project's own database failed its check; it offers **Try again**, never a new
folder, and the last backup is never replaced by the damaged copy. Short waits and errors saved
by an earlier run never open one, so a stale error cannot interrupt startup
before the folder has been checked again. The dialog waits until no other global
dialog is open, and only one waits at a time. When it opens it shows the problem
as it is then, or nothing if backups recovered meanwhile:

- Title: **Backups need attention**
- Message: the error message
- Actions: **Choose folder again** (opens folder setup) or **Try again** (asks
  for a backup now), and **Later**

The same problem is not raised again until it clears or a different problem
replaces it.

### Config Section

The Config page has an **Android local backups** section for the open project:
its backup folder, a status line, **Last backup: Sep 17, 2026, 14:30:05** or
**Last backup: Never**, and **Back up now**. The status line shows the project's
error, **Backing up…** with the file count while this project copies, or
**New changes are backed up shortly after you stop editing.** while changes wait.
A folder problem adds **Choose folder again**. **Back up now** is disabled while
a backup runs; if the request cannot reach native code, an alert reports
**Could not start the backup. Try again.** with the error details. **Try again**
in the problem dialog reports the same way. Without a configured folder the
section shows the uninstall warning and **Set up backup folder**. Use localized
catalog strings in the owning components/stores/handlers.

## Schedule And Change Detection

The configured **Backup folder is set** screen includes **Stop local backups**.
Require a destructive confirmation explaining that new changes will not be
backed up, uninstalling/clearing app data loses all in-app projects, and existing
backups remain but may be outdated. Canceling keeps backup enabled.
Stopping cancels a running copy at its next chunk, keeps the last completed
backup in the old folder, cancels scheduling, and durably forgets the destination
and per-project backup status. Keep project data, asset revision counters, existing backup files, and
shared URI grants intact. Projects and Config show **No backup set up** and
offer setup again.
A failed stop retains the configuration and reports an error. Only explicit
folder setup re-enables backups.

| Event                                         | Behavior                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| App start                                     | Nothing runs until the splash screen hides, then a full check five seconds later.                                               |
| Project database write                        | Back up 30 seconds after the last write, and no later than 3 minutes after the first one.                                       |
| App leaves the screen                         | Pending changes are backed up 1.5 seconds later, in the foreground service (see below for when it starts).                      |
| Write while the app is hidden                 | Back up 2 seconds after the last write, such as an editor saving as the app goes away.                                          |
| App returns to the screen                     | Retry failed projects and lift a destination hold within 5 seconds, since the user may have freed space or reconnected storage. |
| Project creation/import                       | Back up 3 seconds later.                                                                                                        |
| Folder setup or change                        | Cancel any running copy and check every project in the new folder.                                                              |
| **Back up now** / **Try again**               | Check now, ignoring retry delays and holds.                                                                                     |
| While visible                                 | A full check every 30 minutes notices backup files deleted or damaged outside the app (see below).                              |
| Project busy, media changed, copy interrupted | Retry every 3 seconds, five times, then back off like other failures.                                                           |
| Other failures                                | Keep pending; retry after 15 s, 30 s, 1 min, 2 min, then every 5 min.                                                           |
| Destination failure                           | Also hold every other project for the same back-off, since they would fail the same way.                                        |

Every wake of the scheduler applies the same rules, including the wake that ends
the leave grace below: it never starts a pass before the app is ready, before the
startup delay, or during a hold.

`BackupScheduler` is a single process-wide scheduler with its own thread. It
outlives the activity, runs one pass at a time, and coalesces triggers: a pass
backs up every due project in turn, stages all of them first so editing pauses
only briefly, then copies media and publishes each. A write during a pass marks
the project changed again for the next pass; the running copy is not restarted.

The bridge notes a change on every statement except `BEGIN` and `PRAGMA` by
setting a flag; the scheduler thread reads it, so the bridge thread never waits
for backup work. Whether a project really changed is decided by its revision
counter (below), so extra notes only cost a cheap check.

The page never prepares or runs backups. Editors save on their own schedule, and
also when the app goes to the background; those writes start the hidden-app
backup above. The bridge thread that owns the project databases is borrowed only
for the short snapshot steps, and the scheduler thread never holds a lock that
the bridge thread waits for.

The page saves what editors hold in memory only after it hears that the app
left, so the last edits usually reach the database just after `onPause`.
Android 12 and later allow starting a foreground service only while the
activity is still visible, so the scheduler starts `BackupService`, a `dataSync`
foreground service, on every pause while backups are set up. It keeps the
service for 6 seconds (`LEAVE_GRACE_MS`) for that save and for as long as a
backup runs or is due within 10 seconds, then stops it. A service that ends
within the grace shows no notification. Android 8 to 11 show the notification
at once but allow later starts, so there the scheduler starts the service on
pause only when a backup runs or is due, and otherwise when a write while
hidden makes one due. The silent, low-importance notification reads **Backing up
projects** in the **Project backups** channel, both localized by the page at
startup. The app does not request the notification permission, so on Android 13
and later the notification stays out of the notification shade; the service
still runs, and Android lists it among the active apps. If Android refuses to
start the service, the backup still runs while the process lives.

Returning to the app and leaving again can happen while a long copy runs. The
leave records its grace on the calling thread, and a return that waited behind
the copy is dropped once a newer leave has happened, so neither can stop the
service that leave started; Android 12+ could not start it again. The scheduler
decides to stop on its own thread and the stop runs later on the main thread, so
`BackupService` stops itself with `stopSelfResult` for the last start it saw:
Android refuses the stop when a newer start is on its way.
Android 15 limits how long a data sync service may run each day; on timeout the
service stops and the backup continues while the process lives, finishing on the
next launch otherwise.

One project's failure must not block the other projects. Record its error and
continue the pass. A destination failure stops the pass and holds the rest, since
every project would fail the same way. Insufficient space for a large project can
still allow a smaller project to back up while preserving the reserve. Space is
re-evaluated for each project.

Before trusting matching counters, cheaply check access and the existence of the
mapped project folder, `project.db`, `files/`, and required backup metadata.
Missing entries invalidate that project's successful baseline. Lost access
pauses backup rather than creating a replacement directory elsewhere. For a
project that looks up to date, also list `files/` and `file-metadata/` and
compare `project.db` with its published size (see Interrupted Backup And
Import). These checks do not hash unchanged databases or media.

Maintain a persistent change counter per project and the counter captured by the
last successful backup for the configured destination. Advance the change
counter for durable changes to project data, project information, asset content,
or asset metadata. This includes persisted local drafts, not only committed
collaboration events. Opening a project, selection changes, and backup bookkeeping
must not themselves mark the project changed.

The counter must not miss a successful data write if the app dies before dirty
tracking is updated. Update it in the same transaction as database changes where
possible. For filesystem changes, persist the dirty indication before starting
the mutation and coordinate completion with the snapshot write gate. An extra
backup after a failed mutation is acceptable; a missed successful write is not.
Read-only unchanged checks must remain cheap.

Capture the counter corresponding to the staged snapshot. Only mark that counter
backed up after successful publication. Changes during copying remain pending
for the next pass; the current copy is not cancelled and restarted. Failed or
skipped backups never advance the successful counter or timestamp.

Counters are local bookkeeping, not globally comparable project revisions.
After restore, folder change, or reinstallation, reconcile identity and establish
a fresh baseline; do not assume equal numbers from different installations mean
equal content.

There is no WorkManager job. Backups run while the app is on screen and, for
work that is due when it leaves, in the foreground service. Changes made just
before the process is killed are backed up on the next launch.

## Backup Contents And Metadata

Each project has a separate directory under the selected backup folder:

```text
RouteVN Backups/
  <Project Name>-<projectId>/
    project.db
    files/
      <fileId>
    file-metadata/
      <fileId>.mime
    backup.json
```

Folders are labeled with the sanitized project name plus the project id at
first backup (`Project-<projectId>` when the name is empty); the id suffix
keeps same-named projects distinct. Each backup finds the project's folder in
the destination by its `-<projectId>` suffix and creates `<label>-<projectId>`
only when none exists; no per-project folder mapping is stored. Labels are
creation-time snapshots: project renames keep the original folder, and Settings
keeps showing live names and last snapshot times. Stopping and re-enabling,
switching destinations back, and `Project-<projectId>` folders from earlier
versions all resolve to the same folder. A folder with the project's id suffix
is used even when another installation wrote it, such as after a device
transfer; publication keeps the previous database as `project.db.previous` and
never replaces a database that belongs to a different project. When several
folders share the id suffix, the one whose `backup.json` or `project.db` changed
most recently is used (ties go to the first name) and the others are left
untouched. Stopping or switching destinations clears successful checkpoints,
so the next backup publishes and verifies a fresh baseline before Settings
reports it.

Preserve the complete project database, including project-owned app records and
local drafts, plus asset bytes and MIME sidecars. Do not back up the global
`app.db`, authentication credentials, picker caches, or unrelated private files.
Rebuild project listing entries through import/discovery on recovery.

`backup.json` should include:

- `formatVersion`: version of the backup metadata/protocol.
- `projectId`: canonical project identity.
- `changeCounter`: captured `databaseRevision:assetRevision` string.
- `snapshotAt`: UTC ISO 8601 time of the captured project state.
- `completedAt`: UTC ISO 8601 time when publication successfully completed.
- `databaseBytes`: staged database size.
- `databaseSha256`: hash identifying the published database bytes.

The snapshot time describes the protected work; the completion time describes
the operation. Write JSON through `backup.json.next`, close and verify it, then
replace `backup.json`. Database and JSON replacement cannot be one transaction.
Missing, invalid, or nonmatching JSON means unknown backup status and a pending
retry, not automatic rejection of an otherwise valid project on import. Only
trust its times/counter when it describes the selected database. No additional
recovery journal or per-version manifest is required for the first version.

## Database Snapshot And Publication

### Create A Consistent Internal Snapshot

Never copy a live `project.db` without coordinating SQLite: committed changes may
still be in its WAL. The staged database must be self-contained and must not
require the working project's `-wal` or `-shm` files.

Each project is snapshotted by `MainActivity.snapshotProjectForBackup`, run on the
bridge thread that owns the project databases:

1. Refuse with `busy` while the project has an open transaction, an unfinished
   export, or an asset write session; the scheduler retries in 3 seconds.
2. Run `PRAGMA wal_checkpoint(TRUNCATE)` and check its result; merely issuing the
   PRAGMA is not sufficient.
3. Read the revision counter, close the connection, and copy `project.db` to the
   project's private staging folder (`project-backup-staging/<projectId>/`).
4. List the project's `files/` and `file-metadata/` entries, skipping unfinished
   `.routevn-project-write-*` files.
5. Reopen the database only if it was open before.

Editing pauses only for these steps; media is not copied while the bridge thread
waits. Asset IDs are never reused and asset files are never rewritten, so the
listed files are copied later straight from the live project folder. If one was
deleted since the snapshot, the copy stops with `changed` and the next pass,
3 seconds later, takes a new snapshot. A failed snapshot always reopens the
database it closed. Every reopen reapplies the synchronous mode the page set for
that database, so saves keep `synchronous=FULL` after a snapshot.

Cancellation (stopping backups or changing folder) sets a flag that copy and
hash loops check at every chunk, so a pass stops promptly without waiting on a
lock. A pass cancelled before it has marked the changed projects pending puts
those changes back for the next pass. When the activity goes away, a pass keeps
publishing the snapshots it already staged; new snapshots wait for the next
activity. The last completed backup stays intact, and
media already copied and verified is kept for the next pass. Staging is removed
after each project and stale staging from an ended process is removed when the
scheduler starts.

SQLite's [Online Backup API](https://sqlite.org/backup.html) is an alternative for
consistent live snapshots. [VACUUM INTO](https://sqlite.org/lang_vacuum.html) also
produces a snapshot, but cannot be assumed across the current Android minimum
SDK 24: it was introduced in [SQLite 3.27](https://sqlite.org/releaselog/3_27_0.html),
and supported older Android versions ship earlier
[SQLite versions](https://developer.android.com/reference/android/database/sqlite/package-summary).
Do not broaden the arbitrary-SQL bridge to implement backup; use explicit native
backup operations.

### Publish With Renames

Temporary database names are `project.db.next` and `project.db.previous`.

1. Copy and verify missing assets and metadata required by the snapshot.
2. Validate staged SQLite integrity and project identity. Write and close
   `project.db.next`, then read it back and compare its size and SHA-256 against
   the staged database before touching the last good backup.
3. Preserve the last good database by renaming `project.db` to
   `project.db.previous` (skip this on the first backup).
4. Rename `project.db.next` to `project.db`.
5. Verify the published database and publish its `backup.json` metadata.
6. Record success internally, remove leftover `.next` files, and retain one
   `project.db.previous` between backup attempts.

Keep the previous database until the replacement is verified. Retain at most one
previous database for recovery, rather than accumulating snapshot history. Before
replacing an older `previous`, establish that the current database is valid and
any earlier interrupted operation has been recovered.

If `project.db` cannot be read as this project's database and no valid
`project.db.previous` can replace it, rename it to `project.db.damaged` and
publish the new verified copy. A damaged copy must never stop later backups.
Only the newest damaged copy is kept, and restore never reads it. A
`project.db` that names another project is never replaced; that backup fails
with `invalidBackup`.

This avoids a second full copy of the old database. It is recoverable replacement,
not a guaranteed atomic swap: Android's
[document rename contract](<https://developer.android.com/reference/android/provider/DocumentsProvider#renameDocument(java.lang.String,%20java.lang.String)>)
allows providers to change names to avoid conflicts. Check returned URIs and actual
names, and stop safely if the provider cannot meet the required naming behavior.

### Interrupted Backup And Import

Use a small, deterministic recovery rule:

1. Prefer `project.db` if database integrity, identity, and project import
   validation succeed.
2. Otherwise try `project.db.previous` with the same checks.
3. Never automatically promote `project.db.next`. It belongs to an unfinished
   attempt, even if it opens successfully as SQLite.
4. If neither candidate is valid, report that no usable backup was found and
   leave the files intact. An interrupted first backup may have no usable copy.

New assets are verified before canonical database publication, and existing
assets are not overwritten or removed. This ordering protects both database
candidates against interrupted backup writes without a new snapshot format.
The existing importer rejects an absent `files/` directory and unreadable
entries. It does not reconcile every database reference against the asset
directory. Backups themselves copy assets before publishing their database.

Every check, including the full checks at startup and every 30 minutes, also
inspects backups that look up to date. A backup counts as complete only when
its `files/` and `file-metadata/` folders hold every media file the project
has, and its `project.db` has the size recorded when it was published. A
missing file or a size change makes the project pending, and the next backup
copies the missing files and a fresh database. Media files present under their
own name are not re-hashed, so a damaged media file with a matching name is not
detected.

Import is read-only against the backup source: copy the chosen candidate to
private import staging as `project.db`, validate there, and use normal import
identity handling. Do not rename/delete the user's only recovery copy to make it
importable. A completed folder remains an ordinary import; extra backup files
are ignored. Destination repair before the next automatic backup is separate
and must preserve a validated candidate throughout.

## Asset Copying And Size

Copy only missing assets and metadata; do not recopy unchanged media each time.
Project media are flat files; a folder inside `files/` or `file-metadata/`
(possible after importing a project) is skipped rather than failing the backup.
Stream bytes natively with bounded buffers rather than moving the entire project
through JavaScript/base64. Each asset is written as `<name>.next`, hashed while it
streams, read back once to compare the hash, then renamed into place, so a failed
copy is never mistaken for a complete asset. Each verified asset stays, so a pass
that stops after 40 of 80 files resumes with the remaining 40.

Each destination folder is listed once per publication and the listing is kept
up to date as files are created, instead of querying the provider for every
asset; providers answer such queries slowly. Free space is probed once per
publication.

Asset writes now reject an existing file ID or MIME sidecar at both session
creation and completion. The existing upload/import workflows generate fresh
IDs for changed content; full-project import receives a new project directory.
The asset change counter is committed before publication or deletion. Reusing a
deleted ID is outside the storage contract. No asset-version store is added.
Previously copied media is not rehashed on each pass; external modification of
backup assets remains outside the guarantee.

For the first version, retain extra backup assets and defer automatic asset
cleanup. Both the current and previous database may need them. This trades some
storage growth for simpler recovery; the space reserve stops further copying
before storage is exhausted. Any later cleanup must prove that files are unused
by every retained recovery state. Do not delete a project's backup merely because
its internal project is deleted.

## Free-Space Policy

Require enough available space for the backup's peak additional allocation plus
a 1 GB reserve. For implementation, use 1,000,000,000 bytes for the displayed
1 GB reserve.

```text
required free space = peak additional backup bytes + 1 GB
```

Count missing assets, the incoming database, metadata, and temporary staging
allocations. Existing files already occupy space and should not be counted again;
renames do not create another full database copy. Do not rely on future cleanup
to satisfy the preflight check.

Check internal staging storage and the actual destination volume. If both use
the same underlying storage, account for their combined peak allocation without
double-counting the reserve. When that relationship cannot be determined, use a
conservative estimate. Recheck capacity during large transfers where practical,
and handle write failures because free space can change after preflight.

Perform space estimation only for due, changed projects. Insufficient space
skips backup without altering the previous successful backup or clearing pending
changes. The project retries on the back-off schedule above, and within 5 seconds
when the app returns to the screen.

Android providers may return unknown space through the optional
[`COLUMN_AVAILABLE_BYTES`](https://developer.android.com/reference/android/provider/DocumentsContract.Root#COLUMN_AVAILABLE_BYTES).
If available space cannot be verified for the selected destination, pause
automatic backup and explain that limitation; do not silently bypass the reserve
or treat unknown capacity as zero. Validate the available native measurement
approach for supported local providers during implementation.

Warning copy:

> **Backups need attention.** Backup paused. Free up space on your device or
> backup storage. At least 1 GB must remain free after the backup.

Use **Last backup: Never** when appropriate. Show a dialog once on entering the
failure state (see [Problem Dialogs](#problem-dialogs)), and keep status visible
in Projects and Config. Clear the warning after a successful retry. Unknown
capacity and lost permission have their own messages rather than an inaccurate
low-space message.

## Implementation Boundaries And Validation

Reuse the existing Android document picker, native file operations, database
validation, and project import/export where their contracts fit. Current export
behavior is a starting point, not proof that concurrent automatic backup is safe.

Keep setup/Projects handlers orchestration-focused behind `appService`. Android
adapters belong in `src/deps/services/android/` and `src/deps/clients/android/`;
scheduling, native SQLite, filesystem, space checks, and document operations
belong in the Android shell. The page keeps no backup timers. Keep installation-specific backup settings
out of portable project semantics and avoid changing the working database merely
to record backup completion.

Before shipping, validate:

- Setup reuse, picker cancellation, confirmed skip, and Projects card
  placement/status in the UI; add VT coverage where practical.
- No changed data means no snapshots or asset scans; changes to every durable
  project data category mark pending reliably across restart.
- The 30-second and 3-minute delays, backing up after leaving the app, startup
  never waiting for backups, sequential execution, manual backup, and edits
  during copying without losing pending changes; one broken project must not
  starve the rest of the pass.
- Successful import of the ordinary backup folder after uninstall/reinstall on
  a disposable test project; restore without depending on the lost global DB.
- WAL snapshot correctness and asset consistency during concurrent editing,
  import, asset replacement, and deletion; editing resumes after any snapshot
  failure, and same-ID asset conflicts never damage the previous backup.
- Interruption during each asset, database rename, and JSON publication step,
  including the first backup and subsequent backups with an existing `previous`.
- Low space before and during backup; unknown capacity; shared versus separate
  staging/destination volumes; warning deduplication and successful retry.
- Permission revocation, moved/deleted folders, unavailable removable storage,
  project-name collisions, and selecting a folder with pre-existing backups;
  deleted canonical backup files are noticed even without local edits.
- Folder change triggers a fresh pass and preserves the old folder. Import,
  including fallback to `previous`, leaves the source backup unchanged.
- Bounded memory and acceptable editing latency for a few-MB database and a
  large media library on supported physical Android devices.

Cloud backup, multiple-device synchronization, frequent version history,
MediaStore-based automatic destination selection, and scheduled background jobs
are outside this version. Android system device-transfer rules remain
separate; see [Backup and device transfer](android.md#backup-and-device-transfer).

## Implementation And Test Map

- `BackupScheduler.java` decides when to back up, runs passes on its own thread,
  keeps per-project status in memory, and pushes it to the page through
  `window.routeVNBackupStatusChanged`. `getBackupStatus` answers from memory.
- `ProjectBackup.java` owns SAF publication, capacity checks, metadata, persistent
  counters, and recovery. SQL triggers update a private revision table in the
  same transaction as project database writes, including drafts and app state.
  Backup completion changes only private preferences, not the project database.
- `BackupService.java` is the `dataSync` foreground service that keeps the
  process alive after the app leaves the screen.
- `MainActivity.java` exposes `getBackupStatus`, `configureBackup`,
  `disableBackup`, `requestBackup`, and `setBackupNotificationCopy`, notes
  database writes, and takes snapshots on the bridge thread.
- `src/deps/services/android/backupService.js` mirrors native status for the UI,
  forwards requests, and raises problem dialogs. It never waits for backup work.
  `src/internal/backupStatus.js` decides which error to show and which deserves
  a dialog.
- Only Android's local external-storage DocumentsProvider is accepted. A small
  disposable file tests IO and rename behavior; `fstatvfs` measures the actual
  destination. Primary emulated storage and internal staging share one capacity
  budget despite their different FUSE device IDs. Preflight includes missing
  assets, the incoming database, staging, validation copies, and metadata.
- The reused folder setup and `android-backup-status` component provide the
  setup, skip warnings, Projects card and Config section in every app language.
  Existing backups are explained before the folder is accepted; recovery uses
  the ordinary Open Project action.

Automated validation:

```bash
bunx vitest run tests/android tests/ios/projectFolderSetup.test.js --exclude '**/.artifacts/**'
cd android/routevn
./gradlew :app:testDebugUnitTest
```

The JVM tests use Robolectric with real SQLite and a file-backed SAF fixture.
`BackupSchedulerTest` drives the scheduler with a fake clock: nothing runs before
the app is ready, the quiet period and maximum wait, short retries for a busy
project, back-off and manual retry, backing up after leaving the app in the
foreground service, the leave grace on Android 12+ and on-demand starts on
older versions, returning and leaving again during a copy, no pass at the end of
the grace before the app is ready or during a hold, a removed SD card reported
as `reconnect` and recovered once it is back, cancelling a copy when the folder
changes, keeping changes when a pass is cancelled early, and copy progress. `BackupServiceTest` checks that a stop names the last start. `BackupPublicationTest` and
`ProjectBackupTest` cover Android 9's renames that throw after renaming, its
`home:` Documents root, transactional counters, validation, space guards,
publication failures before/after renames, metadata failures, retry, stale
metadata, read-only import fallback to `previous` while refusing `next`,
cancellation during media copying and hashing, media deleted after the snapshot,
resuming a partly copied pass, and listing each destination folder once instead
of once per asset. Capacity syscalls are simulated in this fixture; these tests
do not establish real provider durability. Folder lookup covers re-enabling and
switching back, interrupted first backups, re-verifying a reused folder, earlier
`Project-<projectId>` folders, choosing the newest of duplicate id suffixes,
never replacing another project's database, setting a damaged database aside,
and recopying media or a database deleted or changed in an unchanged backup.

After `bun run build:android`, serve `_site` locally and run
`ANDROID_TEST_ORIGIN=http://127.0.0.1:3017 node tests/android/backupSetup.browser.mjs`.
This exercises the packaged UI with a fixture native bridge, including picker
cancellation, closing/confirming skip, low-space warnings, **Try again**,
and Settings. It does not exercise Android's real picker or URI grants;
`FolderPickerIntentTest` checks the picker's start folder before Android 10.

Checked on a Samsung tablet running Android 16: a line typed just before
pressing Home is backed up within seconds; a 1.5 GB backup finishes with the
app in the background and the screen off; killing the process during a 4 GB
copy leaves the last backup intact, and the next launch finishes it; and after
uninstalling and reinstalling, importing the backup folder restores every
database row and media file.

Checked on a vivo X100 phone running Android 16, with a separate test app and
folder: setup through the picker; an edit is backed up about 35 seconds later
with the app open, and about 3 seconds after pressing Home or after a save that
lands after leaving; leaving with nothing due runs no backup and the service
stops after the grace; no notification is left, and both databases pass an
integrity check.

Checked on emulators:

- Android 15 with a 4 GB virtual SD card: a backup to the card's Documents
  folder copies 2.8 GB of media byte for byte. Removing the card mid-copy stops
  the app and leaves the last backup untouched; the next launch reports
  `reconnect`, and the backup finishes about 5 seconds after returning to the
  app with the card back.
- Android 16 with a 512 MB virtual SD card: backups pause with `lowSpace`.
- Android 11, with its WebView updated to 124: leaving with nothing due starts
  no service, and an edit saved just before or just after pressing Home is
  backed up within 3 seconds.
- Android 9, with its WebView updated to 131: the picker shows internal storage
  and opens in `Documents` once it exists; choosing `Documents` creates
  `RouteVN Backups` and backs up there. An edit is backed up 30 seconds later in
  the app, and right after Home or after a save that lands after leaving; the
  notification goes when the service stops, leaving with nothing due starts no
  service, and both databases pass an integrity check.
- Android 8.1, with its WebView updated to 131: with no `Documents` folder the
  picker opens at the storage root; the same checks pass with `Download` chosen,
  and renames work there without the Android 9 fallback. The Android 8.0
  emulator image ships no usable WebView, so 8.0 itself was not run.

Still pending: renamed folders on a card, physical Android 7 to 12 devices,
manufacturers other than Samsung and vivo, a long background backup with the
screen off on a vivo, and the snapshot pause on large real projects. Use disposable projects; never
uninstall a user's working app to run a test.
