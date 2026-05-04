# Project Database Audit

Use this runbook to inspect a project-specific `project.db` without changing the
original project. It is intended for desktop project folders such as
`C:\Users\tk\Desktop\projects\Z87`.

## Safety Rules

- Treat the source project directory as read-only.
- Copy `project.db`, `project.db-wal`, and `project.db-shm` together before
  running SQLite checks.
- Run checks against the copy in `/tmp`, not the original file.
- Do not run write operations such as `VACUUM`, `wal_checkpoint`, `REINDEX`,
  `DELETE`, or `UPDATE` during an audit.
- A local-only project can legitimately have zero `committed_events` rows. The
  accepted local work is stored in `local_drafts`.

## Prepare A Snapshot

On WSL, convert the Windows project path to `/mnt/c/...`:

```sh
PROJECT_DIR=/mnt/c/Users/tk/Desktop/projects/Z87
AUDIT_DIR=/tmp/routevn-project-db-audit-$(date +%Y%m%d%H%M%S)

mkdir -p "$AUDIT_DIR"
cp "$PROJECT_DIR/project.db" "$AUDIT_DIR/project.db"

if [ -f "$PROJECT_DIR/project.db-wal" ]; then
  cp "$PROJECT_DIR/project.db-wal" "$AUDIT_DIR/project.db-wal"
fi

if [ -f "$PROJECT_DIR/project.db-shm" ]; then
  cp "$PROJECT_DIR/project.db-shm" "$AUDIT_DIR/project.db-shm"
fi

DB="$AUDIT_DIR/project.db"
```

Copying the WAL sidecar matters because recent committed local changes may live
there. Opening the original DB on a Windows mount can also produce SQLite
`disk I/O error` when the DB is active, so inspect the copied snapshot instead.

## Basic SQLite Health

```sh
file "$PROJECT_DIR/project.db"
sqlite3 -readonly "$DB" "PRAGMA integrity_check;"
sqlite3 -readonly "$DB" "PRAGMA quick_check;"
sqlite3 -readonly "$DB" ".tables"
sqlite3 -readonly "$DB" ".schema"
```

Expected:

- `file` reports a SQLite database.
- `integrity_check` returns `ok`.
- `quick_check` returns `ok`.
- Core tables are present:
  - `app_state`
  - `committed_events`
  - `local_drafts`
  - `materialized_view_state`

## Row Counts

```sh
sqlite3 -readonly -header -column "$DB" "
SELECT 'app_state' AS table_name, COUNT(*) AS rows FROM app_state
UNION ALL SELECT 'committed_events', COUNT(*) FROM committed_events
UNION ALL SELECT 'local_drafts', COUNT(*) FROM local_drafts
UNION ALL SELECT 'materialized_view_state', COUNT(*) FROM materialized_view_state;
"
```

Interpretation:

- `app_state` should contain app metadata such as `projectInfo` and
  `creatorVersion`.
- `local_drafts` should contain the local project history for local-only work.
- `committed_events` may be `0` for local-only projects.
- `materialized_view_state` should contain cached read models that can be
  rebuilt from history.

## JSON Validity

Draft payloads are stored as BLOB columns but should contain JSON text when
`payload_compression` is `NULL`.

```sh
sqlite3 -readonly -header -column "$DB" "
SELECT
  COUNT(*) AS rows,
  SUM(CASE WHEN json_valid(CAST(payload AS TEXT)) THEN 0 ELSE 1 END) AS invalid_json,
  SUM(CASE WHEN length(payload) = 0 THEN 1 ELSE 0 END) AS empty_payloads,
  SUM(CASE WHEN payload_compression IS NOT NULL THEN 1 ELSE 0 END) AS compressed_payloads
FROM local_drafts;
"

sqlite3 -readonly -header -column "$DB" "
SELECT
  COUNT(*) AS rows,
  SUM(CASE WHEN json_valid(value) THEN 0 ELSE 1 END) AS invalid_json,
  SUM(CASE WHEN length(value) = 0 THEN 1 ELSE 0 END) AS empty_values
FROM materialized_view_state;
"

sqlite3 -readonly -header -column "$DB" "
SELECT key, json_valid(value) AS json_valid, length(value) AS bytes
FROM app_state
ORDER BY key;
"
```

Expected:

- `invalid_json` is `0`.
- `empty_payloads` and `empty_values` are `0`.
- `compressed_payloads` is usually `0` unless compression has been enabled for
  this DB version.

## Draft Log Consistency

```sh
sqlite3 -readonly -header -column "$DB" "
PRAGMA table_info(local_drafts);
"

sqlite3 -readonly -header -column "$DB" "
PRAGMA index_list(local_drafts);
"

sqlite3 -readonly -header -column "$DB" "
SELECT draft_clock, type, partition, length(payload) AS payload_bytes
FROM local_drafts
ORDER BY draft_clock
LIMIT 1;
"

sqlite3 -readonly -header -column "$DB" "
SELECT COUNT(*) AS project_create_rows
FROM local_drafts
WHERE type = 'project.create';
"

sqlite3 -readonly -header -column "$DB" "
SELECT COUNT(*) AS duplicate_draft_ids
FROM (
  SELECT id
  FROM local_drafts
  GROUP BY id
  HAVING COUNT(*) > 1
);
"

sqlite3 -readonly -header -column "$DB" "
SELECT COUNT(*) AS missing_draft_clock_count
FROM (
  WITH RECURSIVE seq(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1
    FROM seq
    WHERE n < (SELECT MAX(draft_clock) FROM local_drafts)
  )
  SELECT n
  FROM seq
  LEFT JOIN local_drafts ON draft_clock = n
  WHERE draft_clock IS NULL
);
"

sqlite3 -readonly -header -column "$DB" "
SELECT
  type,
  partition,
  schema_version,
  payload_compression,
  COUNT(*) AS rows,
  MIN(draft_clock) AS min_clock,
  MAX(draft_clock) AS max_clock,
  datetime(MIN(created_at) / 1000, 'unixepoch') AS first_created_utc,
  datetime(MAX(created_at) / 1000, 'unixepoch') AS last_created_utc
FROM local_drafts
GROUP BY type, partition, schema_version, payload_compression
ORDER BY partition, type;
"
```

Expected:

- `local_drafts` has an integer `draft_clock` primary key and a unique `id`.
- The first draft is usually one `project.create` event in partition `m`.
- `project_create_rows` is usually `1` for a local-only project.
- `duplicate_draft_ids` is `0`.
- `missing_draft_clock_count` is `0`.
- Draft groups have expected partitions:
  - `m` for main project resources and metadata.
  - `s:<id>` for scene partitions.

## Local Draft Correctness

Use these checks to look for malformed draft records. They are read-only and
operate on the copied snapshot.

### Required Fields And JSON Shape

SQLite constraints should prevent null required columns, but this query catches
empty strings and non-object payloads:

```sh
sqlite3 -readonly -header -column "$DB" "
SELECT draft_clock, id, type, partition, schema_version
FROM local_drafts
WHERE id = ''
  OR partition = ''
  OR type = ''
  OR schema_version IS NULL
  OR json_type(CAST(payload AS TEXT)) != 'object'
ORDER BY draft_clock;
"
```

Expected: no rows.

### Timestamp Ordering

Draft clocks should be append-only. Created timestamps do not need to be
perfectly spaced, but they should not move backward in normal operation.

```sh
sqlite3 -readonly -header -column "$DB" "
SELECT COUNT(*) AS created_at_moves_backward
FROM local_drafts current
JOIN local_drafts previous
  ON current.draft_clock = previous.draft_clock + 1
WHERE current.created_at < previous.created_at;
"

sqlite3 -readonly -header -column "$DB" "
SELECT
  draft_clock,
  type,
  partition,
  datetime(client_ts / 1000, 'unixepoch') AS client_utc,
  datetime(created_at / 1000, 'unixepoch') AS created_utc,
  ABS(created_at - client_ts) AS clock_delta_ms
FROM local_drafts
WHERE ABS(created_at - client_ts) > 300000
ORDER BY clock_delta_ms DESC
LIMIT 20;
"
```

Expected:

- `created_at_moves_backward` is `0`.
- Large `clock_delta_ms` rows are not automatically corrupt, but they are worth
  checking when investigating clock or import issues.

### Partition Heuristics

This is a heuristic check. The exact partition contract lives with the creator
model and command definitions, but line edits should normally live in scene
partitions and project/resource events should normally live in `m`.

```sh
sqlite3 -readonly -header -column "$DB" "
SELECT draft_clock, type, partition
FROM local_drafts
WHERE (type LIKE 'line.%' AND partition NOT LIKE 's:%')
   OR (type IN (
        'project.create',
        'file.create',
        'font.create',
        'font.delete',
        'image.create',
        'particle.create',
        'transform.update',
        'variable.create',
        'variable.update'
      ) AND partition != 'm')
ORDER BY draft_clock;
"
```

Expected: no rows. If this returns rows for newly added event types, update the
allow-list before treating it as a data problem.

### Entity ID Presence

Most non-bootstrap events should identify the entity they mutate. This query
extracts common entity id fields and lists records where none is found.

```sh
sqlite3 -readonly -header -column "$DB" "
WITH decoded AS (
  SELECT
    draft_clock,
    type,
    partition,
    COALESCE(
      json_extract(CAST(payload AS TEXT), '$.lineId'),
      json_extract(CAST(payload AS TEXT), '$.variableId'),
      json_extract(CAST(payload AS TEXT), '$.fileId'),
      json_extract(CAST(payload AS TEXT), '$.fontId'),
      json_extract(CAST(payload AS TEXT), '$.imageId'),
      json_extract(CAST(payload AS TEXT), '$.particleId'),
      json_extract(CAST(payload AS TEXT), '$.transformId'),
      json_extract(CAST(payload AS TEXT), '$.sceneId'),
      json_extract(CAST(payload AS TEXT), '$.resourceId')
    ) AS entity_id
  FROM local_drafts
)
SELECT draft_clock, type, partition
FROM decoded
WHERE entity_id IS NULL
  AND type != 'project.create'
ORDER BY draft_clock;
"
```

Expected: no rows for known event types. New event types may need additional id
fields added to the query.

## Local Draft Duplication And Churn

There are two kinds of duplication to watch for:

- **Hard duplicates**: same type, partition, and exact payload repeated. These
  are suspicious unless caused by intentional repeated operations.
- **Churn**: many updates to the same entity. This is not corrupt, but it can
  point to inefficient editor behavior.

### Exact Duplicate Payloads

```sh
sqlite3 -readonly -header -column "$DB" "
SELECT
  type,
  partition,
  COUNT(*) AS duplicate_count,
  MIN(draft_clock) AS first_clock,
  MAX(draft_clock) AS last_clock,
  length(CAST(payload AS TEXT)) AS payload_bytes,
  substr(CAST(payload AS TEXT), 1, 160) AS preview
FROM local_drafts
GROUP BY type, partition, CAST(payload AS TEXT)
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, last_clock DESC
LIMIT 50;
"
```

Expected: no rows, or rows that have a clear explanation.

### Entity Churn

```sh
sqlite3 -readonly -header -column "$DB" "
WITH decoded AS (
  SELECT
    draft_clock,
    type,
    partition,
    length(payload) AS payload_bytes,
    COALESCE(
      json_extract(CAST(payload AS TEXT), '$.lineId'),
      json_extract(CAST(payload AS TEXT), '$.variableId'),
      json_extract(CAST(payload AS TEXT), '$.fileId'),
      json_extract(CAST(payload AS TEXT), '$.fontId'),
      json_extract(CAST(payload AS TEXT), '$.imageId'),
      json_extract(CAST(payload AS TEXT), '$.particleId'),
      json_extract(CAST(payload AS TEXT), '$.transformId'),
      json_extract(CAST(payload AS TEXT), '$.sceneId'),
      json_extract(CAST(payload AS TEXT), '$.resourceId')
    ) AS entity_id
  FROM local_drafts
)
SELECT
  type,
  partition,
  entity_id,
  COUNT(*) AS event_count,
  SUM(payload_bytes) AS total_payload_bytes,
  MIN(draft_clock) AS first_clock,
  MAX(draft_clock) AS last_clock
FROM decoded
WHERE entity_id IS NOT NULL
GROUP BY type, partition, entity_id
HAVING COUNT(*) >= 10
ORDER BY event_count DESC, total_payload_bytes DESC
LIMIT 50;
"
```

Interpretation:

- High counts for text-entry or drag interactions may be normal during editing.
- High counts from one UI action can indicate missing batching/debouncing.
- This is an efficiency signal, not a corruption signal by itself.

## Local Draft Efficiency

Large payloads are sometimes expected. For example, a `project.create` bootstrap
event can be large because it captures initial repository state. Repeated large
payloads after bootstrap are worth investigating.

### Payload Size Summary

```sh
sqlite3 -readonly -header -column "$DB" "
SELECT
  COUNT(*) AS rows,
  MIN(length(payload)) AS min_payload_bytes,
  CAST(AVG(length(payload)) AS INTEGER) AS avg_payload_bytes,
  MAX(length(payload)) AS max_payload_bytes,
  SUM(length(payload)) AS total_payload_bytes
FROM local_drafts;
"

sqlite3 -readonly -header -column "$DB" "
SELECT
  draft_clock,
  type,
  partition,
  length(payload) AS payload_bytes,
  substr(CAST(payload AS TEXT), 1, 160) AS preview
FROM local_drafts
ORDER BY payload_bytes DESC
LIMIT 20;
"
```

### Event Type Cost

```sh
sqlite3 -readonly -header -column "$DB" "
SELECT
  type,
  partition,
  COUNT(*) AS rows,
  CAST(AVG(length(payload)) AS INTEGER) AS avg_payload_bytes,
  MAX(length(payload)) AS max_payload_bytes,
  SUM(length(payload)) AS total_payload_bytes
FROM local_drafts
GROUP BY type, partition
ORDER BY total_payload_bytes DESC
LIMIT 50;
"
```

Interpretation:

- A single large `project.create` is expected.
- Large repeated `*.update` events may mean the command stores whole objects
  where a smaller patch would be enough.
- Many small events from one interaction may mean the UI should batch changes.

## Local Draft Cursor Freshness

Materialized views should not be stale relative to the draft log they represent.
The `last_committed_id` column is the view cursor; in local-only projects it can
act as the latest applied local event clock even when `committed_events` is
empty.

```sh
sqlite3 -readonly -header -column "$DB" "
WITH partition_max AS (
  SELECT partition, MAX(draft_clock) AS max_clock
  FROM local_drafts
  GROUP BY partition
),
global_max AS (
  SELECT MAX(draft_clock) AS max_clock
  FROM local_drafts
)
SELECT
  view_name,
  materialized_view_state.partition,
  last_committed_id AS view_cursor,
  CASE
    WHEN view_name = 'project_repository_main_state' THEN (SELECT max_clock FROM global_max)
    ELSE COALESCE(partition_max.max_clock, 0)
  END AS expected_or_reference_clock
FROM materialized_view_state
LEFT JOIN partition_max
  ON partition_max.partition = materialized_view_state.partition
ORDER BY view_name, materialized_view_state.partition;
"
```

Interpretation:

- `project_repository_main_state` should usually point at the global latest
  draft clock.
- Scene views should usually point at the latest draft clock for that scene
  partition, `0`, or the bootstrap clock that first materialized the scene.
- Treat clearly lower cursors as stale read models only after accounting for
  bootstrap-created scene state. Stale views may be repairable by rebuilding
  projections from the draft log.

## Project Metadata And Read Models

```sh
sqlite3 -readonly -header -column "$DB" "
SELECT
  key,
  length(value) AS value_bytes,
  json_valid(value) AS json_valid,
  substr(value, 1, 200) AS preview
FROM app_state
ORDER BY key;
"

sqlite3 -readonly -header -column "$DB" "
SELECT
  view_name,
  partition,
  view_version,
  last_committed_id,
  length(value) AS value_bytes,
  json_valid(value) AS json_valid,
  datetime(updated_at / 1000, 'unixepoch') AS updated_utc
FROM materialized_view_state
ORDER BY view_name, partition;
"
```

The main materialized state is stored in a `__routevnCheckpoint` wrapper:

```sh
sqlite3 -readonly -header -column "$DB" "
SELECT
  json_extract(value, '$.__routevnCheckpoint.version') AS checkpoint_version,
  json_extract(value, '$.__routevnCheckpoint.value.story.initialSceneId') AS initial_scene_id,
  json_extract(value, '$.__routevnCheckpoint.value.project.resolution.width') AS width,
  json_extract(value, '$.__routevnCheckpoint.value.project.resolution.height') AS height
FROM materialized_view_state
WHERE view_name = 'project_repository_main_state';
"
```

Useful object counts:

```sh
sqlite3 -readonly -header -column "$DB" "
SELECT 'scenes' AS kind, COUNT(*) AS count
FROM materialized_view_state, json_each(materialized_view_state.value, '$.__routevnCheckpoint.value.scenes.items')
WHERE view_name = 'project_repository_main_state'
UNION ALL SELECT 'files', COUNT(*)
FROM materialized_view_state, json_each(materialized_view_state.value, '$.__routevnCheckpoint.value.files.items')
WHERE view_name = 'project_repository_main_state'
UNION ALL SELECT 'images', COUNT(*)
FROM materialized_view_state, json_each(materialized_view_state.value, '$.__routevnCheckpoint.value.images.items')
WHERE view_name = 'project_repository_main_state'
UNION ALL SELECT 'fonts', COUNT(*)
FROM materialized_view_state, json_each(materialized_view_state.value, '$.__routevnCheckpoint.value.fonts.items')
WHERE view_name = 'project_repository_main_state'
UNION ALL SELECT 'variables', COUNT(*)
FROM materialized_view_state, json_each(materialized_view_state.value, '$.__routevnCheckpoint.value.variables.items')
WHERE view_name = 'project_repository_main_state'
UNION ALL SELECT 'layouts', COUNT(*)
FROM materialized_view_state, json_each(materialized_view_state.value, '$.__routevnCheckpoint.value.layouts.items')
WHERE view_name = 'project_repository_main_state'
UNION ALL SELECT 'textStyles', COUNT(*)
FROM materialized_view_state, json_each(materialized_view_state.value, '$.__routevnCheckpoint.value.textStyles.items')
WHERE view_name = 'project_repository_main_state'
UNION ALL SELECT 'transforms', COUNT(*)
FROM materialized_view_state, json_each(materialized_view_state.value, '$.__routevnCheckpoint.value.transforms.items')
WHERE view_name = 'project_repository_main_state';
"
```

Scene names:

```sh
sqlite3 -readonly -header -column "$DB" "
SELECT
  json_each.key AS id,
  json_extract(json_each.value, '$.name') AS name,
  json_extract(json_each.value, '$.type') AS type
FROM materialized_view_state,
  json_each(materialized_view_state.value, '$.__routevnCheckpoint.value.scenes.items')
WHERE view_name = 'project_repository_main_state'
ORDER BY id;
"
```

## Asset Reference Check

Compare database file records with files on disk:

```sh
sqlite3 -readonly "$DB" "
SELECT json_each.key
FROM materialized_view_state,
  json_each(materialized_view_state.value, '$.__routevnCheckpoint.value.files.items')
WHERE view_name = 'project_repository_main_state'
ORDER BY json_each.key;
" > "$AUDIT_DIR/db-file-ids.txt"

find "$PROJECT_DIR/files" -maxdepth 1 -type f -printf '%f\n' | sort > "$AUDIT_DIR/fs-file-ids.txt"

wc -l "$AUDIT_DIR/db-file-ids.txt" "$AUDIT_DIR/fs-file-ids.txt"
comm -23 "$AUDIT_DIR/db-file-ids.txt" "$AUDIT_DIR/fs-file-ids.txt"
comm -13 "$AUDIT_DIR/db-file-ids.txt" "$AUDIT_DIR/fs-file-ids.txt"
```

Interpretation:

- Output from `comm -23` means the DB references files missing from disk. Treat
  this as a likely data problem.
- Output from `comm -13` means disk files exist that are not in DB file records.
  Treat these as orphan candidates, not data loss.

Check that every `fileId` field in the materialized state points to a DB file
record:

```sh
sqlite3 -readonly -header -column "$DB" "
WITH
  state(value) AS (
    SELECT value
    FROM materialized_view_state
    WHERE view_name = 'project_repository_main_state'
  ),
  file_ids(id) AS (
    SELECT json_each.key
    FROM state, json_each(state.value, '$.__routevnCheckpoint.value.files.items')
  ),
  refs(file_id, path) AS (
    SELECT json_tree.value, json_tree.fullkey
    FROM state, json_tree(state.value, '$.__routevnCheckpoint.value')
    WHERE json_tree.key = 'fileId'
  )
SELECT
  COUNT(*) AS file_id_refs,
  COUNT(DISTINCT file_id) AS distinct_file_id_refs,
  SUM(CASE WHEN file_ids.id IS NULL THEN 1 ELSE 0 END) AS refs_missing_db_file
FROM refs
LEFT JOIN file_ids ON file_ids.id = refs.file_id;
"
```

Expected:

- `refs_missing_db_file` is `0`.

List missing references if any exist:

```sh
sqlite3 -readonly -header -column "$DB" "
WITH
  state(value) AS (
    SELECT value
    FROM materialized_view_state
    WHERE view_name = 'project_repository_main_state'
  ),
  file_ids(id) AS (
    SELECT json_each.key
    FROM state, json_each(state.value, '$.__routevnCheckpoint.value.files.items')
  ),
  refs(file_id, path) AS (
    SELECT json_tree.value, json_tree.fullkey
    FROM state, json_tree(state.value, '$.__routevnCheckpoint.value')
    WHERE json_tree.key = 'fileId'
  )
SELECT file_id, path
FROM refs
LEFT JOIN file_ids ON file_ids.id = refs.file_id
WHERE file_ids.id IS NULL
ORDER BY path;
"
```

## Report Template

Use this shape when reporting an audit:

```md
## Database Audit

- Source project: `<project path>`
- Snapshot inspected: `<audit dir>`
- SQLite integrity_check: `ok` or details
- SQLite quick_check: `ok` or details
- Tables present: yes/no
- local_drafts: `<count>`, invalid JSON: `<count>`, duplicate ids: `<count>`, draft clock gaps: `<count>`
- local_drafts correctness: malformed records `<count>`, timestamp reversals `<count>`, partition warnings `<count>`, missing entity ids `<count>`
- local_drafts duplication/churn: exact duplicate payload groups `<count>`, high-churn entities `<count/list>`
- local_drafts efficiency: largest payloads, highest-cost event types, batching/debouncing concerns
- materialized view cursor freshness: current / stale / needs projection rebuild
- committed_events: `<count>`
- materialized_view_state: `<count>`, invalid JSON: `<count>`
- projectInfo: `<id/name/namespace>`
- object counts: scenes/files/images/fonts/variables/layouts/textStyles/transforms
- DB file refs missing from disk: `<count/list>`
- disk files not referenced by DB: `<count/list>`
- conclusion: healthy / needs investigation
```

Do not delete orphan files as part of the audit. Cleanup should be a separate,
explicit operation after confirming the orphan is not intentionally retained.
