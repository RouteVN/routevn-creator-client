# 08 Write Path Backlog (Big-Bang V2)

This backlog is the concrete remaining work to remove legacy `appendEvent` writes and move all mutations to V2 commands.

## Current Inventory

`rg "appendEvent\\(" src` currently reports >90 call sites.

Direct UI-level `repository.addEvent(...)` bypasses have been removed.
All runtime writes now route through `projectService.appendEvent(...)`, which
submits partitioned command envelopes to V2 collaboration.

Highest-impact files:

1. `src/pages/sceneEditor/sceneEditor.handlers.js` (18)
2. `src/components/fileExplorer/fileExplorer.handlers.js` (10)
3. `src/pages/typography/typography.handlers.js` (7)
4. `src/pages/scenes/scenes.handlers.js` (7)
5. `src/pages/colors/colors.handlers.js` (5)
6. `src/pages/characters/characters.handlers.js` (5)

## Execution Order

1. Story graph writes:
   - scenes, sections, lines
   - command family: `scene.*`, `section.*`, `line.*`
2. Resource writes:
   - images, sounds, videos, fonts, transforms, colors, typography, characters, components
   - command family: `resource.*`
3. Layout/variables writes:
   - command family: `layout.*`, `layout.element.*`, `variable.*`
4. Cleanup:
   - remove adapter/service-level direct event append usage.

## Replacement Pattern

For each legacy mutation:

1. Build a V2 command envelope with:
   - stable `id`
   - `projectId`
   - `partition`
   - `type`
   - typed `payload`
   - `actor`
   - `clientTs`
2. Call `projectService.submitCommand(command)`.
3. Keep local optimistic state via command projection (never custom ad-hoc mutation).
4. Add invariant assertion in integration path.

## Completion Definition

- `rg "appendEvent\\(" src` returns 0 in runtime code.
- UI mutation path is command-only.
- No data write path bypasses validation + preconditions + invariant checks.
