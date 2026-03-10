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

RouteVN's local project repository event store is separate from this collab
sync model.

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
- Read models/materialized views can be rebuilt at any time.
