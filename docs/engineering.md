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
