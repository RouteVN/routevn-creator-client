# 06 Project Identity And Metadata

Date baseline: July 10, 2026.

This document defines the current ownership and behavior of project identity,
project metadata, browser-hosted bundle save identity, and the native player
save-identity contract.

## Summary

There are four separate concepts that are easy to confuse:

1. app project entry id
2. committed repository event `project_id`
3. browser-hosted bundle save namespace
4. native player application identifier

For new projects, the first comes from `projectInfo` in the project-specific
DB. The third is entered in Web Platform Details. The fourth is owned by the
native player package.

## Project Metadata

Project metadata lives in the project-specific DB `app` store under the key
`projectInfo`.

Current fields:

- `id`
- `namespace`
- `nativeApplicationIdentifier`
- `name`
- `description`
- `language`
- `iconFileId`

Important details:

- this metadata is not owned by repository state
- `projectInfo.id` is the canonical project/folder id for new projects
- `projectInfo.namespace` backfills older stored Web platform records that do
  not have an application identifier
- `projectInfo.nativeApplicationIdentifier` is retained as app-owned project
  identity metadata; Platform Details does not inherit it as a platform export
  default
- `projectInfo.language` selects the language-specific writing count mode
  - English uses word-based counts
  - Japanese and Chinese use character-based counts
- `iconFileId` is stored in `projectInfo`, but the actual icon binary lives in
  the project `files/` folder

## App Project Entry Id

The app keeps a separate `projectEntries` listing for discovery, routing, and
current-project context.

Current behavior:

- the route payload `?p=` and current `appService.getCurrentProjectId()` use the
  app project entry id
- projected editor state `state.project.id` is injected from that current app
  project context
- `state.project.id` is therefore not a repository-state field and not a
  `projectInfo` field

Current rule for new projects:

- app project entry id should match `projectInfo.id`
- the global app DB caches that id for routing and listing
- the project-specific DB remains the source of truth

## Repository Event `project_id`

Desktop `project.db` stores repository history as collab client-store tables.

Important details:

- committed event rows have a `project_id` column
- that value is reconstructed as `event.projectId` when committed events are
  read back
- project identity for new projects is not derived from committed event rows
- the canonical id for new projects lives in `projectInfo.id`

## Browser Bundle Runtime Namespace

The exported bundled runtime uses the application identifier stored in
`platformDetails.web`.

Bundle metadata now carries:

- `bundleMetadata.project.namespace`

Important details:

- new Web platform records start with an empty `applicationIdentifier`
- Web identifiers accept only letters, numbers, hyphens, and periods, for
  example `com.yourteam.yourvn`
- existing Web records without `applicationIdentifier` are backfilled once
  from `projectInfo.namespace` and persisted, preserving their existing save
  bucket
- changing the Web application identifier intentionally selects a different
  save bucket
- `projectId` is not exported into the bundle
- browser IndexedDB/save identity should come from the exported Web application
  identifier, not only from the browser path
- the browser-path namespace remains only as a fallback for older bundles that
  do not carry bundle metadata namespace
- the native Windows SQLite player does not use this namespace as a database
  partition key

Implication:

- the same exported game keeps the same save bucket when moved to a different
  path
- two different exports should not collide just because they are hosted at the
  same path

## Native Player Identifier

An exported native player is a single-game application. Its stable Tauri
application identifier is its runtime save identity.

Important details:

- one Tauri identifier must identify exactly one game
- the identifier must stay stable across releases of that game
- a different game must not reuse the identifier
- the native player stores one unpartitioned `runtime.db` in its Tauri app
  config directory
- the database does not use `projectInfo.namespace`, `projectInfo.id`, title,
  executable path, or release version as a partition key

For the shared SQLite and adapter contract, see
`11-windows-player-runtime-persistence.md`. For macOS packaging and startup
identity propagation, see `13-macos-player-export.md`.

## Native Application Identifier

New projects persist `projectInfo.nativeApplicationIdentifier` in the form
`vn.routevn.player.<base58>`. Existing projects receive the field through one
lazy persisted backfill when their project metadata is read.

The exact value is stable across project renames, moves, and restores. A
different game must receive a different value. It is not used as the default
for new platform export records.

On macOS, the user-managed `platformDetails.macos.applicationIdentifier` is
written to `CFBundleIdentifier` and loaded into Tauri's runtime
`config.identifier` before plugins initialize. It starts blank and should stay
stable across releases that need to share saves. Windows still needs a future
per-game runtime identity fix.

## Current Guidance

Use these rules when reasoning about identity:

- for project display metadata, use `projectInfo`
- for canonical project identity on new projects, use `projectInfo.id`
- for browser-hosted bundle save identity, use
  `platformDetails.web.applicationIdentifier`
- use `projectInfo.namespace` only as the compatibility backfill for older
  stored Web records
- for native player save identity, use the stable Tauri application
  identifier
- for repository history semantics, reason about committed repository events
- do not assume `state.project.id` came from repository state
- do not expose `projectInfo.id` into the exported bundle merely to drive
  runtime save identity
