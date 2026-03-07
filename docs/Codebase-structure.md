# Codebase Structure

This document explains how the RouteVN Creator client is organized today and where new code should go.

## Goals

- Keep handlers simple.
- Keep page APIs stable.
- Keep platform-specific code behind adapters.
- Keep domain and collaboration logic out of UI files.

## Top-Level Shape

- `src/pages/`
  Route-level screens. Each page usually follows the Rettangoli `view/store/handlers` pattern.

- `src/components/`
  Reusable UI building blocks. Components can also follow `view/store/handlers` when they own interaction state.

- `src/deps/infra/`
  Low-level platform integrations such as DB, file pickers, router, updater, and storage adapters.

- `src/deps/services/`
  Application services used by handlers.

- `src/domain/`
  Domain model, state projection, and command-processing logic.

- `src/collab/`
  Collaboration client/runtime logic.

- `src/utils/`
  Narrow utilities such as file processing, bundling, and template loading.

- `static/`
  HTML entrypoints and static assets copied into `_site/`.

- `src-tauri/`
  Native desktop shell and Rust/Tauri integration.

- `vt/`
  E2E/runtime templates and testing support.

- `docs/`
  Maintainer docs and the current platform spec.

## Runtime Entry Points

- Web setup: `src/setup.web.js`
- Desktop setup: `src/setup.tauri.js`

These files wire the runtime together:

1. create infrastructure dependencies
2. create services
3. expose page/component dependencies through `deps`

Handlers should not build dependencies themselves.

## UI Pattern

Most pages and many components use three files:

- `*.view.yaml`
  Declarative UI structure.

- `*.store.js`
  Local UI state and derived data.

- `*.handlers.js`
  Event orchestration only.

The intended split is:

- `view`: structure
- `store`: UI state and derived display data
- `handlers`: orchestration

Do not put domain rules or storage details into handlers if they can live in services.

## Main Service Facades

Handlers should normally talk to only two high-level services:

- `appService`
- `projectService`

This is intentional. We do not want handler-level orchestration across many internal services.

### `appService`

`appService` is the handler-facing facade for:

- navigation
- dialogs/toasts/dropdowns
- user config
- project entry management
- file picking
- app/platform/updater metadata

Current internal structure:

- `src/deps/services/shared/appServiceCore.js`
  Small facade composer.
- `src/deps/services/shared/appShellService.js`
  Router, UI shell, updater, app/platform info.
- `src/deps/services/shared/projectEntriesService.js`
  Local project list, current project entry, icon loading, create/open/import orchestration.
- `src/deps/services/shared/fileSelectionService.js`
  File picker contract, validations, optional upload glue.
- `src/deps/services/shared/userConfigService.js`
  Persistent user config reads and writes.

Platform wrappers:

- `src/deps/services/appService.js`
- `src/deps/services/web/appService.js`

Those wrappers should stay thin and only provide platform-specific adapters.

### `projectService`

`projectService` is the handler-facing facade for:

- repository access
- command API access
- asset upload and retrieval
- version management
- collaboration sessions
- bundle/export operations

Current internal structure:

- `src/deps/services/shared/projectServiceCore.js`
  Small facade composer.
- `src/deps/services/shared/projectRepositoryService.js`
  Repository/store lookup, cache, current project binding.
- `src/deps/services/shared/projectAssetService.js`
  File storage orchestration, image/audio/video/font processing, metadata helpers.
- `src/deps/services/shared/projectExportService.js`
  Bundle and ZIP export operations.
- `src/deps/services/shared/projectCollabCore.js`
  Collaboration session lifecycle and command-session behavior.

Platform wrappers:

- `src/deps/services/projectService.js`
- `src/deps/services/web/projectService.js`

Platform adapters:

- `src/deps/services/tauri/projectServiceAdapters.js`
- `src/deps/services/web/projectServiceAdapters.js`

These adapter files are where platform-specific storage, file IO, and collab transport behavior should live.

## Domain and Collaboration Layers

### Domain

`src/domain/` is the source of truth for domain behavior.

Important responsibilities:

- domain state shape
- command processing
- state projection
- invariants and command semantics

If a rule changes what a project means, it belongs in `domain`, not in page handlers.

### Collaboration

`src/collab/` owns synchronization behavior.

Important responsibilities:

- client/server sync model
- transport logic
- committed event flow
- session lifecycle internals

Page handlers should not know collaboration protocol details.

## Storage and Assets

The project runtime is event-sourced.

- Event/state runtime:
  - shared repository logic in `src/deps/services/shared/projectRepository.js`
  - browser storage through IndexedDB adapters
  - desktop storage through SQLite/Tauri adapters

- Asset binaries are stored separately from the event log.

- Browser and desktop use different persistence mechanisms, but handler-facing APIs should stay the same.

## How Data Flows

Typical flow for a UI action:

1. user triggers a page/component handler
2. handler calls `appService` or `projectService`
3. service delegates to shared core and, if needed, platform adapter
4. shared repository/domain/collab layers perform the real change
5. page store recomputes derived UI state
6. view re-renders

The important rule is that the handler should orchestrate, not implement.

## Where New Code Should Go

### Add a new route/page

Put the page in `src/pages/<page-name>/` with:

- `<page>.view.yaml`
- `<page>.store.js`
- `<page>.handlers.js`

Then wire the route in the app page/router setup.

### Add a reusable UI widget

Put it in `src/components/<component-name>/`.

If the component becomes page-specific, move the logic back to the page instead of creating a fake reusable abstraction.

### Add a new domain rule

Put it in `src/domain/`.

Do not hide domain rules in handlers or stores.

### Add platform-specific behavior

Put it in:

- `src/deps/infra/*` for low-level platform primitives
- `src/deps/services/tauri/*` or `src/deps/services/web/*` for service adapters

Do not branch platform logic repeatedly inside page handlers.

### Add service behavior

Ask first:

1. is this handler orchestration?
2. is this domain logic?
3. is this platform-specific IO?

If it is service logic, put it behind the existing facade:

- `appService`
- `projectService`

Prefer extending an existing coarse internal module over adding a random new helper file.

## Rules For Keeping This Maintainable

- Keep handler dependencies shallow.
  Handlers should not reach into internal sub-services.

- Keep platform wrappers thin.
  They should compose adapters, not re-implement shared logic.

- Keep shared cores small.
  They should compose internal modules, not become god files again.

- Keep domain logic out of stores and handlers.

- Keep docs current when moving boundaries.
  If service ownership changes, update this document in the same PR.

## Current Boundaries To Respect

- `project name`, `description`, and `iconFileId` are owned by app-level project entries, not repository state.

- `appService` and `projectService` are the only intended public service facades for UI handlers.

- Platform-specific differences belong in adapters, not scattered conditionals across the codebase.

## Reading Order For New Maintainers

If you are new to the repo, read in this order:

1. `README.md`
2. `docs/Codebase-structure.md`
3. `docs/platform/README.md`
4. `src/setup.web.js` and `src/setup.tauri.js`
5. `src/pages/app/*`
6. `src/deps/services/shared/*`
7. `src/domain/*`
8. `src/collab/*`
