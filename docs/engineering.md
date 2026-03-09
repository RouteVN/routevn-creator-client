# Engineering

## Purpose

This document is the authoritative engineering guide for RouteVN Creator.

It defines:

- how the codebase is organized
- where new code should go
- which boundaries must be preserved
- the engineering rules that keep the repo maintainable

If code structure or engineering boundaries change, this document must change in the same PR.

For development setup, local run commands, and desktop build steps, use the runbooks in `docs/runbooks/`.

`AGENTS.md` defines repo-specific working instructions for coding agents and is the single source of truth for coding conventions in this repository.

This repo is heavily written and maintained with AI coding agents.
It started with Claude Code.
As of this writing, Codex is the recommended agent for working in this repository.

## Stack

This project uses the Rettangoli stack for the frontend:

- `@rettangoli/ui`
  UI component library
- `@rettangoli/fe`
  Frontend framework
- `@rettangoli/vt`
  Visual testing

Desktop development uses Tauri:

- `Tauri`
  Desktop shell, native packaging, and platform integration

Local-first collaborative behavior uses Insieme:

- `insieme`
  Command/event sync, local-first storage, and collaboration foundations

## File Structure

```text
.
├── static/
├── scripts/
├── src/
│   ├── components/
│   ├── pages/
│   ├── primitives/
│   ├── deps/
│   │   ├── features/
│   │   ├── infra/
│   │   └── services/
│   │       ├── shared/
│   │       ├── web/
│   │       └── tauri/
│   ├── domain/
│   ├── collab/
│   └── utils/
├── src-tauri/
└── vt/
```

### Static And Build Inputs

- `static/`
  HTML entrypoints and static assets copied directly into the built site.

- `scripts/`
  Build scripts, test scripts, and local tooling utilities.

### Application Source

- `src/components/`
  Reusable UI components.

- `src/pages/`
  Route-level pages and screen-specific logic.

- `src/primitives/`
  Registered browser primitives such as custom elements that wrap low-level DOM behavior.

- `src/deps/infra/`
  Low-level platform integrations such as router, DB, file system, pickers, and updater hooks.

- `src/deps/features/`
  Shared feature-level orchestration helpers used by handlers when code is not a UI component, domain rule, or public service facade.

- `src/deps/services/`
  Handler-facing and internal services.

- `src/deps/services/shared/`
  Shared service logic used by both web and desktop runtimes.

- `src/deps/services/web/`
  Web-specific service adapters.

- `src/deps/services/tauri/`
  Tauri-specific service adapters.

- `src/domain/`
  Domain model, command processing, state projection, invariants, and tree helpers.

- `src/collab/`
  Collaboration and sync runtime built around command/event flow.

- `src/utils/`
  Narrow utilities that do not belong in domain or service layers.

### Platform-Specific Runtime

- `src-tauri/`
  Rust/Tauri application shell, packaging, and native desktop integration.

### Visual Testing

- `vt/`
  Visual testing inputs and templates used with `@rettangoli/vt`.

## Top-Level Shape

- `src/pages/`
  Route-level screens. Pages usually follow the Rettangoli `view/store/handlers` pattern.

- `src/primitives/`
  Browser-native custom elements and low-level DOM wrappers used when behavior does not fit Rettangoli component files.

- `src/components/`
  Reusable UI building blocks. Components can also use `view/store/handlers` when they own interaction state.

- `src/deps/infra/`
  Low-level platform integrations such as DB, file pickers, router, updater, and storage adapters.

- `src/deps/features/`
  Shared feature orchestration helpers that can be reused across pages without turning them into components or public services.

- `src/deps/services/`
  Application services used by handlers.

- `src/domain/`
  Domain model, command processing, state projection, and invariants.

- `src/collab/`
  Collaboration runtime, transport, and sync behavior.

- `src/utils/`
  Narrow utilities such as file processing, bundling, and template loading.

- `static/`
  HTML entrypoints and static assets copied into `_site/`.

- `src-tauri/`
  Native desktop shell and Rust/Tauri integration.

- `vt/`
  Visual test templates and support files.

## Runtime Entry Points

- Web setup: `src/setup.web.js`
- Desktop setup: `src/setup.tauri.js`

These entry points are responsible for:

1. creating infrastructure dependencies
2. creating services
3. exposing dependencies through `deps`
4. registering browser primitives needed by the UI runtime

Handlers must not build dependencies themselves.

## UI Structure

Most pages and many components use:

- `*.view.yaml`
- `*.store.js`
- `*.handlers.js`

The split is:

- `view`: structure
- `store`: UI state and derived display data
- `handlers`: orchestration

Handlers must stay thin.
Stores must not absorb domain logic.
Views must stay declarative.

## Handler Runtime State

Do not keep mutable module-scoped runtime state in `*.handlers.js`.

Forbidden:

- module-level subscription cleanup refs
- module-level timers
- module-level mutable caches or drag state
- cross-instance mutable `let` state in handler files

If handler runtime state must survive across lifecycle hooks, keep it per
instance:

- prefer the `handleBeforeMount` cleanup closure when the state is owned there
- prefer RxJS streams/subscriptions for async project or collab lifecycles
- use explicit top-level store fields only for plain local values such as timer
  ids or cache entries

Do not store handler runtime state on `refs.__...Runtime`.
Do not store cleanup functions, callbacks, or service instances in store.

The preferred pattern for project-backed pages is:

```text
handleBeforeMount
-> mount RxJS subscriptions
-> subscribe to project state via createProjectStateStream(...)
-> sync plain store data
-> render
```

Do not use `handleAfterMount` plus stored unsubscribe handles on refs/store just
to keep project state in sync.

Handler module files must be safe for multiple mounted instances at the same
time.

## JavaScript Style

Prefer `undefined` over `null`.

Use `undefined` for:

- missing optional values
- cleared references
- absent handler payload fields
- uninitialized local variables that will be assigned later

Do not introduce new `null`-based state or payload conventions unless a
specific external API requires `null`.

## Repository-Driven Rendering

For project-backed pages, repository state is the authoritative source of truth.

Preferred flow:

```text
command or remote collab event
-> repository state changes
-> projectService emits subscribed state update
-> page store updates its subscribed snapshot
-> selectors derive view data
-> render updates
```

Prefer this over:

```text
mutation
-> page calls refresh handler
-> page copies repository slices manually
-> render
```

Use `projectService.subscribeProjectState(...)` for project-backed pages.
This subscription API is synchronous and assumes app-level route orchestration
already ensured the repository before the page mounted.

Page stores should keep:

- subscribed repository/domain snapshot needed for selectors
- UI-local state such as selection, search, dialog open state, hover state,
  zoom, or editor mode

Page handlers should not be responsible for manually refreshing copied
repository data after every mutation. If the repository changes, subscribed
pages should update from that change naturally.

## Browser Side Effects

Page and component handlers must not reach for browser globals directly for
cross-cutting side effects such as:

- `document.activeElement.blur()`
- `window.addEventListener(...)`
- `document.querySelector(...)` outside local component DOM ownership
- global focus, history, or viewport manipulation

Those side effects must live behind an explicit dependency or primitive:

- `src/deps/services/shared/*` when the behavior is app-shell/browser
  orchestration
- `src/deps/infra/*` for low-level platform adapters
- `src/primitives/*` for DOM-heavy browser primitives such as custom elements

This keeps page handlers orchestration-only and prevents hidden browser
coupling from spreading through route code.

Allowed exceptions:

- local DOM work inside a primitive
- local DOM work inside a reusable component when that DOM is the component's
  owned editing or interaction surface

If a page handler needs to affect browser state, add a method to `deps` and
call that method instead of touching `window` or `document` directly.

## Resource Page Pattern

Resource pages should stay explicit at the page level.

Do not hide an entire resource page behind one large page factory or one generic layout abstraction.

The preferred structure is:

- page YAML stays in `src/pages/<page>/`
- reusable center-pane UI lives in `src/components/`
- shared page-family orchestration lives in `src/deps/features/resourcePages/`

Current family pattern:

- `src/components/mediaResourcesView/`
  UI-only center-pane component for media-style resource pages
- `src/deps/features/resourcePages/media/`
  shared store/handler helpers for media-family pages
- `src/components/catalogResourcesView/`
  UI-only center-pane component for catalog-style resource pages
- `src/deps/features/resourcePages/catalog/`
  shared store/handler helpers for catalog-family pages

Outlier resource pages may keep their own center-pane components when they do
not fit a stable shared family.

Current custom resource center components:

- `src/components/charactersResourcesView/`
  UI-only center-pane component for the characters page
- `src/components/typographyResourcesView/`
  UI-only center-pane component for the typography page

Page-family helpers should own:

- repeated page-store shape
- repeated page handler wiring
- shared selection/search/edit orchestration

They should not absorb:

- route structure
- page-specific dialogs and overlays
- page-specific upload payload mapping
- domain rules that belong in services or `src/domain/`

Resource center components must stay presentational.

They may own:

- local UI state such as hover, collapse, zoom, and context menu display
- rendering normalized item cards
- emitting generic events such as `item-click`, `item-preview`, `upload-click`

They must not own:

- file picking
- uploads
- repository mutations
- resource-type-specific service orchestration

When a set of resource pages shares the same interaction model, add a family-specific component and shared feature helpers.
Do not force unrelated resource pages into one universal resource-page system.

## Scene Editor Pattern

Scene editing uses three layers:

- `src/primitives/editableText.js`
  low-level contenteditable/caret behavior
- `src/components/linesEditor/`
  UI-only editing surface for line focus, keyboard handling, caret movement,
  and semantic editor events
- `src/deps/features/sceneEditing/`
  shared scene-editing workflows such as line mutations, dialogue queue
  coordination, and line view-model shaping
- `src/pages/sceneEditor/`
  page orchestration, asset loading, preview/canvas rendering, and dialogs

Current scene-editing feature modules:

- `lineViewModels.js`
  builds enriched line view models for the editor surface
- `lineOperations.js`
  owns split/merge/new/paste/swap flows and dialogue queue writes
- `runtime.js`
  owns scene-editor runtime concerns such as asset loading, canvas rendering,
  preview reset, and render subscriptions
- `sectionOperations.js`
  owns section selection, section creation, and section-selection reconciliation

Keep `linesEditor` in its fixed Rettangoli component files.
Do not add ad hoc sibling helper files inside the component folder when the
logic is really scene-editing orchestration.

`linesEditor` must not own:

- repository or domain state reads
- project service orchestration
- split/merge/create/delete persistence workflows
- scene-specific preview and badge shaping

Those responsibilities belong in `src/deps/features/sceneEditing/` and
`src/pages/sceneEditor/`.

`sceneEditor.handlers.js` should stay as the page composition layer.
It may export many handlers because of the framework contract, but the heavy
work should be delegated into `src/deps/features/sceneEditing/`.

## Public Service Facades

UI handlers should normally talk to only:

- `appService`
- `projectService`

Handlers should not orchestrate multiple internal sub-services directly.

### `appService`

`appService` is the handler-facing facade for:

- navigation
- dialogs, toasts, and dropdowns
- user config
- project entry management
- file picking
- app and platform metadata

### `projectService`

`projectService` is the handler-facing facade for:

- repository access
- command submission
- asset upload and retrieval
- collaboration sessions
- bundle and export operations

## Layer Boundaries

### Domain

`src/domain/` is the source of truth for domain behavior.

Put these concerns there:

- state shape
- command semantics
- invariants
- state projection

If a rule changes what a project means, it belongs in `src/domain/`, not in handlers or stores.

### Collaboration

`src/collab/` owns synchronization behavior.

Put these concerns there:

- transport logic
- session lifecycle
- committed event flow
- sync protocol behavior

Page handlers must not know protocol details.

`src/deps/services/web/collabBootstrapService.js` must stay a web-runtime
composition layer only:

- create the web project service
- create the collab connection runtime
- publish normalized remote collab events
- expose debug helpers when enabled

It must not:

- scan the DOM for mounted pages
- know page tags or handler names
- call page handlers directly

During the migration to repository-driven rendering, page-owned refresh policy
belongs in page handlers or shared page-family helpers. If a page still needs a
remote refresh bridge, subscribe to normalized collab events in the page layer.

### Platform-Specific Logic

Platform differences belong in:

- `src/deps/infra/*`
- `src/deps/services/web/*`
- `src/deps/services/tauri/*`

Do not scatter platform conditionals through handlers or domain code.

## Data Ownership Boundaries

- Project `name`, `description`, and `iconFileId` are owned by app-level project entries, not repository state.
- `appService` and `projectService` are the only intended public service facades for UI handlers.
- Platform-specific differences belong in adapters, not in page logic.

## Where New Code Goes

### Add a route or page

Put it in `src/pages/<page-name>/` with:

- `<page>.view.yaml`
- `<page>.store.js`
- `<page>.handlers.js`

### Add a reusable component

Put it in `src/components/<component-name>/`.

If it is not truly reusable, keep it close to the page instead of forcing an abstraction.

### Add a domain rule

Put it in `src/domain/`.

### Add platform-specific behavior

Put it in:

- `src/deps/infra/*` for low-level primitives
- `src/deps/services/web/*` or `src/deps/services/tauri/*` for service adapters

### Add shared feature orchestration

Put it in:

- `src/deps/features/*` when the code is shared across pages, stays above domain rules, and is not part of the public `appService` / `projectService` facade

### Add service behavior

If it belongs in the handler-facing API, put it behind:

- `appService`
- `projectService`

Prefer extending an existing coarse module over adding a random helper file.
