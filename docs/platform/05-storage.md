# 05 Storage

## Server SQLite

```sql
CREATE TABLE committed_events (
  committed_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  user_id TEXT,
  partitions TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  meta TEXT NOT NULL,
  created INTEGER NOT NULL
);
```

`canonical` is derived for dedupe and should not be stored as a full text
column.

## Client Sync Logical Model

- `local_drafts`
- `committed_events`
- `app_state` (`collab.lastCommittedId:{projectId}`)
- optional materialized view state tables

Write-destination contract:

- `local_drafts` hold durable accepted local work that is not yet approved by
  an authoritative server.
- Offline/local-only projects therefore store their bootstrap
  `project.create` event in `local_drafts`.
- `committed_events` hold only authoritative server-approved history.
- A valid local-only project may therefore have zero committed rows.

RouteVN does not persist a second local repository event log beside this
client-store model.

## Project-Specific Local DB

The project-specific local DB also carries app-owned metadata alongside the
event store.

Storage location:

- desktop: project-specific SQLite `project.db`
- Android: app-private `files/projects/<projectId>/project.db`, beside the
  project's `files/` asset directory
- web: project-specific IndexedDB project DB

Current app-owned keys:

- `projectInfo`
  - `id`
  - `namespace`
  - `name`
  - `description`
  - `language`
  - `iconFileId`
- `platformDetails.web`
  - platform application name and identifier
- `platformDetails.windows`
  - platform application name, icon, and identifier plus publisher,
    description, and copyright
- `platformDetails.macos`
  - platform application name, icon, and identifier
  - Version and Build Number are supplied for each export rather than stored
- `creatorVersion`

Important details:

- release metadata is read from these app-store records at export time; the Web
  Application Name and project-owned icon are written to the exported HTML,
  Web manifest, and generated `app-icon-192.png`/`app-icon-512.png` files,
  Windows values to executable/installer version metadata, and macOS values to
  `Info.plist`
- the Windows `applicationIdentifier` starts blank and is required and editable
- the Windows `iconFileId` starts empty; the user must upload an image, which is
  cropped to 256 by 256 pixels before Windows Platform Details can be created
- the macOS `applicationIdentifier` starts blank, is required and editable,
  and controls both the exported app identity and save-data location; builds
  using different identifiers do not share saves
- macOS Version and Build Number are per-export inputs, not persisted Platform
  Details; Version is prefilled from the selected release name and Build Number
  must be entered manually for each export
- the Web `applicationIdentifier` starts blank, is required and editable, and
  controls the exported browser save-data identity; changing it selects a
  different save bucket
- `projectInfo` is the source of truth for project display metadata
- `projectInfo.id` is the canonical folder/project id for new projects
- `projectInfo.namespace` backfills older stored Web platform records that do
  not have an application identifier
- platform detail keys do not exist until the user adds the corresponding
  platform and submits its prefilled create form; cancelling does not write a
  key, and created platform keys can be edited but not deleted
- a later project-icon update fills an empty macOS platform icon, but never an
  empty Windows platform icon
- preview data under `releaseInfo.web`, `releaseInfo.windows`, or
  `releaseInfo.macos` is copied to the matching `platformDetails.*` key when
  first read; obsolete Web icon metadata is removed because Web export uses
  the project-owned icon
- repository state is not the source of truth for `name`, `description`,
  `language`, or `iconFileId`
- committed event rows also store `project_id`
- for new projects, app routing/list entries should follow the id stored in
  `projectInfo`

For the current identity split between app project ids, committed-event
`project_id`, browser bundle namespace, and native player identity, see
`06-project-identity-and-metadata.md`.

## Exported Windows Player DB

The native Windows player owns a separate SQLite database for runtime save
data. Its implementation contract is recorded in
`11-windows-player-runtime-persistence.md`.

Storage location:

- `<Tauri app config directory>/runtime.db`

On Windows this is the roaming application-data tree (`%APPDATA%`) resolved by
the Tauri SQL plugin from `sqlite:runtime.db`.

This database is scoped by the Tauri application identifier. One identifier
represents one game, so `runtime.db` has no project-id or namespace partition.
It is not the Creator project DB and does not contain repository history.

For the complete contract, see
`11-windows-player-runtime-persistence.md`.

The global app DB separately owns app-level cached project listing data and the
shared `userConfig` object. On Android it uses the platform-standard
`getDatabasePath("app.db")` location and is not part of a project directory.

For the agreed persisted key catalog across global app DB, project-specific DB
`app` store, and non-persisted runtime-only values, see
`07-persisted-key-catalog.md`.

## Durability Settings

- WAL mode
- `synchronous=FULL`
- non-zero `busy_timeout`
- periodic `PRAGMA integrity_check`

## Assets

- Assets are not in event log.
- Asset metadata is referenced by ids from domain entities.
- Asset binary stored separately (filesystem/object storage/indexeddb blob store).

## Projection Strategy

- Event log is source of truth.
- Local read state is reconstructed from committed history plus ordered draft
  overlay.
- Read models/materialized views can be rebuilt at any time.

### Drafts That No Longer Apply

The full history of an opened project loads on demand, often after a reused
main checkpoint has already opened it. A draft that no longer applies during
that replay is left out of the loaded history and kept in `local_drafts`.
Errors without a command index are traced to their draft by a binary search,
so valid drafts around it still apply.

When a load leaves drafts out, the repository deletes every scene projection
checkpoint (they count events by position, which a left-out draft shifts),
clears the overviews and text stats of the affected scenes (of every scene
when a draft was made in the main partition), and reloads the open scene. If a
left-out draft was made in the main or a main-scene partition, it also rebuilds
the main state from the loaded history and saves it as the main checkpoint; the
main state never applies scene-partition events. An event that storage already
held when it is added, such as a command's own draft, is not applied twice.
Then the app shows one alert naming the affected scenes and sections, at most
once per draft (`projectHistory.notifiedSkippedDrafts.<projectId>` in
`userConfig`).

The drafts stay in storage, so later loads leave them out again. The
repository records the drafts that cached state was rebuilt without in the
`project_repository_skipped_drafts` row beside the checkpoints. A load that
leaves out the same drafts rebuilds nothing; the app is still told about them.
A load that leaves out other drafts rebuilds over both lists, so a recorded
draft that applies again is put back too. The record is saved as unfinished
before the rebuild changes any cache, and as finished only after every
checkpoint write of the rebuild succeeded; with no draft left out, it is
removed.

A storage error does not stop the rebuild: the main state and the open scene
are rebuilt in memory, a checkpoint that fails to be deleted or saved is not
read again in that session (the repository rebuilds it from the loaded
history), and the unfinished record makes the next open rebuild again. The
first error is reported once as a handled error, with the left-out drafts.
Outside the rebuild too, a checkpoint that fails to be deleted is not read
again in that session, and the operation that deleted it does not fail.

Drafts are not reported when the history has no `project.create`: they then
replay onto an empty project, as in desktop history backed by a main
checkpoint, so a failure does not mean their changes are missing. A draft that
repeats a committed event is not reported either.
