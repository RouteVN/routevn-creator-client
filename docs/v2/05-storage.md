# 05 Storage (V2)

## Server SQLite

```sql
CREATE TABLE committed_events (
  committed_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  partitions TEXT NOT NULL,
  event TEXT NOT NULL,
  canonical TEXT NOT NULL,
  status_updated_at INTEGER NOT NULL
);
```

## Client SQLite / IndexedDB Logical Model

- `local_drafts`
- `committed_events`
- `app_state` (`cursor_committed_id`)
- optional materialized view state tables

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
