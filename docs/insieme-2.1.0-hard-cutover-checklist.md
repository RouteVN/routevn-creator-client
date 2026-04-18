# Insieme 2.1.0 Hard Cutover Checklist

## Purpose

This document turns the storage and sync redesign into an execution checklist.

It is a **hard cutover** plan:

- no legacy project storage support
- no projector-cache rebuild as a normal startup path
- no import of old local drafts
- no fallback compatibility repair

This document should be used as the implementation checklist for moving
RouteVN Creator to a one-store-per-project model built directly on
`insieme@2.1.0`.

Related docs:

- [Project Storage And Sync Redesign](./project-storage-and-sync-redesign.md)
- [Scene Editor Text Sync Redesign](./scene-editor-text-sync-redesign.md)
- [Platform README](./platform/README.md)

## Status

Implementation status: complete.

Last validation run:

- `bun run lint`
- `bun run build:web`
- `bunx vitest run tests/services/projectAssetService.test.js tests/services/projectExportService.test.js tests/projectService/projectServiceCore.releaseRuntime.test.js tests/versions/versions.handlers.test.js tests/projectRepositoryRuntime/projectRepositoryRuntime.test.js tests/projectRepositoryService/projectRepositoryService.mainCheckpoint.test.js tests/projectRepositoryService/projectRepositoryService.compatibility.test.js tests/web/projectServiceAdapters.test.js tests/tauri/projectServiceAdapters.test.js tests/sceneEditor/editorSession.test.js tests/systemActions/systemActions.handlers.test.js`
- `bunx vitest run tests/web/webRepositoryAdapter.test.js tests/collab/createProjectCollabService.test.js tests/services/projectCollabCore.deleteIfUnused.test.js`

## Hard Cutover Rules

- Old local storage formats are not supported.
- Old duplicated RouteVN repository cache data is not supported.
- Old local draft import is not supported.
- If a project/store is in the old format, open must fail fast with a clear
  incompatibility message.
- Compatibility must be decided by RouteVN manifest and version rules, not by
  repair logic.
- No startup repair, replay bridge, or projector-cache rebuild is allowed in
  the normal open path.

## Target End State

At the end of this work, the supported architecture must be:

```text
UI
-> RouteVN project service
-> RouteVN manifest + metadata + assets
-> one insieme client store per project
   -> local_drafts
   -> committed_events
   -> materialized views
   -> cursor / app_state
-> optional sync transport
```

Requirements:

- `insieme` is the only local event-sync store for a project.
- RouteVN does not persist a second local command/event log.
- Normal local/offline writes persist to `local_drafts`.
- `committed_events` are reserved for authoritative server-approved history.
- RouteVN materialized views are the committed local read model.
- `createCommandSyncSession(...)` is the sync/session owner.
- Web and Tauri follow the same logical project-store contract.

## Success Criteria

- Project open does not require projector-cache rebuild.
- Project open does not require replay from a second RouteVN event store.
- Scene editor local drafts are never silently overwritten by unrelated edits.
- Remote compatibility failures cause a clear read-only or open-blocked state.
- Production code uses only public `insieme@2.1.0` APIs.
- The same project behaves the same way on web and Tauri for the same history.

## Phase 0: Lock The Boundary

### Goal

Freeze the desired architecture before refactoring.

### Checklist

- [x] Confirm `insieme` is pinned to `2.1.0`.
- [x] Define the new RouteVN project/storage format version boundary.
- [x] State clearly in platform docs that old storage layouts are unsupported.
- [x] State clearly in project-open flows that unsupported formats fail fast.

### Files To Touch

- [package.json](/home/tk/Code/yuusoft-org/routevn-creator-client/package.json)
- [bun.lock](/home/tk/Code/yuusoft-org/routevn-creator-client/bun.lock)
- [docs/platform/README.md](/home/tk/Code/yuusoft-org/routevn-creator-client/docs/platform/README.md)
- [docs/platform/10-model-compatibility-and-upgrades.md](/home/tk/Code/yuusoft-org/routevn-creator-client/docs/platform/10-model-compatibility-and-upgrades.md)
- [src/deps/services/shared/projectRepositoryService.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/projectRepositoryService.js)

### Exit Criteria

- There is one explicit supported format contract.
- The codebase no longer implies that older storage layouts will be repaired.

## Phase 1: Remove Private Insieme API Usage

### Goal

Stop depending on `insieme` internals and use the public `2.1.0` store
surface only.

### Checklist

- [x] Replace committed-event reads via `_debug.getCommitted()` with
      `listCommitted()`.
- [x] Replace draft reads via `_debug.getDrafts()` with `listDraftsOrdered()`.
- [x] Replace cursor reads via `_debug.getCursor()` with `getCursor()`.
- [x] Audit all production imports and ensure they come from supported package
      entry points only.
- [x] Restrict `_debug` access to tests or explicit diagnostics only.

### Files To Touch

- [src/deps/services/tauri/collabClientStore.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/tauri/collabClientStore.js)
- [src/deps/services/web/collabClientStore.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/web/collabClientStore.js)
- [src/deps/services/shared/collab/clientStoreHistory.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/collab/clientStoreHistory.js)
- related tests under [tests/](/home/tk/Code/yuusoft-org/routevn-creator-client/tests)

### Specific Requirements

- Production code must not assume access to `store._debug`.
- Production code must not depend on unpublished `insieme` storage internals.
- Store access patterns must be portable across web and Tauri adapters.

### Exit Criteria

- `rg "_debug"` returns test-only or diagnostic-only usage.
- Production store reads and inspection paths compile and run with public APIs.

## Phase 2: Establish The One-Store Contract

### Goal

Make one `insieme` client store the only local event-sync substrate for each
project.

### Checklist

- [x] Define the project reference -> one client store mapping.
- [x] Remove support for any second persisted RouteVN event log.
- [x] Keep project metadata, manifest, and assets outside `insieme`.
- [x] Keep `local_drafts`, `committed_events`, cursor, app state, and
      materialized views inside the one `insieme` store.
- [x] Ensure ordinary project open can succeed using only manifest/assets plus
      the one client store.

### Files To Touch

- [src/deps/services/shared/projectRepositoryService.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/projectRepositoryService.js)
- [src/deps/services/shared/projectRepositoryRuntime.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/projectRepositoryRuntime.js)
- [src/deps/services/web/projectServiceAdapters.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/web/projectServiceAdapters.js)
- [src/deps/services/tauri/projectServiceAdapters.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/tauri/projectServiceAdapters.js)

### Specific Requirements

- Project open must not read a second RouteVN repository event cache.
- Project open must not perform projector-cache rebuild as standard behavior.
- Project open must fail clearly when the store format is unsupported.

### Exit Criteria

- The architecture has one local event store per project.
- The service layer no longer treats duplicate RouteVN event persistence as
  valid steady-state storage.

## Phase 3: Move The Committed Read Model To Materialized Views

### Goal

Use `insieme` materialized views as the committed local read model instead of a
second persisted RouteVN event/cache layer.

### Checklist

- [x] Define a RouteVN `workspace` materialized view.
- [x] Define a `scene-overview` materialized view only if required for
      performance or page loading.
- [x] Ensure the main project-backed pages can read from materialized views.
- [x] Keep checkpoints only as persisted view state, not as a second truth.
- [x] Remove dependence on a duplicate persisted RouteVN repository event store
      for ordinary reads.

### Files To Touch

- [src/deps/services/shared/projectRepositoryViews/mainStateView.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/projectRepositoryViews/mainStateView.js)
- [src/deps/services/shared/projectRepositoryViews/sceneOverviewStore.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/projectRepositoryViews/sceneOverviewStore.js)
- [src/deps/services/shared/projectRepositoryViews/sceneBundleRuntime.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/projectRepositoryViews/sceneBundleRuntime.js)
- [src/deps/services/shared/projectRepositoryRuntime.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/projectRepositoryRuntime.js)

### Specific Requirements

- Materialized views must be sufficient to construct committed local read state.
- Duplicate RouteVN event-cache persistence must not be needed to render pages.
- Checkpoint persistence must not reintroduce a second authority.

### Exit Criteria

- Project-backed reads are driven by materialized views plus RouteVN selectors.
- The main committed read path does not depend on duplicate RouteVN event replay.

## Phase 4: Simplify The Session Layer

### Goal

Reduce RouteVN collaboration/session code to a thin wrapper around
`createCommandSyncSession(...)`.

### Checklist

- [x] Keep command mapping in the RouteVN wrapper.
- [x] Keep local validation in the RouteVN wrapper where it improves UX.
- [x] Keep compatibility evaluation in the RouteVN wrapper.
- [x] Remove app-owned duplicate projected repository truth from the session
      layer.
- [x] Remove session responsibilities already owned by `insieme`, such as
      draft ordering and reconnect behavior.

### Files To Touch

- [src/deps/services/shared/collab/createProjectCollabService.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/collab/createProjectCollabService.js)
- [src/deps/services/shared/collab/mappers.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/collab/mappers.js)
- [src/deps/services/shared/collab/commandEnvelope.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/collab/commandEnvelope.js)

### Specific Requirements

- `createProjectCollabService` must not own a second in-memory repository truth.
- RouteVN-specific code may normalize commands and user-facing errors.
- `insieme` must remain the sync runtime and ordered draft substrate.

### Exit Criteria

- The collab service reads as a wrapper, not a parallel sync engine.
- Duplicate projection logic has been removed from the session path.

## Phase 5: Remove Projector Cache And Duplicate Persistence

### Goal

Delete the RouteVN-specific duplicate persistence architecture that sits beside
`insieme`.

### Checklist

- [x] Remove normal-use dependence on `projectorCache`.
- [x] Remove code that bootstraps committed history from old RouteVN repository
      events.
- [x] Remove code that rebuilds RouteVN repository events from `insieme`
      committed rows.
- [x] Remove startup repair flows that exist only because of duplicate local
      truth.
- [x] Keep any emergency repair tooling out of ordinary runtime paths.

### Files To Touch

- [src/deps/services/web/projectServiceAdapters.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/web/projectServiceAdapters.js)
- [src/deps/services/tauri/projectServiceAdapters.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/tauri/projectServiceAdapters.js)
- [src/deps/services/shared/collab/projectionGapState.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/collab/projectionGapState.js)
- any now-obsolete repository cache helpers under
  [src/deps/services/shared/](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared)

### Specific Requirements

- Normal startup must not call projector-cache rebuild.
- Normal startup must not synthesize supported state from legacy RouteVN cache
  data.
- RouteVN must not store a second persistent event log for the same project.

### Exit Criteria

- Duplicate persistence infrastructure is deleted or unreachable in production.
- Startup no longer contains "repair the old architecture" steps.

## Phase 6: Enforce Compatibility And Failure Policy

### Goal

Make projection-gap and compatibility failure behavior explicit and safe.

### Checklist

- [x] Keep remote command compatibility evaluation.
- [x] Block open or force read-only mode when compatibility fails.
- [x] Show a stable explicit message that a newer client is required.
- [x] Do not allow editing on stale projected state after compatibility failure.
- [x] Persist only the minimum diagnostic metadata needed for support or
      debugging.

### Files To Touch

- [src/deps/services/shared/collab/compatibility.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/collab/compatibility.js)
- [src/deps/services/shared/collab/createProjectCollabService.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/collab/createProjectCollabService.js)
- UI/service surfaces that open projects and present repository state

### Specific Requirements

- No silent editing against stale projections.
- No hidden downgrade to a partially working state.
- The user must get a deterministic product response.

### Exit Criteria

- Compatibility failure is visible, explicit, and safe.
- Product policy matches the redesign doc rather than ad hoc runtime behavior.

## Phase 7: Scene Editor Safety Guarantees

### Goal

Preserve the current draft-session direction and make scene editing safe under
the new one-store model.

### Checklist

- [x] Keep the editor session as the immediate source of truth for in-progress
      text editing.
- [x] Ensure unrelated action edits cannot overwrite newer text drafts.
- [x] Flush local drafts on preview, navigation, and unmount.
- [x] Keep repository subscription as the committed read model.
- [x] On divergence, preserve the local draft and mark conflict.
- [x] Do not auto-merge same-line text conflicts.

### Files To Touch

- [src/pages/sceneEditor/sceneEditor.handlers.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/pages/sceneEditor/sceneEditor.handlers.js)
- [src/pages/sceneEditor/sceneEditor.store.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/pages/sceneEditor/sceneEditor.store.js)
- [src/internal/ui/sceneEditor/editorSession.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/internal/ui/sceneEditor/editorSession.js)
- [src/internal/ui/sceneEditor/persistenceQueue.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/internal/ui/sceneEditor/persistenceQueue.js)

### Specific Requirements

- A rerender must never discard newer local text.
- Local typing must remain immediate.
- Repository acknowledgement must not be required before local text is visible.
- Minimum conflict behavior is:
  preserve local draft, mark conflict, avoid silent data loss.

### Exit Criteria

- Scene editor behavior matches the draft-session design.
- The editor is safe under background/action edits and remote committed updates.

## Phase 8: Platform Parity

### Goal

Make web and Tauri share one logical architecture even if adapters differ.

### Checklist

- [x] Align web and Tauri around the same project-store contract.
- [x] Ensure both platforms use the same session semantics.
- [x] Ensure both platforms enforce the same compatibility policy.
- [x] Ensure both platforms expose the same project-open behavior and failure
      modes.

### Files To Touch

- [src/deps/services/web/](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/web)
- [src/deps/services/tauri/](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/tauri)
- shared service layers under
  [src/deps/services/shared/](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared)

### Specific Requirements

- Storage adapter differences are acceptable.
- Sync semantics and product behavior differences are not acceptable.

### Exit Criteria

- The same project history behaves the same way on both platforms.
- Platform code differences are adapter-level only.

## Phase 9: Test Gate

### Goal

Protect the new architecture with contract tests instead of regression-only
tests around the old design.

### Checklist

- [x] Add tests for one-store project open.
- [x] Add tests for hard incompatibility rejection of unsupported formats.
- [x] Add tests for committed materialized-view correctness.
- [x] Add tests for ordered draft overlay behavior.
- [x] Add tests for remote committed batch application.
- [x] Add tests for explicit compatibility downgrade behavior.
- [x] Add scene editor regressions for text draft plus action changes.
- [x] Add web/Tauri parity scenarios for the same logical project history.
- [x] Delete tests that only preserve the duplicate persistence architecture.

### Test Locations

- [tests/collab/](/home/tk/Code/yuusoft-org/routevn-creator-client/tests/collab)
- [tests/projectRepositoryRuntime/](/home/tk/Code/yuusoft-org/routevn-creator-client/tests/projectRepositoryRuntime)
- [tests/projectRepositoryService/](/home/tk/Code/yuusoft-org/routevn-creator-client/tests/projectRepositoryService)
- [tests/puty/](/home/tk/Code/yuusoft-org/routevn-creator-client/tests/puty)
- [tests/systemActions/](/home/tk/Code/yuusoft-org/routevn-creator-client/tests/systemActions)
- scene-editor-related tests as needed

### Exit Criteria

- The new architecture is covered by contract tests.
- The old duplicated design is no longer the behavior being protected.

## Final Acceptance Checklist

- [x] One `insieme` client store per project is the only local event-sync
      substrate.
- [x] RouteVN does not persist a second local command/event log.
- [x] Project open does not require projector-cache rebuild.
- [x] Project open does not require duplicate RouteVN event replay.
- [x] Unsupported formats fail fast with a clear message.
- [x] Production code uses public `insieme@2.1.0` APIs only.
- [x] `createProjectCollabService` is a thin RouteVN wrapper over
      `createCommandSyncSession(...)`.
- [x] RouteVN materialized views provide the committed read model.
- [x] Scene editor preserves local text drafts and never silently overwrites
      them.
- [x] Web and Tauri follow the same logical store contract.
- [x] The supporting contract tests are in place and passing.

## Explicit Non-Goals

- This plan does not preserve compatibility with old storage layouts.
- This plan does not import old local drafts.
- This plan does not provide true same-line live co-editing.
- This plan does not add CRDT-based text collaboration.
