# 10 Projection Checkpoint Plan (Library-Level)

Date baseline: March 7, 2026.

This document captures the final plan for fixing slow project load by moving the solution into `insieme`, not by growing RouteVN-specific replay infrastructure.

## Problem Summary

Current cold-load profiling for RouteVN web shows:

- store adapter ready: ~12.7 ms
- repository events loaded: ~17.4 ms
- committed cursor loaded: ~0.6 ms
- repository runtime created: ~11,135.2 ms
- total repository initialization: ~11,166.8 ms

The bottleneck is repository runtime creation, not IndexedDB access or route handling.

Today, RouteVN rebuilds repository state by replaying all stored events at startup through a full conversion pipeline:

1. repository state -> domain state
2. command processing
3. domain state -> repository state

This scales linearly with event count and becomes too slow as project history grows.

## Decision

The solution should live in `insieme` as a reusable projection/checkpoint capability.

RouteVN should define projections and consume them.
RouteVN should not own custom snapshot/replay/checkpoint infrastructure beyond its projection definitions and app-specific reducers.

## Goals

- Keep event log as the source of truth.
- Avoid full event-log replay on every cold load.
- Keep reads exact and never knowingly stale.
- Unify RouteVN local repository event shape with Insieme command-profile event shape.
- Avoid writing the full persisted projection on every event.
- Support browser storage, especially IndexedDB.
- Support partition-aware loading so the app does not need the whole project in memory.
- Support overview pages that need summary data for many scenes without loading full scene detail.
- Keep the design generic enough for other `insieme` consumers.

## Non-Goals

- Replace the canonical command/event log model.
- Make RouteVN pages maintain ad hoc duplicate state in handlers.
- Make overview data a second editable source of truth.
- Require whole-project hydration for every screen.

## Constraints

- Event log remains authoritative.
- RouteVN should use one command-event envelope shape instead of keeping a separate local repository wrapper format.
- Materialized/projection state must be rebuildable from committed events.
- Reads inside an active session must reflect the latest committed state.
- Persisted projection state may lag in storage, but cold reads must catch up before the caller receives data.
- Partition boundaries must stay coarse and stable.
- RouteVN already uses these partition families:
  - `project:<projectId>:story`
  - `project:<projectId>:story:scene:<sceneId>`
  - `project:<projectId>:resources:<resourceType>`
  - `project:<projectId>:layouts`
  - `project:<projectId>:settings`

## Core Model

The library should support persisted projection checkpoints.

Conceptually:

- In-memory projection state is updated on every committed event.
- Persisted projection state is flushed on a policy such as debounce, interval, or max-events-since-flush.
- On startup, the library loads the last persisted checkpoint for the requested projection key and replays only the tail of committed events after that checkpoint.
- The caller receives the projection only after catch-up has completed.

This is not a second source of truth.
It is a derived, cached, rebuildable read model.

## Schema Unification

RouteVN should stop using a separate local repository event wrapper and converge on Insieme's command-profile event shape.

Target direction:

- store one event envelope shape locally and remotely
- use `event.type === "event"`
- use:
  - `payload.commandId`
  - `payload.schema`
  - `payload.data`
  - `payload.commandVersion`
  - `payload.actor`
  - `payload.projectId`
  - `payload.clientTs`

This keeps the domain command model intact while removing the extra local repository wrapper.

Benefits:

- fewer event-shape translations
- easier reuse of Insieme reducer/projection helpers
- simpler projection definitions
- less app-owned replay glue

This schema unification does not by itself solve startup performance.
It is a cleanup and reuse step that should accompany the projection/checkpoint work.

## Why Not Plain Materialized Views Only

Traditional materialized views written on every committed event reduce cold-load cost but can increase write cost.

The preferred model here is:

- exact in-memory projection updates per committed event
- debounced or interval-based checkpoint persistence
- exact cold reads via checkpoint + tail replay

This gives:

- no stale reads during the current session
- reduced storage write amplification
- fast cold-load hydration without full replay

## Library Features Needed In `insieme`

### 1. IndexedDB Projection Persistence

Add projection/materialized-view persistence support to the browser IndexedDB client store.

Current gap:

- SQLite and LibSQL stores already persist materialized view state and offsets.
- IndexedDB client store currently does not.

Needed:

- projection state store keyed by:
  - `view_name`
  - `view_version`
  - `projection_key`
- persisted offset store keyed by:
  - `view_name`
  - `view_version`
  - `projection_key`
  - `last_committed_id`

### 2. First-Class Projection API

`insieme` should expose a public projection API instead of making apps assemble this from low-level store primitives.

Target shape:

```js
defineProjection({
  name,
  version,
  initialState,
  keyFromRequest,
  affectsCommittedEvent,
  reduce,
});
```

Runtime/store-facing operations:

```js
await projectionStore.hydrate({ name, keys });
await projectionStore.read({ name, key });
await projectionStore.readMany({ requests });
await projectionStore.invalidate({ name, keys });
await projectionStore.flush({ name, keys });
```

Exact method names can change, but the library needs this level of abstraction.

### 3. Generic Reducer Support

`insieme` currently has reducer helpers oriented around `event.payload.schema`.

After schema unification, RouteVN should be able to dispatch naturally from `payload.schema` / `payload.data`.
Even then, `insieme` should still support generic committed-event reducers so apps are not forced into exactly one event family forever.

Needed:

- generic committed-event reducer support
- not limited to schema-based event payloads
- no assumption that the app must wrap everything into one `event` schema family

### 4. Lazy Hydration By Projection Key

The library must not require full-view or full-project hydration for every read.

Needed:

- hydrate only requested projection keys
- replay only the tail needed for those keys
- return exact state after catch-up

### 5. In-Memory Cache With Eviction

The library should support bounded memory usage.

Needed:

- LRU or TTL-based eviction of projection keys
- independent hydration and eviction per projection key
- exact reload from checkpoint + tail replay after eviction

### 6. Flush Policy Controls

Projection checkpoint persistence should be configurable.

Needed:

- `flush: "immediate"`
- `flush: { debounceMs }`
- `flush: { intervalMs }`
- `flush: { maxEventsSinceFlush }`
- monotonic offset/state writes so older flushes never overwrite newer checkpoints

### 7. Batch Read Support

Overview/list pages need efficient batch reads.

Needed:

- `readMany(...)`
- batched hydration/catch-up for many projection keys
- no forced load of full detail projections when summaries are enough

### 8. Projection Versioning

Persisted projections must be invalidated safely when reducer logic changes.

Needed:

- explicit `view_version`
- automatic rebuild when stored version does not match runtime version

## RouteVN Projection Model

RouteVN should not expose one giant "whole project state" projection by default.

RouteVN should define smaller projections that match screen needs.

### Project-Level

- `project-settings(projectId)`
- `project-layouts(projectId)`
- `project-resource-collection(projectId, resourceType)`
- `project-story-index(projectId)`

### Scene-Level

- `scene-summary(projectId, sceneId)`
- `scene-detail(projectId, sceneId)`

### Overview/List Screens

For pages such as scene overview:

1. load `project-story-index(projectId)` to get ordering and ids
2. batch-load `scene-summary(projectId, sceneId)` for visible scenes
3. do not load `scene-detail(...)` unless the user opens a scene

This keeps the overview page fast and avoids loading full scene data just to show cards or rows.

## Important Modeling Rule

Overview data is a separate derived view, not a second editable source of truth.

That means:

- scene commands remain authoritative
- overview/summary projections are maintained from the same committed events
- no page-level ad hoc synchronization logic

If RouteVN temporarily stores summary data in a separate partition before the library feature exists, that partition should still be treated as a projection, not an independent domain object.

## Read Semantics

### Active Session

- committed event arrives
- affected in-memory projections update immediately
- reads are exact

### Cold Start

For a requested projection key:

1. load persisted checkpoint state
2. read persisted offset
3. load committed events after that offset
4. replay tail
5. expose exact state to caller

No stale read should be returned after the library resolves the request.

## Write Semantics

For each committed event:

1. append to committed log
2. update affected in-memory projections
3. mark affected projection keys dirty
4. schedule checkpoint flush based on configured policy

This keeps correctness immediate while allowing persistence batching.

## Partition Strategy

Partition support should get stronger, not weaker.

The library should support:

- coarse source partitions for event routing
- separate projection keys for read models
- projection reducers that only observe relevant committed events

Examples:

- `story-index` may listen to story partitions only
- `scene-summary(sceneId)` may listen to:
  - `project:<projectId>:story`
  - `project:<projectId>:story:scene:<sceneId>`
- `resource-collection(images)` may listen only to `project:<projectId>:resources:images`

This is better than loading the whole repository into memory for every read.

## Recommended Rollout

### Phase 0. Unify Event Schema

- Converge RouteVN local repository event storage on Insieme command-profile shape.
- Remove the separate local wrapper storage format.
- Treat the cut as breaking for any old local repository data.
- Keep domain commands themselves unchanged.

### Phase 1. Extend `insieme`

- Add persisted projection support to IndexedDB client store.
- Export projection helpers in browser/client entrypoints.
- Add generic committed-event reducer support.
- Add lazy hydrate/read/readMany APIs.
- Add checkpoint flush policies.
- Add versioned projection rebuild behavior.

### Phase 2. Adopt In RouteVN

- Replace RouteVN custom repository runtime replay path with library projections.
- Start with a small number of high-value projections:
  - `project-settings`
  - `project-story-index`
  - `scene-summary`
  - `scene-detail`
  - resource-type collections

### Phase 3. Reduce App-Specific Replay Logic

- Remove app-owned runtime replay code once library projections are stable.
- Keep only RouteVN-specific projection definitions and reducers.

## Success Criteria

- RouteVN local repository event storage uses the same command-profile envelope shape as Insieme sync events.
- Cold-load time for a project with 1k+ events drops from multi-second replay to near checkpoint + tail replay cost.
- Overview pages render without loading full scene detail.
- Reads are exact after hydrate resolves.
- Persisted checkpoint flushes do not happen on every event unless configured.
- Memory usage scales with active projection keys, not automatically with whole-project state.
- Projection rebuilds remain deterministic from the committed log.

## Risks

- Projection versioning mistakes can cause silent stale state if invalidation is wrong.
- Overly broad projection reducers can still recreate the current performance problem.
- Too many projection definitions can shift complexity from replay logic into projection maintenance.
- If projection keys and source partitions are mismatched, app code may accidentally hydrate too much data.

## Open Questions

- Do we want one projection API that works for both persistent stores and in-memory stores, or separate "persistent projection" wrappers?
- Should projection checkpoints be stored inside each client store implementation or in a reusable wrapper over the client-store contract?
- What is the minimum generic API needed for RouteVN and other apps without over-designing the first release?
- Do we want projection hydration progress hooks for UI feedback on very large tails?

## Final Recommendation

Build partition-aware persisted projection checkpoints into `insieme`, starting with schema unification, IndexedDB support, and generic committed-event reducers.

Then make RouteVN consume:

- project-level index/settings/resource projections
- scene summary projections for overview pages
- scene detail projections for editor pages

This keeps the command log authoritative, avoids stale reads, avoids full-project hydration, reduces cold-load replay cost, and prevents RouteVN from growing its own one-off checkpoint system.
