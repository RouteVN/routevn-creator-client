# Android Project Backup Design

Status: implemented; automated validation passes. Physical-device storage and uninstall/reinstall verification remains required before release.

This document records the Android backup decisions agreed on 2026-09-17.
The implementation follows the behavior below. Working storage and Android
system backup rules are documented in [Android development](android.md).

## Purpose And Scope

Android currently stores working projects in app-private storage. Uninstalling
the app or clearing its data removes those projects. Keep that working storage
for SQLite, and automatically copy projects to a user-selected local backup
folder outside app-specific storage.

This is disaster recovery, not real-time synchronization or a replacement for
ordinary editor autosave. Backups should be infrequent, incremental for assets,
and inexpensive when nothing has changed.

Decisions:

- Keep the normal project folder format: `project.db`, `files/`, and
  `file-metadata/`. Users can re-import a completed backup as an ordinary project.
- Copy the whole database for each backup. It is expected to be a few MB; do not
  introduce database deltas or a custom archive format.
- Write the new database first, then use renames for publication and recovery.
- Store backup timestamps and other metadata in `backup.json`.
- Check for changed projects every 10 minutes while the app is active.
- Reserve 1 GB of free space after accounting for backup space requirements.
- Reuse the iOS folder-setup UI with Android backup wording and a skip flow.
- Show a card at the bottom of Projects when backups are not configured, the
  first backup is pending, or backup needs attention.

A backup on the same device protects against app uninstall and app-data
clearing. It does not protect against device loss, factory reset, storage
failure, or the user deleting the backup folder. Recovery reaches the latest
completed backup. Ten minutes is a scheduling interval, not a guaranteed maximum
data-loss window: copying, suspension, failures, and unavailable storage can
extend it.

## Backup Folder Selection

Ask the user to choose a folder once through Android's system directory picker
(`ACTION_OPEN_DOCUMENT_TREE`). Persist the granted read/write URI permission so
later backups do not prompt again. When the selected location is the volume's
top-level `Documents` folder, create/use `Documents/RouteVN Backups`. Use every
other selected folder directly, including an existing `RouteVN Backups` folder.
Persist the selected parent grant separately from the actual backup directory.
Existing configurations keep their current destination until explicitly changed.
On first-time setup, request Documents as the initial picker location using
`DocumentsContract.EXTRA_INITIAL_URI` on Android 8+. The system picker may fall
back to its default location if unavailable. Changing an existing backup folder
and other folder pickers retain their normal initial location. This hint does
not create a folder or grant access; create the subfolder only after the user
chooses and confirms a location through the picker.

Android documents that files outside app-specific storage selected through the
[Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files)
remain after uninstall. Folder grants can be persisted across device restarts.
After reinstall, ask the user to select the existing folder again for recovery.

Validate the selected destination's access and required operations. Cancellation
or failed selection preserves the previous configuration. Losing access pauses
backup and requests reconnection; do not silently choose another destination.
Do not use an app-owned directory as the backup destination.

Before saving the selection, use disposable probe files to check create, write,
read, rename, and delete behavior, and establish usable free-space measurement.
Do not modify existing project files for these checks. Explain unsupported
destinations immediately. Low space is a recoverable paused state, not proof
that a folder is unsupported.

If the actual backup destination contains existing files, confirm with
**Folder is not empty** and **Use this folder for backups? Existing files will be kept.**
Use **Use this folder** as the confirm action. Keep recovery instructions in the
docs rather than this confirmation. Never treat a fresh installation's empty project list as a reason
to delete existing backups. Reuse ordinary project-folder import for recovery;
no bulk-restore wizard or automatic merge is required. The current Android import
creates a new project identity, so the imported project receives a new backup
mapping rather than automatically overwriting its source backup.
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

Reuse the layout and interaction patterns of the iOS project-folder setup
(`src/pages/projectFolderSetup/`; see [iOS setup](ios.md#project-folder-setup-and-storage)).
Android continues editing internal projects; the selected folder is only the
backup destination. Do not change iOS storage behavior.

Copy:

- Title: **Setup backup folder**
- Description: **Set up backups to keep your project files if you uninstall the app.**
- Folder note: **If you select Documents, we’ll create a RouteVN Backups folder.**
- Primary action: **Choose backup folder**
- Secondary action: **Skip for now**

Show setup on first use or when explicitly opened from Projects/settings.
Remember an explicit skip so setup is not shown on every launch. Configure
startup routing at the app level. Skipping must leave ordinary project creation
and editing available.

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

Emphasize **ALL PROJECTS**. Closing the dialog returns to setup without recording
a skip. Record the choice only when the user confirms. Use the dialog close
affordance rather than adding a redundant Cancel button.

### Projects Card

Place the card in the bottom footer, immediately above the RouteVN Creator
version text. Keep it separate from the project list so it does not interrupt
browsing projects. Show it even when there are no projects, and preserve the
project list's existing scroll spacer.

When backup is not configured:

- Yellow warning icon beside the title: **No backup set up**
- Description: **Uninstalling the app or clearing its data will delete all projects.**
- Action: **Set up backup folder**

Keep the card visible after skipping. Selecting a folder alone does not mean
existing projects are protected. Keep the card after folder selection with a
green check, **Local backups**, and **Automatic backups are enabled.**, indicating configuration rather than promising
every recent edit is protected. Show an amber warning if backup fails.
Keep failures to one summary message in this fixed footer; never expand a list
of every project's errors here. Project-specific backup details stay in Config,
so many failures cannot crowd out the project browser or folder action.
Show the root backup folder on one line using the last two path segments;
Config uses the selected project's backup subfolder instead.
An empty library can finish setup without
manufacturing an empty project backup; new projects become eligible on the normal
schedule. Settings shows **Never backed up** until a project's first successful
backup. Configuration alone must not imply those projects are protected.

If any project fails in the initial pass, keep an actionable warning. Later
failures such as insufficient space or revoked access also show a warning card,
with the last successful backup time where available. Distinguish **Never backed
up** from an older successful backup. Do not report an entire library as backed
up just because one project succeeded.

Backup settings should expose the selected project's backup-folder path, status,
and last successful backup time. Once configured, omit the folder-change control
from Config; setup/reconnection remains accessible from the Projects warning.
Omit routine pending messages
and manual backup controls. Display
`snapshotAt` as the time of protected work and **Never backed up** for projects
without a successful snapshot. Use a dedicated **Android local backups** section
matching other Config sections, without a schedule description,
and one last-backup line for the selected project. Keep detailed recovery instructions in the docs.
Use localized catalog
strings in the owning components/stores/handlers.

## Schedule And Change Detection

| Event                               | Behavior                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| Initial folder setup                | Immediately queue all existing projects once.                                   |
| Every 10 minutes while active       | Check for changed projects; back them up sequentially.                          |
| No project data changes             | Check destination access/existence only; skip snapshots and asset scans.        |
| Project creation/import             | Mark pending for the next scheduled pass.                                       |
| App launch/resume                   | Allow five seconds for the screen to settle; check once the remaining cooldown expires. |
| Project switch or app backgrounding | Do not trigger an extra backup.                                                 |
| Failure or low space                | Keep pending; retry at the next scheduled check.                                |

Use one backup queue and only one active backup at a time. Do not repeatedly
retry a failed backup on every resume or run multiple catch-up passes for missed
intervals. Persist enough scheduling state to preserve that behavior across
restarts. No 30-second debounce or two-minute backup schedule is intended.

Use one cancellable timeout aimed at the persisted last attempt plus ten minutes,
not a new ten-minute interval on every launch/resume. Resuming nine minutes after
the last attempt schedules a check one minute later. An overdue check waits five
seconds after launch/resume and never blocks route setup or navigation. Cancel
the timeout while hidden and on teardown; an in-flight pass must not recreate it
after teardown. Repeated resumes share the same cooldown and queue. Keep a local
attempt timestamp as a fallback if the native claim/status bridge fails, avoiding
an immediate retry loop. Initial folder configuration still queues its first pass
without awaiting completion.

Run backup I/O on native worker executors, with no loading overlay or focus
change. Draft saving and snapshot preparation remain asynchronous to the UI.
Native database/media staging still serializes storage operations for consistency;
large newly added assets can delay storage-dependent actions during that stage.
Do not describe this as zero-cost or guaranteed hitch-free. Recheck foreground
visibility after claiming the pass, after saving drafts, and between projects.
Pending changes from a short session may wait until the next app launch/resume.
Pass `reason: "backup"` through editor preparation hooks. The scene editor flushes
pending drafts (including their normal post-save cache update), but does not
rewrite text-statistics checkpoints merely because a backup check ran. Otherwise
the cache timestamp itself advances the database revision on unchanged scenes.
Activity checks subscribe to the existing mobile runtime's native
`routeVNSetAppActive` lifecycle signal as well as document visibility. Some Android
WebViews stay document-visible while their Activity is paused, so visibility
events alone are insufficient.

One project's failure must not block the other projects. Record its warning and
continue the queue. Destination access failures are reported per project without repeated UI prompts. Insufficient space for a large project can still allow a
smaller project to back up while preserving the reserve. Re-evaluate space for
each project; do not create immediate retry loops.

Before trusting matching counters, cheaply check access and the existence of the
mapped project folder, `project.db`, `files/`, and required backup metadata.
Missing entries invalidate that project's successful baseline. Lost access
pauses backup rather than creating a replacement directory elsewhere. These
checks do not hash unchanged databases or scan every asset; silent external
changes inside `files/` are not detected by the routine unchanged check.

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
for the next scheduled pass; do not cancel and restart the current copy. Failed
or skipped backups never advance the successful counter or timestamp.

Counters are local bookkeeping, not globally comparable project revisions.
After restore, folder change, or reinstallation, reconcile identity and establish
a fresh baseline; do not assume equal numbers from different installations mean
equal content.

A background WorkManager schedule is not required for the first version.
Foreground/resume scheduling is the agreed behavior. If background catch-up is
added later, it must respect Android's inexact execution and the
[15-minute periodic minimum](https://developer.android.com/reference/androidx/work/PeriodicWorkRequest).
Do not promise unattended backups every 10 minutes while the app is closed.

## Backup Contents And Metadata

Each project has a separate directory under the selected backup folder:

```text
RouteVN Backups/
  Project-<projectId>/
    project.db
    files/
      <fileId>
    file-metadata/
      <fileId>.mime
    backup.json
```

Folders use stable `Project-<projectId>` names. Settings shows the project names
and last snapshot times. The persisted mapping survives project renames. An
existing unmapped directory is never adopted or overwritten; select another
backup destination on a name conflict.

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

The initial implementation approach is:

1. Coordinate admission of new project operations while draining pending editor
   persistence and outstanding native operations.
2. Pause project writes, including competing native operations.
3. Complete transactions, execute and verify a successful WAL checkpoint, and
   close the relevant database connections.
4. Copy the database to private staging while writes remain paused.
5. Capture matching change-tracking information and protect the required asset
   versions from mutation/deletion.
6. Reopen the working database and resume editing before external copying.

Consume and check checkpoint results; merely issuing a PRAGMA is not sufficient.
Do not hold the editing pause while copying large assets to the external folder.
Validate the staged database and benchmark the local pause on physical devices.
Reopen connections and release the write pause in guaranteed cleanup on every
failure path. A failed backup must not leave editing suspended. Copy missing
immutable assets and MIME sidecars into private staging on the storage executor
before allowing further project writes/deletions. Android can deny hard links
even within private storage (confirmed on Vivo). Existing backed-up assets are
not staged again. Include new media in both staging and destination capacity
estimates. Deleting live assets after preparation does not invalidate the staged
copy. Release staging on completion/failure and clean stale staging after restart.

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
directory or promise detection of external deletion/modification of individual
media files. Backups themselves copy assets before publishing their database.

Import is read-only against the backup source: copy the chosen candidate to
private import staging as `project.db`, validate there, and use normal import
identity handling. Do not rename/delete the user's only recovery copy to make it
importable. A completed folder remains an ordinary import; extra backup files
are ignored. Destination repair before the next automatic backup is separate
and must preserve a validated candidate throughout.

## Asset Copying And Size

Copy only missing assets and metadata; do not recopy unchanged media each time.
Stream bytes natively with bounded buffers rather than moving the entire project
through JavaScript/base64. Use temporary files and verification so a failed asset
copy is not mistaken for an existing complete asset on retry.

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
changes. Retry at the next 10-minute check.

Android providers may return unknown space through the optional
[`COLUMN_AVAILABLE_BYTES`](https://developer.android.com/reference/android/provider/DocumentsContract.Root#COLUMN_AVAILABLE_BYTES).
If available space cannot be verified for the selected destination, pause
automatic backup and explain that limitation; do not silently bypass the reserve
or treat unknown capacity as zero. Validate the available native measurement
approach for supported local providers during implementation.

Warning copy:

> **Backup paused: not enough storage.** Free up space or choose another backup
> folder. Last successful backup: today at 14:30.

Use **Never backed up** when appropriate. Show a toast on entering the failure
state, not every 10 minutes, and keep status visible in Projects/settings.
Clear the warning after a successful retry. Unknown capacity and lost permission
need their own explicit messages rather than an inaccurate low-space message.

## Implementation Boundaries And Validation

Reuse the existing Android document picker, native file operations, database
validation, and project import/export where their contracts fit. Current export
behavior is a starting point, not proof that concurrent automatic backup is safe.

Keep setup/Projects handlers orchestration-focused behind `appService` and
`projectService`. Android adapters belong in `src/deps/services/android/` and
`src/deps/clients/android/`; native SQLite, filesystem, space checks, and document
operations belong in the Android shell. Do not store backup timers or mutable
runtime state in page handler modules. Keep installation-specific backup settings
out of portable project semantics and avoid changing the working database merely
to record backup completion.

Before shipping, validate:

- Setup reuse, picker cancellation, confirmed skip persistence, and Projects card
  placement/status in the UI; add VT coverage where practical.
- No changed data means no snapshots or asset scans; changes to every durable
  project data category mark pending reliably across restart.
- Ten-minute foreground cadence, resume catch-up, sequential execution, manual
  backup, and edits during copying without losing pending changes; one broken
  project must not starve the rest of the queue.
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
MediaStore-based automatic destination selection, and mandatory background jobs
are outside this first version. Android system device-transfer rules remain
separate; see [Backup and device transfer](android.md#backup-and-device-transfer).


## Implementation And Test Map

- `ProjectBackup.java` owns SAF publication, capacity checks, metadata, persistent
  counters, and recovery. SQL triggers update a private revision table in the
  same transaction as project database writes, including drafts and app state.
  Backup completion changes only private preferences, not the project database.
- The Android project store queues snapshot preparation after materialized-view
  persistence. The storage bridge rejects preparation during a transaction,
  export, or active asset write. It checkpoints/closes/copies/reopens SQLite on
  the storage executor, then publishes on a separate native executor.
- `backupService.js` owns one foreground queue. Native preferences claim each
  ten-minute attempt before editor drafts are flushed, so failed saves are also
  throttled. Dirty detection happens after that flush. Folder setup and manual
  backup bypass the interval, never the capacity guard.
- Only Android's local external-storage DocumentsProvider is accepted. A small
  disposable file tests IO and rename behavior; `fstatvfs` measures the actual
  destination. Primary emulated storage and internal staging share one capacity
  budget despite their different FUSE device IDs. Preflight includes missing
  assets, the incoming database, staging, validation copies, and metadata.
- The reused folder setup and `android-backup-status` component provide localized
  English, Japanese, and Simplified Chinese setup, skip warnings, status, and
  recovery instructions. Existing backups are explained before the folder is
  accepted; recovery uses the ordinary Open Project action.

Automated validation:

```bash
bunx vitest run tests/android tests/ios/projectFolderSetup.test.js --exclude '**/.artifacts/**'
cd android/routevn
./gradlew :app:testDebugUnitTest
```

The JVM tests use Robolectric with real SQLite and a file-backed SAF fixture.
They cover transactional counters, validation, space guards, publication failures
before/after renames, metadata failures, retry, stale metadata, and read-only
import fallback to `previous` while refusing `next`. Capacity syscalls are
simulated in this fixture; these tests do not establish real provider durability.
Regression coverage also verifies independent staged media after live-project
deletion, staging only missing media, and reserving both media copies on shared
internal/emulated storage.

After `bun run build:android`, serve `_site` locally and run
`ANDROID_TEST_ORIGIN=http://127.0.0.1:3017 node tests/android/backupSetup.browser.mjs`.
This exercises the packaged UI with a fixture native bridge, including picker
cancellation, closing/confirming skip, skip persistence, low-space warnings,
and Settings. It does not exercise Android's real picker or URI grants.

Vivo validation on 2026-09-18: the initial backup failed because `Os.link`
returned `EACCES`. After replacing hard links with missing-media staging copies,
backup to the user-selected local Documents folder completed successfully.
The saved database passed SQLite integrity, identity, size, and metadata hash
checks; the backup contained 38 media files and 38 MIME sidecars. All 19 native
tests passed and the fixed APK was installed in place, preserving project data
and the selected folder.

Physical-device checks remain pending: SD-card grants/renames, low-space
behavior, process death during copying, uninstall/reinstall recovery, and the
duration of database and missing-media staging on large real projects. Use
disposable projects; never uninstall a user's working app to run a test.

Implementation validation on 2026-09-18: 103 Android/iOS JavaScript tests,
16 native tests, the packaged-browser workflow, smoke tests, and collaboration
adapter tests passed. The Android frontend and debug APK built successfully;
changed JavaScript passes lint/format checks. The repository-wide contract
checker reports 510 errors and 3 warnings, identical to unchanged `HEAD` (no
new diagnostics from this feature).
