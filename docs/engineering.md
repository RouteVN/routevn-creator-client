# Engineering

## Purpose

This is the main architecture guide for RouteVN Creator.

It defines:

- the major layers of the app
- the intended dependency direction
- the authoritative code-placement rules
- the current canonical patterns we want to preserve

If architecture or code-placement boundaries change, update this document in
the same PR.

`AGENTS.md` is still the source of truth for coding-agent workflow rules and
coding conventions. This document should stay architecture-first.

## Stack

Frontend:

- `@rettangoli/ui`
- `@rettangoli/fe`
- `@rettangoli/vt`

Desktop shell:

- `Tauri`

Local-first collaboration:

- `insieme`

## Testing

This repo currently uses two main test styles:

- script-driven Node tests in `scripts/test-*.js`
- YAML-driven Puty tests in `tests/puty/`

Common commands:

```bash
bun run test:smoke
bun run test:integration
bun run test:convergence
bun run test:collab-adapters
bun run test:puty
```

Run one Puty scenario directly:

```bash
bunx vitest run tests/puty/<file>.spec.yaml
```

### Test Organization

- `scripts/test-smoke.js`
  broad project-state and reducer smoke coverage

- `scripts/test-integration.js`
  collaboration/session integration flows

- `scripts/test-convergence.js`
  multi-client convergence behavior

- `scripts/test-collab-adapters.js`
  collab adapter coverage

- `tests/puty/*.spec.yaml`
  SQLite-backed Insieme storage scenarios expressed declaratively in YAML

- `tests/puty/insiemeStorageScenario.js`
  shared Puty helper that runs a real RouteVN collab session against the
  SQLite sync store and returns committed rows for YAML assertions

### Puty Storage Pattern

Use Puty for storage assertions when the goal is:

- define a full command sequence in YAML
- submit it through the real collab/session path
- assert the committed events that land in SQLite

Keep the test contract declarative:

- `in`: the commands to submit, or batches of commands to submit
- `out`: the normalized committed rows expected in storage

Current Puty coverage is intentionally limited to client-owned storage
behavior:

- mixed command persistence across partitions
- storage idempotency across submit batches

## Architecture Overview

RouteVN is organized into four ownership zones:

1. UI surfaces
   - `src/pages/`
   - `src/components/`
   - `src/primitives/`
2. App-owned shared code
   - `src/internal/project/`
   - `src/internal/ui/`
   - small pure helpers in `src/internal/`
3. Services
   - `src/deps/services/`
4. Clients
   - `src/deps/clients/`

The intended dependency direction is:

```text
pages/components/primitives
-> internal/ui
-> appService / projectService
-> deps/services
-> deps/clients

internal/ui -> internal/project
deps/services -> internal/project
```

Not every path needs every layer. The important rule is ownership:

- UI-facing shared glue goes in `src/internal/ui/`
- pure project meaning goes in `src/internal/project/`
- handler-facing facades and service adapters go in `src/deps/services/`
- low-level platform/external adapters go in `src/deps/clients/`

High-level rules:

- views stay declarative
- stores hold UI-local state and derived display data
- handlers orchestrate
- `src/internal/ui/` owns shared page/store/handler orchestration
- `src/internal/project/` owns project meaning and invariants
- `src/internal/project/` stays intentionally merged into a small number of
  files, not many sparse helpers
- small pure app-owned helpers that are neither project semantics nor UI
  orchestration stay in `src/internal/`
- `src/deps/services/` owns service behavior and service adapters
- `src/deps/clients/` owns low-level platform/external clients
- setup entry points create dependencies

## Runtime Entry Points

- web: `src/setup.web.js`
- desktop: `src/setup.tauri.js`

These entry points are responsible for:

1. creating client dependencies
2. creating services
3. exposing dependencies through `deps`
4. registering browser primitives

Handlers must not create dependencies themselves.

## Core Flows

### Route And Repository Flow

Preferred flow:

```text
route change
-> app-level route orchestration resolves path + payload
-> if the route needs a project repository, projectService ensures it
-> target page mounts
-> project-backed pages subscribe to project state
-> selectors derive view data
-> render
```

Page handlers should not repeat route-level repository boot logic.

### Project-Backed Page Rendering

Repository state is the authoritative source of truth for project-backed pages.

Preferred flow:

```text
command or remote collab event
-> repository state changes
-> projectService emits subscribed state update
-> page store updates subscribed snapshot
-> selectors derive view data
-> render updates
```

Avoid this older pattern:

```text
mutation
-> page calls refresh handler
-> page copies repository slices manually
-> render
```

`projectService.subscribeProjectState(...)` is synchronous and assumes
app-level orchestration already ensured the repository before page mount.

### Collaboration Flow

Preferred flow:

```text
collab session receives committed remote event
-> repository state updates
-> subscribed pages rerender from repository state
-> optional normalized collab events are published for page-owned policy
```

Important boundary:

- collab runtime must not scan the DOM for mounted pages
- collab runtime must not know page tags or handler names
- page refresh policy belongs in page/family orchestration while the repo is
  still migrating to repository-driven rendering

### Scene Editing Flow

Preferred structure:

```text
editableText primitive
-> linesEditor component
-> internal/ui scene editor helpers
-> sceneEditor page
-> projectService / internal/project
```

This keeps low-level caret and contenteditable behavior separate from
scene-specific workflows.

## Code Placement

### Top-Level Source Folders

- `src/pages/`
  Route-level screens and screen-specific orchestration.

- `src/components/`
  Reusable UI building blocks.

- `src/primitives/`
  Browser-native custom elements and low-level DOM wrappers.

- `src/internal/`
  App-owned shared logic.
  `src/internal/project/` is reserved for pure project semantics and should
  stay intentionally small and flat:
  - `commands.js`
  - `state.js`
  - `projection.js`
  - `tree.js`
  - `layout.js`
    `src/internal/ui/` is the only shared home for page/store/handler
    orchestration that does not belong inside one page folder.

- `src/deps/services/shared/`
  Shared handler-facing and internal service logic.

- `src/deps/services/web/`
  Web-specific service adapters.

- `src/deps/services/tauri/`
  Desktop-specific service adapters.

- `src/deps/clients/`
  Low-level platform and external adapters such as router, DB, pickers,
  updater, file processing, and template loading.

- `src/deps/services/shared/collab/`
  Shared collaboration/session logic.

- `src/deps/services/web/collab/`
  Web transport/runtime-specific collaboration wiring.

Detailed “when adding X, put it here” contribution rules belong in `AGENTS.md`.
This document should explain the shape of the architecture, not act as a
contribution checklist.

Deprecated folders:

- `src/deps/features/` is a legacy location. Do not add new code there. Shared
  page/store/handler orchestration belongs in `src/internal/ui/`.
- `src/deps/infra/` is a legacy location. Do not add new code there. Low-level
  platform/external adapters belong in `src/deps/clients/`.

### Public Service Facades

UI handlers should normally talk only to:

- `appService`
- `projectService`

#### `appService`

Handler-facing facade for:

- navigation
- dialogs and toasts
- dropdowns
- user config
- project entry management
- file picking
- app/platform metadata

#### `projectService`

Handler-facing facade for:

- repository access
- command submission
- asset upload and retrieval
- collaboration sessions
- export/bundle operations

Handlers should not orchestrate multiple internal services directly when those
concerns belong behind one of these facades.

Service boundary test:

- if code needs store setters/selectors, refs, `render()`, or page event
  payloads, it is not service code; it belongs in `src/internal/ui/` or a page
- if code wraps router, DB, file picker, updater, browser storage, or similar
  external/platform APIs, it is client code; it belongs in `src/deps/clients/`

### Placement Decision Order

When deciding where new code goes, apply these rules in order:

1. If it owns one route or screen, put it in `src/pages/`.
2. If it is reusable visual UI, put it in `src/components/`.
3. If it owns low-level DOM or browser-native behavior, put it in
   `src/primitives/`.
4. If it is shared UI/page/store/handler glue and may touch refs, render,
   stores, RxJS, `appService`, `projectService`, or event subjects, put it in
   `src/internal/ui/`.
5. If it changes project meaning, command semantics, state semantics,
   projection, tree behavior, or layout semantics, put it in
   `src/internal/project/`.
6. If it is a small pure app-owned helper that is not project-specific and not
   UI orchestration, put it in `src/internal/`.
7. If it is a handler-facing service or a service adapter, put it in
   `src/deps/services/`.
8. If it is a low-level platform/external adapter, put it in
   `src/deps/clients/`.

If something does not fit cleanly, do not invent a new top-level bucket. Refine
one of these existing boundaries instead.

## Stable Boundaries

### UI Structure

Most pages and many components use Rettangoli’s fixed file pattern:

- `*.view.yaml`
- `*.store.js`
- `*.handlers.js`

The intended split is:

- `view`: declarative structure
- `store`: UI-local state and derived display data
- `handlers`: orchestration

### Handler Lifecycle State

Handler modules must be safe for multiple mounted instances at the same time.

Do not use:

- module-scoped mutable runtime state in `*.handlers.js`
- `refs.__...Runtime`
- cleanup functions, callbacks, or service instances in store

Preferred options:

- `handleBeforeMount` cleanup closures when one lifecycle owns the state
- RxJS streams/subscriptions for project or collab lifecycles
- RxJS stream composition for short-lived app-level event windows such as key
  chords
- explicit top-level store fields only for plain local values such as timer ids
  or cache entries

### Browser Side Effects

Page and component handlers must not reach for browser globals directly for
cross-cutting side effects such as:

- global focus changes
- history manipulation
- global listeners
- DOM queries outside the local owned surface

Put those behind:

- `src/deps/services/shared/*`
- `src/deps/clients/*`
- `src/primitives/*`

Allowed exceptions:

- local DOM behavior inside a primitive
- local DOM behavior inside a component that owns that DOM editing/interaction
  surface

### Project Rule Ownership

`src/internal/project/` owns:

- project meaning
- command semantics
- invariants
- state projection
- tree behavior
- layout semantics

It is intentionally constrained to five canonical files:

- `commands.js`
- `state.js`
- `projection.js`
- `tree.js`
- `layout.js`

Prefer merging related project helpers into those files over creating sparse
new `src/internal/project/*` modules.

If a rule changes what a project means, it belongs in `src/internal/project/`, not in
stores or handlers.

### Domain Command Family Direction

Project-authored collection items should converge on the generic
`resource.*` family unless they are truly document-internal structures.

Use `resource.*` for collection-level lifecycle such as:

- create
- rename
- move/reorder
- delete
- duplicate

This applies to normal resource collections and also to authored collections
such as:

- `variables`
- `layouts` at the collection/item level

Keep separate command families only where the structure is not just a
collection item lifecycle. Current examples:

- `scene.*`
- `section.*`
- `line.*`
- `character.sprite.*`
- `layout.element.*`

The intended model is:

- `variables` belong under the generic resource family
- `characters` use `resource.*` for character lifecycle
- `character.sprite.*` remains separate for internal character sprite tree editing
- `layouts` should also use `resource.*` for collection lifecycle
- `layout.element.*` remains separate for internal layout document editing

### Platform Ownership

Platform-specific differences belong in:

- `src/deps/clients/*`
- `src/deps/services/web/*`
- `src/deps/services/tauri/*`

Do not scatter platform conditionals through page handlers or domain code.

### Project Data Ownership

Project `name`, `description`, and `iconFileId` are owned by app-level project
entries, not repository state.

That means:

- use `appService` / project entry helpers for those fields
- do not treat repository state as the source of truth for project metadata

## Current Canonical Patterns

These are the current patterns we want new work to align with. They are more
implementation-shaped than the stable boundaries above, so they may evolve over
time, but they are the current standard.

### Resource Pages

Resource pages should stay explicit at the page level.

Do not hide an entire resource page behind one giant page factory or one
universal layout abstraction.

Preferred structure:

- page YAML stays in `src/pages/<page>/`
- reusable center-pane UI lives in `src/components/`
- shared page-family orchestration lives in
  `src/internal/ui/resourcePages/`

Current resource page families:

- `src/components/mediaResourcesView/`
- `src/internal/ui/resourcePages/media/`
- `src/components/catalogResourcesView/`
- `src/internal/ui/resourcePages/catalog/`

Current custom resource center components:

- `src/components/charactersResourcesView/`
- `src/components/typographyResourcesView/`

Shared page-family helpers may own:

- repeated store shape
- repeated handler wiring
- shared selection/search/edit orchestration

They must not absorb:

- route structure
- page-specific overlays and dialogs
- file picking and uploads
- repository mutations
- project rules that belong in services or `src/internal/project/`

Resource center components must stay presentational.

### Scene Editor

Current scene-editing pattern:

- `src/primitives/editableText.js`
  low-level contenteditable/caret behavior
- `src/components/linesEditor/`
  UI-only editing surface
- `src/internal/ui/sceneEditor/`
  scene-editing workflows and line view-model shaping
- `src/pages/sceneEditor/`
  page orchestration, preview/canvas, dialogs, and asset loading

Keep `linesEditor` in its fixed Rettangoli component files.
Do not add ad hoc sibling helper files inside the component folder when the
logic is really scene-editing orchestration.

`linesEditor` must not own:

- repository or domain reads
- project service orchestration
- split/merge/create/delete persistence workflows
- scene-specific badge/preview shaping

### Collaboration Runtime

`src/deps/services/web/collabBootstrapService.js` is a web-runtime composition
layer only.

It may:

- create the web project service
- create the collab connection runtime
- publish normalized remote collab events
- expose debug helpers when enabled

It must not:

- scan the DOM for mounted pages
- know page tags or page handler names
- call page handlers directly
