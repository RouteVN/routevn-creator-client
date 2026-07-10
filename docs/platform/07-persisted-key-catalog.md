# 07 Persisted Key Catalog

Date baseline: April 16, 2026.

This document lists the agreed persisted key ids used by RouteVN Creator.

Scope:

- global app DB key-value ids
- project-specific DB `app` store key-value ids
- exported Windows player runtime SQLite keys
- intentionally non-persisted runtime-only values

This document does not list repository resource ids such as `sceneId`,
`layoutId`, or `imageId`.

## Global App DB Keys

The global app DB is app-owned storage for project discovery and app-level
settings/cache.

Storage location:

- desktop: global SQLite `app.db`
- web: global IndexedDB app DB (`app`)

Current keys:

- `projectEntries`
  - array of locally known project entries
  - used for project listing, routing, and cached display data
  - cached fields include:
    - `id`
    - `projectPath` on desktop
    - `name`
    - `description`
    - `iconFileId`
    - `createdAt`
    - `lastOpenedAt`
- `userConfig`
  - global app-level user/session/UI config object
  - current nested keys:
    - `groupImagesView.zoomLevel`
      - purpose: grouped image/media zoom preference
      - scope: global
    - resource grid column-count preferences
      - purpose: grouped resource grid column-count preference
      - scope: global
      - keys:
        - `groupAnimationsView.itemsPerRow`
        - `groupCharacterSpritesView.itemsPerRow`
        - `groupColorsView.itemsPerRow`
        - `groupControlsView.itemsPerRow`
        - `groupFontsView.itemsPerRow`
        - `groupImagesView.itemsPerRow`
        - `groupLayoutsView.itemsPerRow`
        - `groupParticlesView.itemsPerRow`
        - `groupSoundsView.itemsPerRow`
        - `groupSpritesheetsView.itemsPerRow`
        - `groupTextStylesView.itemsPerRow`
        - `groupTransformsView.itemsPerRow`
        - `groupVideosView.itemsPerRow`
    - `scenesMap.viewportByProject.<projectId>.zoomLevel`
      - purpose: stored scenes-map zoom for one project
      - scope: per project
    - `scenesMap.viewportByProject.<projectId>.panX`
      - purpose: stored scenes-map horizontal pan for one project
      - scope: per project
    - `scenesMap.viewportByProject.<projectId>.panY`
      - purpose: stored scenes-map vertical pan for one project
      - scope: per project
    - `scenesMap.hideAddSceneHint`
      - purpose: hides the scenes-map add-scene onboarding hint
      - scope: global
    - `scenesMap.selectedSceneIdByProject.<projectId>`
      - purpose: restores the last selected scene for one project
      - scope: per project
    - `sceneEditor.recentSceneIdsByProject.<projectId>`
      - purpose: stores the recently opened scene ids used by mobile scene map navigation
      - scope: per project
    - `sceneEditor.showLineNumbers`
      - purpose: scene-editor line-number toggle
      - scope: global
    - `auth.session`
      - purpose: authenticated session tokens
      - scope: global
    - `auth.user`
      - purpose: authenticated user profile/cache
      - scope: global
    - `resizablePanel.fileExplorerWidth`
      - purpose: persisted file-explorer panel width
      - scope: global
    - `resizablePanel.detailPanelWidth`
      - purpose: persisted detail-panel width
      - scope: global

Naming rules:

- use camelCase within each segment
- use `.` to separate domains
- use explicit per-project subtrees such as
  `scenesMap.viewportByProject.<projectId>.*`

Important ownership rule:

- `projectEntries` is cache/listing data only
- canonical project metadata for an opened project lives in that project's
  `project.db`, not in the global app DB
- `userConfig` is app-owned config and session state, not project metadata

## Project-Specific DB `app` Store Keys

Each project has its own local DB. Besides the collab/event-store data, the DB
also has an app-owned key-value area exposed as `store.app`.

Storage location:

- desktop: project-specific SQLite `project.db`
- web: project-specific IndexedDB project DB

Current keys:

- `projectInfo`
  - canonical app-owned project metadata
  - current fields:
    - `id`
    - `namespace`
    - `name`
    - `description`
    - `iconFileId`
- `creatorVersion`
  - stored project format version gate for compatibility checks
- `versions`
  - array of saved release/version snapshots
  - current items include:
    - `id`
    - `name`
    - `notes`
    - `actionIndex`
    - `createdAt`
- `projectorGap`
  - stored projection-gap metadata used by compatibility gating and explicit
    open-blocked states
- `collab.lastCommittedId:<projectId>`
  - committed remote cursor watermark
  - currently used by the web collab path

Important ownership rule:

- `projectInfo.id` is the source of truth for canonical project identity on new
  projects
- `projectInfo.namespace` is the source of truth for browser-hosted bundle save
  identity on new projects
- `projectId` must not be exported into the bundle just to drive runtime save
  identity

## Project-Specific Materialized View Keys

These are not plain `app` key-value entries, but they are persisted ids that
often get confused with config keys.

Current storage key shape:

- `materialized_view_state`
  - keyed by `(view_name, partition)`
  - persisted fields include:
    - `view_version`
    - `last_committed_id`
    - `value`
    - `updated_at`

These rows are projection caches/checkpoints, not user-facing config.

## Exported Windows Player Runtime SQLite Keys

The native Windows player stores Route Engine runtime persistence in:

```text
<Tauri app local data directory>/runtime.db
```

The `persistence_values` table uses these key ids:

- `saveSlots:<slotId>`
  - one row per save slot
  - examples: `saveSlots:1`, `saveSlots:2`, `saveSlots:auto`
  - value: one format-versioned save entry containing matching `slotId`,
    `savedAt`, optional `image`, and `state.contexts`
- `globalDeviceVariables`
  - value: object keyed by non-empty device-scoped variable id
- `globalAccountVariables`
  - value: object keyed by non-empty account-scoped variable id
- `globalRuntime`
  - value: closed object containing only durable dialogue, auto-forward, skip,
    volume, and mute preferences
- `accountViewedRegistry`
  - value: viewed section frontiers and viewed resource ids in `sections` and
    `resources` arrays

All `persistence_values.value_json` roots are JSON objects. Values are
key-specifically validated before a write and again on load. Invalid values are
not converted to `{}`. In particular, a `saveSlots:<slotId>` row is rejected if
its nested save state is malformed or its internal `slotId` does not identify
the physical key's suffix.

The internal `persistence_metadata` table currently uses:

- `legacyIndexedDbMigrationCompleted`
  - records completion of the one-time browser-storage import
  - exact SQLite text value: `1`
  - remains present when runtime values are cleared

The database belongs to one game identified by the Tauri application
identifier. None of these keys are additionally prefixed or partitioned by
project id or namespace.

For database location, durability, adapter, and migration rules, see
`11-windows-player-runtime-persistence.md`. For the normative complete key,
field, type, JSON shape, validation, and atomic rejection contract, see
`12-windows-player-runtime-key-value-contract.md`.

## Runtime-Only Values

These values are intentionally not persisted in any DB.

- API base URL override
  - not persisted
  - source: explicit runtime override or query param only
  - fallback: host-based default resolution
- web collab debug enabled
  - not persisted
  - source: explicit runtime config only
  - fallback: `false`

## Summary

Use this split:

- global app DB: project discovery/list cache plus `userConfig`
- project-specific DB `app` store: canonical project metadata plus project-local
  app-owned state
- exported Windows player DB: one game's native Route Engine runtime state
- runtime-only values: explicit overrides that are intentionally not persisted

When adding a new persisted key, update this document in the same PR.
