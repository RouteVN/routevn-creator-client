# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Commands

Build the project:

```bash
bun run build
```

This command:

1. Removes the existing `_site` directory
2. Copies static files from `static/` to `_site/`
3. Runs the Rettangoli CLI to build the frontend bundle to `_site/public/main.js`

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

## UX/Error Handling

- Do not silently swallow errors with `console.error` only for user actions; show user-facing feedback via `appService.showToast(...)`.
- Prefer stable, explicit toast messages over raw `error?.message` text.

## Event/Data Access

- For project click handlers, read project ids from `event.currentTarget.dataset.projectId` only.
- Do not parse ids from element `id` as a fallback.

## File Picker Contract

- Use `appService.pickFiles(...)` as the single entry point for selecting files in handlers.
- `multiple: false` returns a single file object or no value (cancelled), not an array.
- `multiple: true` returns an array.
- Use picker-level validations: `validations: [{ type: "square" }]` instead of duplicating inline handler validation.
- Use picker-level upload when needed: `upload: true`.
- When `upload: true`, read upload metadata from the returned file object (`uploadSucessful` and `uploadResult`) instead of calling upload service directly in handlers.
