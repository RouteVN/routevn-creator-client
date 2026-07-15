# 11 Windows Player Runtime Persistence

Date baseline: July 12, 2026.

Status: implemented.

## Purpose

This document defines the architecture and ownership boundaries for durable
runtime persistence in an exported Windows player. The exact physical keys and
JSON value contracts are normative in
`12-windows-player-runtime-key-value-contract.md`.

Browser-hosted bundle persistence remains a separate platform contract.

## Decision

- An exported Windows player is a single-game native application.
- Its Tauri application identifier is its durable game identity.
- One application identifier must identify exactly one game.
- The player stores runtime data in one SQLite database named `runtime.db`.
- The database is not partitioned by project id, namespace, title, executable
  path, player profile, or release version.
- Runtime values use the existing generic JavaScript SQLite KV client.
- RouteVN key mapping, JSON validation, save-slot synchronization, and scoped
  update logic are JavaScript application concerns.
- Rust registers the generic Tauri SQL plugin. It does not implement RouteVN
  persistence commands or understand RouteVN persistence values.
- The Windows player must not use, read, import, migrate, dual-write, or delete
  WebView IndexedDB runtime data.

## Database Location

The Windows host opens this plugin URL:

```text
sqlite:runtime.db
```

For a relative SQLite URL, the pinned Tauri SQL plugin resolves the file under
Tauri's application config directory. The canonical location is therefore:

```text
<Tauri app config directory>/runtime.db
```

On Windows this resolves conceptually to the roaming application-data tree:

```text
%APPDATA%/<tauri-identifier>/runtime.db
```

For the current shell identifier, the conceptual path is:

```text
%APPDATA%/vn.routevn.shell/runtime.db
```

The adapter passes only `sqlite:runtime.db` to the plugin. It must not assemble
an `%APPDATA%` path from environment variables. The SQL plugin and Tauri path
resolver own the platform-specific path.

SQLite may create `runtime.db-wal` and `runtime.db-shm` beside the database
while the player is running. They are normal SQLite sidecars, not separate save
identities.

## Application Identifier Invariant

The Tauri identifier is the native persistence boundary.

Required behavior:

- the identifier stays stable across releases of the same game
- renaming or moving the executable does not change save identity
- changing the game title, publisher, icon, or version does not change save
  identity
- a different game must not reuse the same identifier

The reusable Windows template currently uses `vn.routevn.shell` for every
export, so Windows exports share this database path until per-game identifier
stamping is implemented. This temporary limitation is specific to the Windows
packaging path. The macOS exporter already stamps the stable
`projectInfo.nativeApplicationIdentifier` and the macOS shell applies it to
Tauri's runtime configuration before the SQL plugin initializes. The later
Windows packaging change must use the same field; it must not add a namespace
inside `runtime.db` as a substitute.

For the macOS export and startup contract, see
`13-macos-player-export.md`.

`projectInfo.namespace` and `bundleMetadata.project.namespace` are not native
Windows database keys. They remain relevant only to contracts such as a web
host where multiple bundles may share one browser origin.

## Ownership Boundary

The runtime path is:

```text
Route Engine persistence interface
  -> Windows JavaScript host adapter
  -> JavaScript RouteVN key/value validation and mapping
  -> shared JavaScript createDb KV client
  -> generic Tauri SQL plugin
  -> SQLite runtime.db
```

Responsibilities are intentionally split as follows.

### Route Engine

Route Engine calls only its persistence interface:

- `load()`
- `clear()`
- `saveSlots(saveSlots)`
- `saveGlobalDeviceVariables(globalDeviceVariables)`
- `saveGlobalAccountVariables(globalAccountVariables)`
- `saveGlobalRuntime(globalRuntime)`
- `applyScopedDataUpdates(updates)`

It does not receive a database path, SQL statements, or the generic KV client.

### Windows JavaScript Adapter

The Windows adapter owns all application semantics:

- exact supported physical key names
- one-row-per-slot expansion and reconstruction
- complete pre-write JSON validation
- semantic validation for each key family
- revalidation of every loaded row
- save-slot diffing
- ordered scoped-update interpretation
- in-memory persistence state used to calculate scoped updates
- mapping complete adapter calls to generic KV operations

Validation is synchronous at the public adapter boundary. A malformed payload
throws before database initialization or any queued SQLite mutation begins.

The adapter serializes its calls. It updates its cached state only after the
corresponding SQLite operation succeeds. A failed write therefore cannot make
later calls believe an uncommitted value was stored.

### Shared JavaScript SQLite Client

`src/deps/clients/tauri/db.js` is storage-generic. It owns:

- loading a managed Tauri SQL connection
- SQLite busy timeout and lock retry
- operation serialization per client instance
- creation of the generic `kv` table
- JSON serialization and parsing
- `get`, `set`, `remove`, `list`, `clear`, and atomic `applyBatch` operations
- optional durability and schema-version checks

The shared client must not contain RouteVN player key names, save-slot shapes,
viewed-registry logic, or Route Engine concepts.

### Rust Player Shell

Rust owns native-shell integration only:

- registers `tauri_plugin_sql`
- grants the required SQL plugin capabilities
- retains the native embedded-package commands used to read the packaged game

There are no `load_player_persistence`, `save_player_persistence_value`,
`save_player_save_slots`, `clear_player_persistence`, or
`apply_player_scoped_data_updates` Rust commands. There is no RouteVN-specific
Rust SQLite module.

## SQLite Schema

Schema version 1 uses the same generic table contract as the Creator's shared
SQLite KV client:

```sql
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT CHECK (value IS NULL OR json_valid(value))
);
```

Committed RouteVN rows always have a non-null, syntactically valid JSON text
value. SQL `NULL` is reserved as the internal delete marker for one-statement
atomic batches. These triggers remove that marker in the same SQLite statement:

```sql
CREATE TRIGGER IF NOT EXISTS kv_delete_null_after_insert
AFTER INSERT ON kv
WHEN NEW.value IS NULL
BEGIN
  DELETE FROM kv WHERE key = NEW.key;
END;

CREATE TRIGGER IF NOT EXISTS kv_delete_null_after_update
AFTER UPDATE OF value ON kv
WHEN NEW.value IS NULL
BEGIN
  DELETE FROM kv WHERE key = NEW.key;
END;
```

The generic SQL schema deliberately does not enumerate RouteVN keys. The
JavaScript player contract allows only the fixed keys and `saveSlots:<slotId>`
keys documented in `12-windows-player-runtime-key-value-contract.md`.

Schema version is `PRAGMA user_version = 1`. A nonzero version other than `1`
is an explicit open failure. There is no metadata table and no metadata key.

## Write And Durability Contract

The player creates the shared client with:

```js
createDb({
  path: "sqlite:runtime.db",
  durability: "full",
  schemaVersion: 1,
});
```

That applies:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
```

Additional rules:

- every complete adapter payload is cloned and validated before any SQL write
- invalid values are rejected; they are never converted to `{}` and saved
- one invalid item rejects the entire save-slot snapshot or scoped-update batch
- every stored row is parsed and semantically validated again on load
- `saveSlots` puts changed slots and deletes removed slots with one atomic
  `applyBatch` SQLite statement
- unchanged slots are not rewritten
- `applyScopedDataUpdates` evaluates every supplied operation in order, builds
  all affected aggregate values, then writes them with one atomic batch
- scoped updates are not last-write coalesced before their ordered evaluation
- a promise resolves only after the plugin reports that SQLite operation
  completed
- `clear()` deletes all KV rows without deleting or replacing the executable
- a load failure preserves the existing database and offending rows for
  diagnosis and recovery

The generic batch implementation passes put and delete operations as JSON to
one `INSERT ... SELECT FROM json_each(...) ON CONFLICT DO UPDATE` statement.
The null-delete triggers above make deletes part of that same statement. It
does not try to simulate a transaction with separate `BEGIN`, write, and
`COMMIT` plugin calls, because those calls are not guaranteed to use one pooled
connection.

## Startup And No IndexedDB Migration

The native Windows startup sequence is:

1. Create the native persistence adapter.
2. Open or create `sqlite:runtime.db` through the SQL plugin.
3. Verify or initialize `PRAGMA user_version`.
4. Load all `kv` rows.
5. Parse and validate every physical key and value.
6. Reconstruct the aggregate Route Engine persistence state.

Missing fixed keys load as `{}`. No save-slot rows load as `saveSlots: {}`.
Present malformed data is an error, not missing data.

The native host never opens IndexedDB. Existing browser or WebView IndexedDB
records are intentionally ignored and left untouched. No migration marker is
stored. A first native run starts empty unless `runtime.db` already contains
valid values.

Browser-hosted bundles continue to use their separate IndexedDB persistence
contract. The two hosts share the Route Engine interface, not storage identity
or storage technology.

## Canonical Implementation Areas

- shared bundle player runtime: `scripts/main.js`
- Windows persistence host:
  `src/deps/clients/tauri/playerRuntimePersistenceHost.js`
- RouteVN persistence validation and mapping:
  `src/internal/playerRuntimePersistence.js`
- shared SQLite KV client: `src/deps/clients/tauri/db.js`
- Windows host bundle config:
  `scripts/vite.player-runtime-host.config.js`
- Windows template staging: `scripts/build-windows-player-template.js`
- SQL plugin registration:
  `crates/routevn-packager/tauri-shell/src-tauri/src/lib.rs`
- SQL plugin permissions:
  `crates/routevn-packager/tauri-shell/src-tauri/capabilities/default.json`
- Route Engine persistence contract: `route-engine-js`
