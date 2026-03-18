# Layout Editor Cleanup And Redesign Research

Date: 2026-03-19

## Goal

Define the best end state for `src/pages/layoutEditor/`.

This is not only about incremental cleanup. The goal is a materially better
architecture that makes the layout editor simpler to work on, easier to extend,
and less fragile when adding or changing item types.

## Rettangoli FE Note: Where Static Component Constants Should Go

Rettangoli FE has an optional `.constants.yaml` file for component-local static,
read-only data.

Official guidance:

- use `.constants.yaml` for labels, limits, feature flags, and other static
  values that do not change
- constants are injected as `deps.constants` in handlers and `ctx.constants` in
  store functions
- constants must be treated as read-only
- values must be JSON-serializable

Source:

- https://rettangoli.dev/fe/docs/guides/constants.md
- https://rettangoli.dev/llms.txt

### Practical implication for this codebase

If static config is not reused outside the page/component, the preferred home is
a local `.constants.yaml` file next to that page/component.

Examples:

- `src/pages/layoutEditor/layoutEditor.constants.yaml`
- `src/pages/layoutEditor/layoutInspector.constants.yaml`

Important constraint:

- `undefined` is not JSON-serializable, so constants data must use explicit
  values such as `null`, `""`, `0`, or a named enum value, then normalize in
  store/helpers if needed

This is useful, but it is only part of the solution. Static config extraction
alone does not fix the deeper architectural problem.

## Executive Summary

The biggest issue is not file length. The bigger issue is that one concept, a
layout item type, is defined in too many disconnected places.

Today a type like `slider` is spread across:

- creation defaults
- context menus
- inspector field config
- field update rules
- preview/render mapping
- drag/selection behavior
- persistence edge cases

That makes even small changes expensive and risky.

The strongest improvement is to redesign the editor around a single item-type
system plus clearer surface boundaries:

1. a shared item-type registry
2. a small page-level orchestrator
3. a dedicated canvas surface
4. a dedicated inspector surface
5. intent-based item updates instead of large handler branches

That is the path most likely to make the layout editor 2x to 3x easier to
maintain.

## Current Structure

Main files reviewed:

- `src/pages/layoutEditor/layoutEditor.handlers.js`
- `src/pages/layoutEditor/layoutEditor.store.js`
- `src/pages/layoutEditor/layoutPreview.js`
- `src/components/layoutEditPanel/layoutEditPanel.handlers.js`
- `src/components/layoutEditPanel/layoutEditPanel.store.js`
- `src/internal/project/layout.js`
- `src/internal/layoutEditorRoute.js`

Approximate file sizes:

- `layoutEditor.handlers.js`: 946 lines
- `layoutEditor.store.js`: 871 lines
- `layoutEditPanel.store.js`: 863 lines
- `layoutEditPanel.handlers.js`: 401 lines
- `layoutPreview.js`: 301 lines
- `src/internal/project/layout.js`: 1277 lines

## Findings

### 1. The page handler owns too many responsibilities

`src/pages/layoutEditor/layoutEditor.handlers.js` currently mixes:

- repository synchronization
- render-state assembly
- asset loading and cache recovery
- graphics preview rendering
- keyboard movement
- drag behavior
- debounced persistence
- item mutation rules

This file is acting as the page controller, canvas controller, save pipeline,
and type-specific mutation layer at the same time.

### 2. Large static definitions are sitting inside stores

`src/pages/layoutEditor/layoutEditor.store.js` contains:

- context menu definitions
- empty-state context menu definitions
- control-specific menu definitions
- preview form definitions

`src/components/layoutEditPanel/layoutEditPanel.store.js` contains:

- the edit-panel section and field config

Most of this is static data, not store logic.

This should move to `.constants.yaml` where it is truly static.

### 3. The edit-panel component has blurred ownership

`src/components/layoutEditPanel/layoutEditPanel.handlers.js` still fetches
repository state on mount to read `textStyles`.

That makes the child component partially repository-aware even though the page
already owns repository-backed state and already passes `values` and
`variablesData`.

Cleaner ownership:

- page owns repository data
- child surfaces receive props
- child surfaces do not ensure repositories or fetch project state

### 4. A lot of mutation logic is buried in one handler

`handleLayoutEditPanelUpdateHandler` in
`src/pages/layoutEditor/layoutEditor.handlers.js` contains several different
rule sets:

- anchor updates
- nested property updates
- general deep merge updates
- slider direction switching and remembered slider assets
- slider variable binding
- sprite auto-size fallback

This should become a small pure mutation layer, not page handler code.

### 5. Preview rendering is a coherent subsystem, but it is split awkwardly

The preview flow is logically one thing:

- read repo/store state
- build render elements
- collect file references
- load assets
- create preview data
- parse preview
- create selection overlay
- render graphics

Today it is spread across `layoutEditor.handlers.js` and `layoutPreview.js`.

That should become a dedicated canvas/preview layer.

### 6. There is avoidable duplication and contract drift

Examples:

- `toAlphanumericId` exists in both
  `src/pages/layoutEditor/layoutEditor.handlers.js` and
  `src/internal/project/layout.js`
- multiple edit-panel handlers repeat the same pattern:
  update local state, render, dispatch `update`
- event payload handling sometimes supports multiple fallback shapes

This is not the root problem, but it adds friction.

### 7. There is at least one suspicious config expression

In `src/components/layoutEditPanel/layoutEditPanel.store.js`, the height field
uses a `$when` condition with a chain of `!= ... || != ...`.

That expression appears effectively always true, which suggests either:

- the condition is wrong, or
- the field is no longer meant to be conditionally hidden

This is a symptom of config being hard to reason about in its current shape.

## The Real Architectural Problem

The same concept is spread across too many layers with no single source of
truth.

For an item type such as `slider`, there is no single place to answer:

- what data the item owns
- how a new one is created
- which fields the inspector should expose
- how field changes should be interpreted
- how the item becomes render elements
- which special cases exist for this type

That is why the code feels heavier than it should.

The best end state is not just "smaller files". The best end state is "one item
type definition drives the editor."

## Recommended End State

### 1. Introduce a shared layout item-type system

Create a single registry for layout item types.

Examples:

- `container`
- `sprite`
- `text`
- `slider`
- `rect`

The registry should define the behavior contract for each type.

At minimum, each type definition should own:

- default item creation data
- normalization of item data
- field-change behavior for that type
- any special mutation rules for that type
- render mapping or render hooks for that type

Static UI-only metadata should stay separate when appropriate:

- labels
- menu grouping
- inspector section ordering
- display text

Those static pieces can live in `.constants.yaml`.

### 2. Split the editor into 3 clear concerns

The important architectural boundary is conceptual first, not necessarily a
separate FE surface boundary on day one.

Preferred first implementation:

- keep one FE page
- move canvas behavior into pure preview helpers
- move inspector behavior into constants plus mutation helpers
- only split FE surfaces later if one-page FE ownership is still too heavy

#### Layout editor page

Responsibilities:

- route payload resolution
- repository subscription/orchestration
- selected item id
- dispatching user intents
- wiring data between canvas and inspector

The page should stop owning detailed preview and type-specific mutation logic.

#### Layout canvas concern

Responsibilities:

- graphics initialization
- asset loading
- render pipeline
- overlay rendering
- pointer drag interactions
- keyboard movement if it is canvas-specific

This can start as a helper-backed concern inside the page.
It does not need to become a separate FE surface immediately.

#### Layout inspector concern

Responsibilities:

- showing fields for the selected item
- opening popovers and image selectors
- translating field input into typed update intents

The inspector should not know about repository loading.
This can also stay inside the page FE surface first.

### 3. Use intent-based updates instead of handler-local mutation branching

The editor should update items through explicit intents, not ad hoc handler
branches.

Examples:

- `set-field`
- `move-item`
- `resize-item`
- `change-slider-direction`
- `bind-slider-variable`
- `replace-image`
- `create-item`

Then one pure mutation layer applies those intents against the current item
using the type registry.

Benefits:

- easier testing
- easier reasoning
- easier undo/redo later if needed
- page handlers become orchestration only

### 4. Keep repository ownership at the page level

Repository-backed data should be loaded at the page level and passed down.

That means:

- no `projectService.ensureRepository()` inside the inspector
- no child component fetching text styles or variables on its own
- all child surfaces receive stable props from the page

This matches the repo's preferred ownership model.

### 5. Keep static config in `.constants.yaml`, not mixed into store logic

Good `.constants.yaml` candidates:

- context menu item lists
- preview form definitions
- inspector section labels
- field labels and options
- item creation menu groups

Not good `.constants.yaml` candidates:

- mutation logic
- render mapping functions
- save policy
- normalization code

Those belong in pure JavaScript modules.

## Proposed File Placement

This should follow repo layering rules and avoid fake reusability.

### Page-local surfaces

Preferred starting point:

- keep one FE page only:
  - `src/pages/layoutEditor/layoutEditor.view.yaml`
  - `src/pages/layoutEditor/layoutEditor.store.js`
  - `src/pages/layoutEditor/layoutEditor.handlers.js`

Do not split into many FE page-local surfaces by default.

Adding separate FE surfaces for canvas and inspector creates extra boundaries:

- more event wiring
- more store/handler coordination
- more indirection
- more maintenance overhead

That split should only happen later if the helper-based refactor is still not
enough.

Possible later split, only if still justified:

- `src/pages/layoutEditor/layoutCanvas.view.yaml`
- `src/pages/layoutEditor/layoutCanvas.store.js`
- `src/pages/layoutEditor/layoutCanvas.handlers.js`
- `src/pages/layoutEditor/layoutInspector.view.yaml`
- `src/pages/layoutEditor/layoutInspector.store.js`
- `src/pages/layoutEditor/layoutInspector.handlers.js`

The default plan should not assume those files exist.

### Shared pure editor helpers

Put pure shared editor helpers in `src/internal/` or `src/internal/ui/`
depending on ownership.

Recommended starting point:

- `src/internal/layoutEditorTypes.js`
- `src/internal/layoutEditorPreview.js`
- `src/internal/layoutEditorMutations.js`

Reasoning:

- these are app-owned pure helpers
- they are shared by page-local surfaces
- they are not service code
- they are not broad UI orchestration in the `internal/ui` sense

Do not split item types into many files too early.

Preferred first step:

- keep the full registry in one file
- keep per-type definitions as internal constants in that file
- split by type later only if the registry becomes genuinely too large or too
  contentious for parallel editing

### Constants files

Examples:

- `src/pages/layoutEditor/layoutEditor.constants.yaml`
- `src/pages/layoutEditor/layoutInspector.constants.yaml`

## Target Quality Bar

In the best end state:

- adding a new layout item type should not require touching 6 to 8 unrelated
  places
- page handlers should not contain type-specific mutation logic
- the inspector should not fetch repository state
- the page store should not contain huge static config blobs
- canvas-specific behavior should live with the canvas
- most item behavior should be discoverable from the type registry

A practical success metric:

- adding a new item type should be possible by touching only:
  1. one type definition file
  2. one inspector constants/config entry
  3. one menu/constants entry if the type is creatable

That is a major improvement over the current spread.

## Master Plan

This plan is phased, but the target is a full architectural improvement, not a
small cleanup.

### Phase 0. Lock the target architecture

Deliverables:

- this document
- agreement on the target structure
- agreement on the type registry contract
- agreement on which surfaces stay page-local

Exit criteria:

- no implementation starts before the boundaries are clear

### Phase 1. Introduce local constants files

Move static data out of store files into `.constants.yaml`.

Targets:

- layout editor context menus
- layout editor preview forms
- inspector field/section config

Goals:

- shrink store files
- separate static config from behavior
- make later refactors easier

Exit criteria:

- no large menu/form config blobs left in page/component stores

### Phase 2. Make repository ownership explicit

Refactor data flow so the page owns repository-backed data and passes it down.

Changes:

- inspector receives `textStylesData`, `variablesData`, and any other needed
  resources as props
- remove `projectService.ensureRepository()` from child surfaces

Exit criteria:

- child surfaces are prop-driven
- repository boot/loading is page-owned only

### Phase 3. Extract the layout item-type system

Create the shared item-type registry and move type behavior into it.

Recommended first implementation shape:

- one file: `src/internal/layoutEditorTypes.js`

Move into the type system:

- create defaults
- normalization helpers
- field-change rules
- special mutation rules
- render mapping helpers or render hooks

Start with the most special-case-heavy types first:

- `slider`
- `sprite`
- `text`
- `container`
- `rect`

Only split into per-type files later if one-file ownership stops being simpler.

Exit criteria:

- page handlers no longer contain type-specific branches for these types

### Phase 4. Introduce the pure mutation layer

Create pure mutation helpers driven by the type registry.

Examples:

- `applyLayoutItemIntent`
- `applyFieldChange`
- `createLayoutItem`
- `moveLayoutItem`
- `resizeLayoutItem`

The page and inspector should call these helpers instead of hand-editing nested
objects.

Exit criteria:

- `handleLayoutEditPanelUpdateHandler` becomes thin orchestration
- nested merge logic and slider special cases are no longer in the page handler

### Phase 5. Extract the canvas concern

First move preview/canvas work into a dedicated pure helper layer, not
necessarily a new FE surface.

Move:

- graphics init
- render pipeline
- file reference extraction
- asset loading
- stale asset cache recovery
- overlay generation wiring
- drag pointer behavior

Exit criteria:

- page handler no longer directly owns preview rendering

### Phase 6. Extract the inspector concern

Replace the current generic-feeling `layoutEditPanel` shape with a more focused
layout-editor inspector model.

Move:

- popover state
- image selector state
- field interaction handling
- action selection UI

Keep:

- actual data mutation in the shared mutation layer

Exit criteria:

- inspector is a focused UI surface
- inspector handlers are UI-only and mostly dispatch intents

Optional later step:

- if the page FE files are still too heavy after phases 1-6, then split the
  canvas and/or inspector into separate FE page-local surfaces

### Phase 7. Simplify persistence and refresh flow

After the type system and surfaces exist, simplify save behavior.

Goals:

- keep debounced persistence in one place
- keep immediate-save rules in one place
- unify store-to-repository synchronization
- reduce repeated `render()` and `render preview` calls scattered across
  handlers

Exit criteria:

- one clear save pipeline
- one clear preview refresh pipeline

### Phase 8. Remove duplication and dead compatibility paths

Clean up after the architecture shift.

Examples:

- remove duplicate helpers
- remove multi-shape payload fallbacks where event contracts are now stable
- rename files and symbols for clarity
- review suspicious config conditions

Exit criteria:

- no legacy branches left only for the old structure

### Phase 9. Add targeted tests around the new architecture

Focus testing on the new seams.

Priority targets:

- item-type mutation helpers
- slider-specific behavior
- preview render state generation
- selection overlay behavior
- persistence decisions for immediate vs debounced updates

Exit criteria:

- core type behavior is testable without mounting the whole page

## Implementation Order Recommendation

If this work is executed as a real refactor program, the recommended order is:

1. constants extraction
2. page-owned repository data flow
3. type registry
4. mutation layer
5. canvas concern extraction
6. inspector concern extraction
7. save/render pipeline simplification
8. cleanup and tests

This order reduces risk because:

- static extraction lowers noise first
- ownership gets cleaner before surface extraction
- type behavior becomes explicit before UI layers are split further
- FE surface splitting is deferred until there is evidence it is still needed

## Risks

### 1. Slider regressions

`slider` currently has the most special-case behavior.

Mitigation:

- migrate slider with focused helper tests first

### 2. Preview parity regressions

Canvas extraction can accidentally change rendering behavior.

Mitigation:

- keep preview rendering pure and testable
- preserve overlay behavior during the move

### 3. Over-generalization

A registry can become worse if it turns into a framework.

Mitigation:

- keep the contract small
- use plain objects and pure functions
- avoid inventing plugin systems or schema compilers

## What Not To Do

Avoid these:

- a big-bang rewrite
- a generic editor platform abstraction
- moving everything into `src/components/` just because it becomes separate
- keeping type behavior split across page handler, inspector config, and render
  code after the registry exists

## Bottom Line

Incremental cleanup is still worth doing, but it is not enough on its own.

The most important architectural change is:

- move from scattered type-specific logic to a single layout item-type system

The second most important change is:

- split the editor into a page orchestrator, a canvas surface, and an
  inspector surface

The rest of the cleanup work should support those two moves.
