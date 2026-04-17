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
- web: project-specific IndexedDB project DB

Current app-owned keys:

- `projectInfo`
  - `id`
  - `namespace`
  - `name`
  - `description`
  - `iconFileId`
- `creatorVersion`

Important details:

- `projectInfo` is the source of truth for project display metadata
- `projectInfo.id` is the canonical folder/project id for new projects
- `projectInfo.namespace` is the canonical exported runtime save namespace for
  new projects
- repository state is not the source of truth for `name`, `description`, or
  `iconFileId`
- committed event rows also store `project_id`
- for new projects, app routing/list entries should follow the id stored in
  `projectInfo`

For the current identity split between app project ids, committed-event
`project_id`, and bundled runtime namespace, see
`06-project-identity-and-metadata.md`.

The global app DB separately owns app-level cached project listing data and the
shared `userConfig` object.

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
