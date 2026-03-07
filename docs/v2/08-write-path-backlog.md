# 08 Write Path Backlog (Big-Bang V2)

This backlog tracks the remaining work to keep all mutation paths command-only.

## Current Inventory

`rg "appendEvent\\(" src` now reports only repository storage/bootstrap internals.

Direct UI-level `repository.addEvent(...)` bypasses have been removed.
All UI/runtime mutations now route through command envelopes and collaboration sessions.

Remaining `appendEvent(...)` sites:

1. `src/deps/infra/web/webRepositoryAdapter.js`
2. `src/deps/infra/tauri/tauriRepositoryAdapter.js`
3. `src/deps/services/shared/projectRepositoryRuntime.js`
4. project bootstrap in `src/deps/services/projectService.js`
5. project bootstrap in `src/deps/infra/web/webRepositoryAdapter.js`

## Execution Order

1. Keep UI writes on command envelopes only.
2. Keep repository bootstrap writes limited to project initialization and repository persistence internals.
3. Remove app-owned replay/bootstrap logic as `insieme` projections replace it.

## Replacement Pattern

For each remaining mutation path:

1. Build a V2 command envelope with:
   - stable `id`
   - `projectId`
   - `partition`
   - `type`
   - typed `payload`
   - `actor`
   - `clientTs`
2. Call `projectService.submitCommand(command)`.
3. Keep local optimistic state via command projection (never custom ad hoc mutation).
4. Add invariant assertion in integration path.

## Completion Definition

- `rg "appendEvent\\(" src` returns only repository storage/bootstrap internals.
- UI mutation path is command-only.
- No data write path bypasses validation + preconditions + invariant checks.
