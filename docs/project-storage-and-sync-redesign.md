# Project Storage And Sync Redesign

## Purpose

This document proposes a redesign of RouteVN Creator's local persistence and
sync architecture.

It is based on two conclusions:

1. the current system is too complex and too fragile for a critical product
   subsystem
2. the right answer is **not** to remove `insieme`, but to use it for the job
   it was designed to do

The problem is not that `insieme` exists.

The problem is that RouteVN currently combines:

- an `insieme` client store
- a separate RouteVN repository event store
- a separate projector-cache bridge
- custom optimistic session state
- app-owned metadata and assets

into one tangled runtime.

That is where most of the fragility comes from.

## Core Decision

**We should keep `insieme`, but stop fighting its model.**

`insieme` should be the only local event log and sync-state store for a
project.

RouteVN should own:

- project manifest / metadata
- asset binaries and asset indexing
- app-specific projections and UI selectors

RouteVN should **not** persist a second local command/event log on top of
`insieme`.

## What Must Stay

We do **not** want to collapse everything into one committed-only layer.

We need both of these, and they should stay durable:

- `local_drafts`
- `committed_events`

That split is correct.

It is how local-first sync is supposed to work:

- `local_drafts` hold accepted local work that is not yet committed by the
  server
- `committed_events` hold the authoritative committed stream
- a local-only project may therefore keep its bootstrap `project.create` event
  in `local_drafts` and still be valid
- zero committed rows is a valid steady state for an offline-only project

The redesign is only trying to remove the extra persisted RouteVN event/cache
layer that currently sits beside those two.

So the target is:

- keep local drafts
- keep committed events
- delete the duplicate RouteVN persisted event/projection system

not:

- delete local drafts
- or pretend committed state alone is enough

## What `insieme` Already Gives Us

From `../insieme`, the intended client model is already clear:

- one project-scoped client store
- `local_drafts`
- `committed_events`
- durable cursor
- optional `app_state`
- optional materialized views
- `createSyncClient(...)`
- `createCommandSyncSession(...)`

Important docs in `../insieme`:

- `README.md`
- `docs/client/storage.md`
- `docs/client/materialized-views.md`
- `docs/reference/javascript-interface.md`

The intended shape is:

```text
UI
-> one client sync store
   -> local drafts
   -> committed events
   -> materialized views
   -> cursor / app state
-> sync transport
```

That is already close to what RouteVN needs.

## Where Our Current Integration Went Wrong

### 1. We duplicated the local event system

Today RouteVN has:

- raw `insieme` local drafts
- raw `insieme` committed events
- RouteVN repository events
- RouteVN repository hydration from stored events
- projector-cache rebuild from `insieme` committed rows back into RouteVN
  repository events

That is one persisted event system too many.

### 2. We let project-open depend on `insieme` storage internals

Project compatibility should be decided by RouteVN manifest/version rules.

Instead, we have hit cases where project open is blocked by `insieme`
client-store schema reset requirements.

That is a layering mistake.

### 3. We built a custom session layer that overlaps `insieme`

`createProjectCollabService` currently owns:

- queued submission batching
- local projected state
- local draft insertion behavior
- remote apply logic
- projection-gap handling

But `insieme` already provides:

- ordered draft submission
- sync client state
- command sync session
- committed event application callbacks

We wrapped it with another state machine instead of narrowing the wrapper.

### 4. We split "repository truth" across multiple persisted layers

Depending on platform and code path, local truth may appear to come from:

- `local_drafts`
- `committed_events`
- repository cache events
- materialized view checkpoints
- in-memory projected repository state
- in-memory domain state

That is too many competing authorities.

### 5. We made asset/resource writes cross too many systems

A simple image import currently spans:

- blob write
- thumbnail write
- file record creation
- resource creation
- local draft insertion
- repository apply

and those steps are not owned by one coherent local model.

### 6. Web and desktop no longer share one logical architecture

Desktop and web expose a similar `projectService`, but the actual local
storage architecture differs:

- desktop mixes RouteVN app metadata, RouteVN repository layers, and `insieme`
  tables in one SQLite file
- web keeps RouteVN repository storage and `insieme` client-store state as
  separate systems bridged by projector-cache rebuild logic

That is too divergent.

## What The New Architecture Should Be

The new architecture should be:

```text
UI
-> RouteVN project service
-> RouteVN project manifest + asset store
-> one Insieme client store per project
   -> local_drafts
   -> committed_events
   -> materialized views
   -> cursor / client app_state
-> optional sync transport / server
```

The key point is:

**one project, one `insieme` client store**

not:

**one project, one `insieme` store plus one RouteVN event cache store**

## Responsibility Split

### `insieme` owns

- local draft persistence
- committed event persistence
- sync cursor
- materialized-view checkpoint persistence
- sync client runtime
- command submission / sync transport lifecycle

### RouteVN owns

- project manifest and compatibility policy
- project listing / discovery metadata
- asset blob storage
- asset index / explorer representation
- command schema mapping
- app-specific materialized-view reducers
- UI-level optimistic editing state when needed

This is the right boundary.

`insieme` does not need to own RouteVN's project manifest or asset binaries.

RouteVN does not need to own a second persisted local event log.

## Project Manifest

RouteVN still needs a tiny app-owned manifest outside the critical `insieme`
event path.

This manifest should exist so we can:

- check project format compatibility before heavy open
- read project name / description / icon quickly
- distinguish RouteVN project format from `insieme` store schema

Suggested manifest fields:

- `projectFormatVersion`
- `projectId`
- `namespace`
- `name`
- `description`
- `iconAssetId`
- `createdAt`
- `updatedAt`

This manifest can live:

- desktop: sidecar JSON or tiny dedicated metadata table/file
- web: tiny metadata store/object store

Important rule:

**project-open compatibility must be checked from RouteVN manifest first**

The `insieme` store should not be the first gate users hit.

## How RouteVN Should Use Materialized Views

This is where our current design most clearly diverged from `insieme`.

Instead of persisting RouteVN repository events separately, we should use a
small number of RouteVN-owned `insieme` materialized views.

Suggested views:

### 1. `workspace`

A project-wide materialized view that reduces committed events into the current
RouteVN repository state.

This should use `matchPartition(...)` so one loaded project partition can react
to all RouteVN project partitions.

The `workspace` view becomes the normal read source for project-backed pages.

### 2. `scene-overview`

A smaller derived view optimized for scene lists / lazy scene loading if we
still need that split.

### 3. Optional narrow views

Only if we truly need them, such as:

- resource summaries
- editor-specific quick indices

We should stay close to `insieme`'s own guidance:

- small number of views
- deterministic reducers
- cheap reducers

What we should **not** do anymore:

- persist RouteVN repository events separately
- rebuild RouteVN repository cache from raw committed events
- maintain projector-cache bridges as a normal startup mechanism

## Read Model

The normal local read path should be:

```text
load RouteVN manifest
-> open one Insieme store
-> load RouteVN workspace materialized view
-> build domain selectors from that workspace state
```

Not:

```text
open RouteVN repository cache
-> maybe open Insieme store
-> maybe rebuild projection cache
-> replay again into repository runtime
```

Fast open should come from `insieme` materialized views, not from RouteVN
replaying a second event system.

## Working State Model

The correct working-state model is:

```text
committed materialized view
+ ordered local_drafts overlay
= UI working state
```

That means the app still has:

- a committed layer
- a local pending layer

The simplification is that both come from the same `insieme` project store,
instead of coming from `insieme` plus a separate persisted RouteVN repository
cache.

## Local Drafts And Optimistic UI

`insieme` materialized views are committed-state views.

That is fine.

For local editing, RouteVN should explicitly overlay local drafts on top of the
committed workspace view.

That means:

- committed state comes from `workspace` materialized view
- uncommitted state comes from durable `local_drafts`, optionally exposed
  through a thin session-owned view helper
- the UI-visible working state is:
  committed materialized view + ordered local draft overlay

This is still much simpler than today's system because there is no second
persisted RouteVN event cache involved.

Important rule:

**the optimistic overlay is allowed**

**the second persisted event system is not**

## Command Submission

The new command path should be:

```text
UI action
-> build RouteVN command batch
-> submit through thin RouteVN wrapper over createCommandSyncSession(...)
-> Insieme stores drafts
-> RouteVN updates optimistic overlay for immediate UI response
-> committed events later fold into materialized views
```

The wrapper should stay thin.

It should mostly do:

- command envelope mapping
- actor/project wiring
- RouteVN-specific compatibility handling

It should not also own:

- a second projected repository state
- a second batching state machine
- a second local truth model

## Asset And File Model

We still need RouteVN-owned asset storage.

But we should stop mixing these concepts:

- blob identity
- explorer folder nodes
- user-facing asset entries
- resource references

Recommended split:

### Blob store

- immutable binary storage
- app-owned, outside `insieme`

### Asset index

- RouteVN app-owned metadata about blobs
- explorer/catalog structure

### RouteVN commands

- reference stable asset/blob ids
- not generic "file tree node" ids that may also represent folders

This matters because our current bug class around:

- `payload.data.fileId must reference an existing non-folder file`

comes from unclear identity boundaries.

## Atomicity Rule For Asset Imports

The asset pipeline should become one RouteVN-owned mutation flow:

```text
stage blob writes
-> write/confirm asset index entries
-> submit RouteVN command batch
-> expose optimistic overlay
```

If blob writes succeed but command submission fails, RouteVN can safely clean up
or garbage-collect orphaned staged blobs later.

The important thing is:

- no second fallback path that changes command semantics
- no duplicate RouteVN event persistence layer
- no resource validation against a different local truth than the one the UI
  uses

## Desktop Backend

We should keep `insieme` on desktop too, but we should stop using it through a
fragile transaction stack.

Current problem:

- `@tauri-apps/plugin-sql` plus RouteVN retry/recovery logic is not a clean
  fit for the transactional assumptions in `insieme`'s SQL stores

Recommended direction:

- provide a narrow RouteVN-owned desktop DB adapter that matches what
  `insieme` expects
- ideally implement that boundary in Rust for predictable transaction control
- keep the `insieme` data model, not a second RouteVN event store

This is not "replace `insieme`".

It is "give `insieme` a proper backend on Tauri".

## Web Backend

Web should also use one `insieme` client store directly.

We should stop maintaining:

- RouteVN repository event IndexedDB
- plus separate `insieme` client-store state
- plus projector-cache bridge between them

Instead:

- use one project-scoped `insieme` client store
- keep RouteVN manifest + assets in app-owned IndexedDB stores
- read committed state from RouteVN materialized views inside that one
  `insieme` store

## Project Open Flow

The redesigned open flow should be:

```text
resolve project reference
-> read RouteVN manifest
-> verify RouteVN project format compatibility
-> open one Insieme store
-> load RouteVN workspace materialized view
-> attach RouteVN optimistic draft overlay
-> start optional sync transport
```

Open should not require:

- projector-cache rebuild
- replay from RouteVN repository events
- bootstrap repair as normal behavior
- draft dropping as normal behavior

Those may still exist as repair tools, but not as ordinary startup logic.

## Collaboration Failure Policy

If remote compatibility fails, we should not keep the project editable on a
stale local projection.

Preferred behavior:

- clear explicit read-only mode
- clear message that project requires a newer client
- no silent projection-gap editing against stale state

`insieme` can still carry the transport/runtime, but RouteVN must make the UI
policy explicit.

## Migration Strategy

### Phase 1: Freeze The Current Duplicate Layers

- stop adding new persistence behavior to the RouteVN repository cache layer
- stop widening projector-cache repair logic

### Phase 2: Introduce Manifest + One-Store Contract

- define RouteVN manifest
- define "one `insieme` store per project" as the platform rule

### Phase 3: Build RouteVN Materialized Views In `insieme`

- `workspace`
- `scene-overview` if needed
- any minimal additional views

### Phase 4: Move Reads To Materialized Views

- project-backed pages read from RouteVN `workspace` materialized view
- remove dependence on persisted RouteVN repository event cache

### Phase 5: Simplify Session Layer

- replace `createProjectCollabService` with a thin wrapper over
  `createCommandSyncSession(...)`
- remove second projected repository truth

### Phase 6: Migrate Existing Projects

For old projects:

- import existing committed history into the new single-store model
- migrate manifest/project metadata
- migrate assets

For old local drafts:

- import only if they pass strict validation
- otherwise discard explicitly with user-visible warning

The default should be safety, not silent draft resurrection.

### Phase 7: Delete Legacy Duplication

Delete:

- projector-cache bridge
- separate RouteVN repository event persistence
- routine bootstrap/draft repair logic on open
- fallback file/resource submission paths caused by split local truth

## Testing Requirements

The redesigned system needs contract tests around:

- one-store project open
- manifest compatibility gating
- committed materialized view correctness
- ordered draft overlay correctness
- asset import plus resource creation
- remote committed batch application
- read-only downgrade on compatibility failure
- desktop and web parity for the same logical scenarios

The contract should be the same across platforms even if backend implementations
are different.

## What We Should Stop Saying

We should stop reasoning as if the choice is:

- "use `insieme`"
- or "RouteVN owns everything"

The better framing is:

- `insieme` owns the event-sync substrate
- RouteVN owns the product model around it

That is the clean design.

## Recommended End State

Keep `insieme`.

Use it directly.

Stop persisting a second RouteVN event/projection system beside it.

Build one RouteVN-owned manifest and asset layer around one `insieme`
project-scoped client store, and use `insieme` materialized views as the
committed local read model.

That gets us:

- less code
- fewer duplicate truths
- less platform divergence
- simpler project open
- clearer ownership
- fewer transaction edge cases

The real redesign is not "remove `insieme`".

It is:

**remove the extra architecture we built on top of `insieme` because we were
not trusting `insieme` to be the one local sync store.**
