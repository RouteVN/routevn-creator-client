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

## Architecture

This project uses a custom frontend framework based on 3 component files: view, store, handlers:

Read the links from the following files to familiarize with the code before starting to write any code.

- [Overview](https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/overview.md)
- [View](https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/view.md)
- [State Management](https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/store.md)
- [Handlers](https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/handlers.md)

## JavaScript Style

- Prefer direct property access or nullish coalescing (`??`) for defaults.
- Use `??` for default values instead of `||` when setting state/object fields.
- Avoid defensive `typeof x === "string" ? x : ""` patterns unless runtime type narrowing is truly required.
- Prefer `undefined` over `null`.
- Avoid explicit `= null` initialization; use `let value;` when a later assignment is expected.
- If state already guarantees a value, use it directly instead of re-normalizing with fallback checks.

## Layering

- Keep page/component handlers simple and orchestration-focused.
- Push domain logic, validation, and async complexity into services.
- Route-level async setup/loading should be handled in app-level orchestration, not repeated in page handlers.
- Prefer single-purpose store actions (`setCurrentProject`, etc.) over multiple related setter calls.
- Do not call browser globals like `document` or `window` directly from page handlers for cross-cutting side effects.
- If a handler needs browser-side behavior such as blurring the active element, global focus changes, history changes, or global listeners, route that through `deps/services` or `deps/infra`.
- Keep low-level DOM-heavy behavior in `src/primitives/` or in components that own that DOM surface directly.

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
