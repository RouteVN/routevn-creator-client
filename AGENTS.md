# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Read First

Before making changes, read these repo docs:

- `docs/product.md` for product principles and UX direction
- `docs/engineering.md` for stack, file structure, and engineering boundaries

`AGENTS.md` is the source of truth for coding conventions and agent workflow rules.

## Commands

Build the web app:

```bash
bun run build:web
```

This command:

1. Removes the existing `_site` directory
2. Copies static files from `static/` to `_site/`
3. Runs the Rettangoli CLI to build the frontend bundle to `_site/public/main.js`

Notes:

- `bun run build` may not exist in this repo; use `build:web` for validation.
- Do not run `bun run build:web` after each change. The user is expected to be running a watch-mode session during active development.
- Before pushing, run lint/format checks (the push hook also enforces this).

Run tests:

```bash
bun run test:smoke
bun run test:integration
bun run test:convergence
bun run test:collab-adapters
bun run test:puty
```

Notes:

- `bun run test:puty` runs the YAML-based Puty storage suite in `tests/puty/`.
- Run a single Puty scenario with `bunx vitest run tests/puty/<file>.spec.yaml`.
- The Puty suite is the preferred place for SQLite-backed storage assertions:
  input commands live in YAML `in`, expected committed rows live in YAML `out`.
- The shared Puty helper for storage scenarios is `tests/puty/insiemeStorageScenario.js`.
- The `scripts/test-*.js` files remain the home for non-Puty runtime,
  integration, convergence, and command-contract coverage.

## Architecture

This project uses a custom frontend framework based on 3 component files: view, store, handlers:

Read the links from the following files to familiarize with the code before starting to write any code.

- [Overview](https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/overview.md)
- [View](https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/view.md)
- [State Management](https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/store.md)
- [Handlers](https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/handlers.md)

If you need deeper or broader Rettangoli framework reference material, use
`https://rettangoli.dev/llms.txt` as the framework reference index.

## JavaScript Style

- Prefer direct property access or nullish coalescing (`??`) for defaults.
- Use `??` for default values instead of `||` when setting state/object fields.
- Avoid defensive `typeof x === "string" ? x : ""` patterns unless runtime type narrowing is truly required.
- Prefer `undefined` over `null`.
- Avoid explicit `= null` initialization; use `let value;` when a later assignment is expected.
- If state already guarantees a value, use it directly instead of re-normalizing with fallback checks.
- Do not build objects with conditional object-spread patterns such as `...(condition ? { field } : {})` or nested spread-based payload builders. Build a local object and assign fields explicitly.

## Layering

- Keep page/component handlers simple and orchestration-focused.
- Push domain logic, validation, and async complexity into services.
- Route-level async setup/loading should be handled in app-level orchestration, not repeated in page handlers.
- Prefer single-purpose store actions (`setCurrentProject`, etc.) over multiple related setter calls.
- Do not call browser globals like `document` or `window` directly from page handlers for cross-cutting side effects.
- If a handler needs browser-side behavior such as blurring the active element, global focus changes, history changes, or global listeners, route that through `deps/services` or `deps/clients`.
- Keep low-level DOM-heavy behavior in `src/primitives/` or in components that own that DOM surface directly.
- `src/internal/ui/` is the shared home for app-owned page/store/handler orchestration.
- `src/internal/project/` is reserved for pure project semantics only.
- Small pure app-owned helpers that are neither project semantics nor UI orchestration belong in `src/internal/`.
- `src/deps/features/` and `src/deps/infra/` are legacy folders. Do not add new code there.

## Detail Panel Pattern

- Use `rvn-detail-view` for read-only right panels (instead of read-only forms).
- Build read-only data in store as `detailFields` (types: `text`, `description`, `slot`).
- Prefer `text` over `text-inline` unless explicitly required.
- Keep custom interactive UI (preview button, lists, actions) as slots inside `rvn-detail-view`.
- Place panel title/header outside `rvn-detail-view` when needed.
- For edit flows, use a dialog form opened from the detail panel (do not edit inline in read-only detail view).
- When opening edit dialogs, prefill explicitly after render:
  - `editForm.reset()`
  - `editForm.setValues({ values })`

## Handler Simplicity

- Do not add dynamic form method wrappers (for example, `callFormMethod`) or retry loops to wait for refs.
- Call known methods directly (`formRef.reset()`, `formRef.setValues(...)`).
- Avoid defensive guard noise when data contract is already stable.
- Define/deconstruct refs at the top of handlers for clarity.
- Do not use module-scoped mutable runtime state in `*.handlers.js` (`let cleanupX`, timers, mutable caches, drag state, etc).
- Do not store handler runtime state on `refs.__...Runtime`.
- For async project or collab subscriptions, prefer RxJS streams/subscriptions mounted from `handleBeforeMount`.
- For plain local non-render values that must survive within one mounted instance, prefer top-level store fields with explicit actions/selectors over handler-owned runtime bags.
- Do not store cleanup functions, callbacks, or service instances in store.
- Use store only for plain local values in this case (for example timer ids, cache entries, pending ids).
- For project-backed page sync, prefer `createProjectStateStream(...)` over `handleAfterMount` + stored unsubscribe handles.
- `projectService.subscribeProjectState(...)` is synchronous and assumes app/route orchestration has already ensured the repository.
- For short-lived app-level event windows such as key chords, prefer RxJS stream composition over handler-owned timer/runtime bags.
- Use one canonical event payload shape per handler; remove multi-fallback id extraction once event contract is known.
- If two UIs emit similar events with different responsibilities (for example left explorer vs right list), use separate handlers to avoid recursion and side effects.

## UX/Error Handling

- Do not silently swallow errors with `console.error` only for user actions; show user-facing feedback via `appService.showToast(...)`.
- Prefer stable, explicit toast messages over raw `error?.message` text.
- If async picker/upload fails, toast and return early. Do not continue with partial state.

## Event/Data Access

- For project click handlers, read project ids from `event.currentTarget.dataset.projectId` only.
- Do not parse ids from element `id` as a fallback.
- In stable handlers, prefer direct destructuring from event detail (for example `const { itemId } = payload._event.detail`).

## File Picker Contract

- Use `appService.pickFiles(...)` as the single entry point for selecting files in handlers.
- `multiple: false` returns a single file object or no value (cancelled), not an array.
- `multiple: true` returns an array.
- Use picker-level validations: `validations: [{ type: "square" }]` instead of duplicating inline handler validation.
- Use picker-level upload when needed: `upload: true`.
- When `upload: true`, read upload metadata from the returned file object (`uploadSucessful` and `uploadResult`) instead of calling upload service directly in handlers.

## Selection Sync Rules

- When selecting an item in custom center/right views, sync left explorer selection with `fileExplorer.selectItem({ itemId })`.
- Folder selections should clear item selection with `undefined`, not `null`.
- Hover styling must not override selected styling.

## Resource Target Support

- When enabling a `repositoryTarget` in file explorer, ensure all relevant actions support it:
  - create folder
  - rename
  - delete
  - duplicate
  - move/reorder (`handleTargetChanged`)
- `variables` supports folder tree operations, including drag/drop move.

## Project Data Ownership

- Project `name`, `description`, and `iconFileId` are owned by local project DB entries (app-level project entries), not repository/insieme state.
- Prefer synchronous project context reads via app service cache (`getCurrentProjectEntry`, current project id helpers) in page handlers.

## Where New Code Goes

### Add a page

Put it in `src/pages/<page-name>/` with:

- `<page>.view.yaml`
- `<page>.store.js`
- `<page>.handlers.js`

If it is a route-level page, also wire it into:

- `src/pages/app/app.view.yaml`
- `src/pages/app/app.store.js`

### Add a reusable component

Put it in `src/components/<component-name>/`.

If it is not truly reusable, keep it close to the page instead of forcing an abstraction.

### Add a primitive

Put it in `src/primitives/` when the code owns low-level DOM behavior or a browser-native custom element.

### Add shared page/store/handler orchestration

Put it in `src/internal/ui/*` when the code is shared across pages, may touch stores/refs/render/RxJS/services, and is not a visual component or primitive.

### Add a small pure app-owned helper

Put it in `src/internal/*` when the code is pure, shared, app-owned, and is neither project semantics nor UI orchestration.

### Add a handler-facing service behavior

Put it behind:

- `appService`
- `projectService`

Prefer extending an existing coarse facade over adding a random helper file.

If code needs store selectors/setters, refs, `render()`, or page event payloads, it is not service code and belongs in `src/internal/ui/*` or a page instead.

### Add a domain rule

Put it in `src/internal/project/`.

`src/internal/project/` is intentionally kept merged into these canonical files:

- `commands.js`
- `state.js`
- `projection.js`
- `tree.js`
- `layout.js`

Do not create sparse new `src/internal/project/*` files unless explicitly approved.

### Add platform-specific behavior

Put it in:

- `src/deps/clients/*` for low-level platform and external adapters
- `src/deps/services/web/*` or `src/deps/services/tauri/*` for service adapters
- `src-tauri/` for native desktop-shell behavior such as Tauri commands,
  plugin setup, packaging, updater wiring, and Rust-side integration

If the code wraps router, DB, file picker, updater, browser storage, or similar external/platform APIs directly, it belongs in `src/deps/clients/*`.

### Add collaboration behavior

Put shared sync/session behavior in `src/deps/services/shared/collab/`.
Put web transport/runtime wiring in `src/deps/services/web/collab/`.
