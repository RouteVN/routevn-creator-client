# 11 Windows Player Runtime Persistence

Date baseline: July 12, 2026.

Status: implemented.

## Purpose

This document defines durable runtime persistence for an exported Windows
player. It covers save slots, persistent variables, runtime preferences, and
viewed-state data produced while playing an exported game.

This contract is specific to the native Windows player. Browser-hosted bundle
persistence remains a separate platform contract.

## Decision

- An exported Windows player is a single-game native application.
- Its Tauri application identifier is its durable game identity.
- One application identifier must identify exactly one game.
- The player stores runtime data in one native SQLite database named
  `runtime.db`.
- The database is not partitioned by project id, namespace, title, executable
  path, or release version.
- The Windows player must not use WebView IndexedDB for runtime persistence.
- The Windows player does not read, import, migrate, dual-write, or delete
  browser IndexedDB runtime data.

The canonical database location is:

```text
<Tauri app local data directory>/runtime.db
```

On Windows this resolves conceptually to:

```text
%LOCALAPPDATA%/<tauri-identifier>/runtime.db
```

For the current shell identifier, that is:

```text
%LOCALAPPDATA%/vn.routevn.shell/runtime.db
```

The path must be resolved through Tauri rather than assembled from environment
variables in frontend JavaScript.

## Application Identifier Invariant

The Tauri identifier is the native persistence boundary.

Required behavior:

- the identifier stays stable across releases of the same game
- renaming or moving the executable does not change save identity
- changing the game title, publisher, icon, or version does not change save
  identity
- a different game must not reuse the same identifier

`vn.routevn.shell` therefore represents one game identity. If the export
system supports installing multiple independent games on the same Windows user
account, it must give each game a stable, unique Tauri identifier at the native
packaging boundary. Adding a namespace column to `runtime.db` is not the
replacement for that invariant.

`projectInfo.namespace` and `bundleMetadata.project.namespace` are not native
Windows database keys. They may remain relevant to browser-hosted bundle
persistence, where multiple bundles can share one browser origin.

## SQLite Schema

The initial database stores each save slot as its own JSON row and keeps the
remaining Route Engine persistence values in separate aggregate rows:

```sql
CREATE TABLE persistence_values (
  key TEXT PRIMARY KEY CHECK (
    key IN (
      'globalDeviceVariables',
      'globalAccountVariables',
      'globalRuntime',
      'accountViewedRegistry'
    )
    OR key GLOB 'saveSlots:?*'
  ),
  value_json TEXT NOT NULL CHECK (
    json_valid(value_json)
    AND json_type(value_json) = 'object'
  ),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);
```

Schema version 1 has one application table: `persistence_values`. It has no
metadata table and no metadata keys. Use `PRAGMA user_version` as the database
schema version.

Save-slot keys use the exact shape `saveSlots:<slotId>`, for example
`saveSlots:1`, `saveSlots:2`, or `saveSlots:auto`.

The complete normative key and JSON value contract is defined in
`12-windows-player-runtime-key-value-contract.md`. That document is the source
of truth for required fields, allowed types, closed and extensible objects,
slot-key/value identity, scoped update payloads, and rejection behavior.

Keeping these values in separate rows has three important properties:

- saving one slot does not rewrite other slots or their thumbnails
- frequently updated variables or viewed state do not rewrite save-slot
  thumbnails
- the persisted JSON shapes stay aligned with the Route Engine persistence
  adapter contract

A missing aggregate row loads as an empty object. Save-slot rows are combined
into the `saveSlots` object expected by Route Engine. Invalid JSON, an
unsupported schema version, or a corrupt database is an explicit load failure;
the player must not silently replace it with an empty database.

## Runtime Adapter Contract

The Windows adapter must implement the persistence interface expected by Route
Engine:

- `load()`
- `clear()`
- `saveSlots(saveSlots)`
- `saveGlobalDeviceVariables(globalDeviceVariables)`
- `saveGlobalAccountVariables(globalAccountVariables)`
- `saveGlobalRuntime(globalRuntime)`
- `applyScopedDataUpdates(updates)`

The shared player runtime should receive this adapter as a host dependency.
The web host may supply IndexedDB persistence; the Windows host supplies the
native SQLite adapter.

Frontend JavaScript must not receive a database path or a generic SQL
connection. It calls narrow Tauri commands, and the Rust player shell owns:

- app-local path resolution
- database creation and schema migration
- SQL statements and transactions
- validation of persistence keys and scoped updates
- locking, retry, and error translation

The implemented command boundary is:

- `load_player_persistence`
- `clear_player_persistence`
- `save_player_save_slots`
- `save_player_persistence_value`
- `apply_player_scoped_data_updates`

## Write And Durability Contract

Use these SQLite settings unless a tested platform constraint requires a
documented change:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
```

Additional rules:

- every payload is parsed and semantically validated before any SQL mutation
- every stored value is validated again when it is loaded
- invalid payloads are rejected; they are never converted to `{}` and saved
- one invalid item rejects the complete adapter call, including all slot
  deletes/updates or all scoped operations in that call
- each adapter call resolves only after its transaction commits
- `saveSlots(saveSlots)` synchronizes `saveSlots:<slotId>` rows in one
  transaction; unchanged slots retain their existing row and timestamp
- `applyScopedDataUpdates` applies all supplied operations in order inside one
  transaction
- incremental scoped updates must not be last-write coalesced
- `clear()` clears runtime values for this game without deleting or replacing
  the executable
- a persistence write failure must produce user-visible feedback
- startup load failures must preserve the existing database for diagnosis and
  recovery

SQLite WAL sidecar files may exist while the player is running. They are part
of normal SQLite operation and must not be treated as separate save identities.

## No Browser Storage Migration

The native Windows player is SQLite-only from its first startup. Its startup
sequence is:

1. Resolve the Tauri app-local data directory.
2. Open or create `runtime.db`.
3. Load and validate the rows in `persistence_values`.
4. Return empty objects for missing fixed rows and an empty save-slot object
   when no slot rows exist.

The native host never opens IndexedDB. Existing browser or WebView IndexedDB
records are intentionally ignored and remain untouched. They are not imported
into SQLite, and no migration-completion marker is stored. This also means a
first native run starts with empty runtime state when `runtime.db` does not yet
contain values.

Browser-hosted bundles continue to use their separate IndexedDB persistence
contract. Removing native migration support does not change browser-hosted
storage.

## Platform Boundary

Windows native player:

```text
Tauri identifier -> app local data directory -> runtime.db
```

Browser-hosted bundle:

```text
browser origin + bundle namespace -> IndexedDB record
```

The two hosts share the Route Engine persistence interface, not the storage
technology or identity mechanism.

## Canonical Implementation Areas

- shared bundle player runtime: `scripts/main.js`
- Windows persistence host adapter:
  `src/deps/clients/tauri/playerRuntimePersistenceHost.js`
- bundle/player HTML selection:
  `src/deps/services/shared/projectExportService.js`
- Windows template staging: `scripts/build-windows-player-template.js`
- native SQLite implementation:
  `crates/routevn-packager/tauri-shell/src-tauri/src/player_persistence.rs`
- native command wiring:
  `crates/routevn-packager/tauri-shell/src-tauri/src/lib.rs`
- Route Engine persistence contract: `route-engine-js`
