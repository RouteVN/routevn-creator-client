# Layout Editor End-State Architecture

## Purpose

This document defines the target production architecture for the layout editor.

It is intentionally written as an end-state design, not as an incremental
refactor plan. The goal is to describe how the layout editor should be
organized if we designed it today with full knowledge of the feature set.

This document covers:

- ownership boundaries
- module layout
- runtime and preview contracts
- how special layout elements are defined
- how the right edit panel should be structured
- how conditions, actions, preview state, and persistence should work
- how the model, client, route-engine, and route-graphics should fit together

## Why This Needs A Redesign

The current layout editor works, but too many responsibilities are mixed across
the same files.

Today, a single feature often touches all of these layers at once:

- page store
- page handlers
- preview renderer
- layout compiler
- type/capability helpers
- right edit panel store
- creator-model validation
- route-engine runtime assumptions
- route-graphics behavior quirks

That produces several problems:

- feature logic is duplicated across preview, panel, and runtime
- adding one special element requires scattered edits
- small regressions appear when the same concept is interpreted differently in
  different layers
- the right panel store has become a feature bucket instead of UI state
- preview support is mixed into route state and generic selectors
- client-side patches compensate for missing runtime or graphics contracts
- debugging and testing require understanding too many files at once

This is not acceptable for a critical editor and runtime pipeline.

## Design Goals

1. One concept should have one owner.
2. Special layout elements should be defined once, not reinterpreted in many
   places.
3. Preview and runtime should share the same contracts as much as possible.
4. The right edit panel should be a UI shell over feature modules, not the home
   of feature semantics.
5. Client-only hacks should be minimized. If behavior is a runtime or graphics
   contract, it should live there.
6. It must be easy to add a new element type, new preview provider, or new
   right-panel feature without changing unrelated code.
7. It must be testable through pure contracts, not only through page-level
   interaction tests.

## Non-Goals

- This document does not describe a migration plan.
- This document does not preserve current file layout for compatibility.
- This document does not try to minimize churn.

The only question here is: what should the architecture be when it is clean.

## Core Principles

### 1. Layout Editor Is A Compiler Product

The layout editor is not just a form surface. It is an authoring UI for a
runtime layout DSL.

That means the architecture should be shaped around a compile pipeline:

```text
repository layout item
-> editor item model
-> preview/runtime compilation
-> route-engine template data
-> route-graphics render state
```

The editor should not invent behavior ad hoc in handlers or panel stores.

### 2. Special Elements Are First-Class Product Features

Elements like these are not simple variants:

- `fragment-ref`
- `container-ref-choice-item`
- `container-ref-save-load-slot`
- `container-ref-dialogue-line`
- `container-ref-confirm-dialog-ok`
- `container-ref-confirm-dialog-cancel`
- `sprite-ref-save-load-slot-image`
- `text-ref-save-load-slot-date`

They represent product concepts and should be described in one registry with
explicit behavior contracts.

### 3. Preview Is A Runtime Adapter

Preview should not be a second interpretation of layout meaning.

It should use the same compiled layout path and the same template contract as
runtime, with a different provider for synthetic data.

### 4. UI State And Domain Rules Must Be Separate

The panel store should own:

- which dialog is open
- which rule is selected
- temporary defaults for the open form

It should not own:

- what a save/load slot means
- how conditional text styles compile
- what preview variables are required
- what runtime states are valid

Those belong in shared feature modules.

## End-State Ownership Model

### Repository And Model

`routevn-creator-model` owns:

- valid layout types
- valid element types
- valid element fields
- valid references
- valid conditions and condition targets
- command validation and reduction

It must be the source of truth for what the repository can store.

### Client Project Semantics

`src/internal/project/` owns:

- layout compilation to runtime render state
- reference scanning
- resource dependency scanning
- cross-element semantic rules
- element registry

It must be pure and deterministic.

### Client Editor UI Orchestration

`src/internal/ui/layoutEditor/` owns:

- editor page orchestration
- preview providers
- selection/overlay orchestration
- editor-side persistence policy

It may depend on project semantics, but it must not redefine them.

### Client Right Panel UI

`src/internal/ui/layoutEditPanel/` owns:

- field schemas
- dialog state
- summaries
- feature-specific editor forms

It must not own compile behavior or runtime semantics.

### Route Engine

`route-engine` owns:

- runtime template data contract
- runtime state
- confirm dialog runtime flow
- save/load slot data shape
- layout rendering integration

If the client needs a runtime field, the field must exist explicitly in the
engine contract.

### Route Graphics

`route-graphics` owns:

- hit-testing semantics
- interaction inheritance behavior
- extract/capture behavior
- asset lifecycle semantics

The client should not patch those behaviors post-render unless there is no
practical alternative.

## End-State File Structure

### Client

```text
src/
  pages/
    layoutEditor/
      layoutEditor.view.yaml
      layoutEditor.store.js
      layoutEditor.handlers.js

  components/
    layoutEditPanel/
      layoutEditPanel.view.yaml
      layoutEditPanel.store.js
      layoutEditPanel.handlers.js

  internal/
    layoutConditions.js
    layoutRuntimeState.js

    project/
      layout/
        registry.js
        compiler.js
        references.js
        dependencies.js
        templates.js
        transform.js

    ui/
      layoutEditor/
        pageState.js
        persistence.js
        selectionOverlay.js
        preview/
          dialogue.js
          nvl.js
          choice.js
          saveLoad.js
          confirmDialog.js
          fragments.js
          runtimeState.js
          variables.js
          index.js

      layoutEditPanel/
        registry.js
        shared.js
        features/
          appearance.js
          layout.js
          interactions.js
          visibility.js
          conditionalTextStyles.js
          pagination.js
          childInteraction.js
          fragmentRef.js
```

The key point is not the exact folder names. The key point is that each concern
has one home.

## Single Source Of Truth: Element Registry

The most important missing piece today is an explicit element registry.

Every layout element type should be described once in a single registry entry.

### Registry Responsibilities

A registry entry owns:

- `type`
- `family`
- `createTemplate`
- `defaultChildren`
- `capabilities`
- `panelFeatures`
- `previewDependencies`
- `immediatePersistFields`
- `compile`
- `referenceTargets`
- `runtimeRequirements`

### Example Shape

```js
{
  type: "container-ref-save-load-slot",
  family: "container",
  createTemplate({ projectResolution }) {
    return {
      type: "container-ref-save-load-slot",
      name: "Container (Save/Load Slot)",
      x: 0,
      y: 0,
      width: 320,
      height: 220,
      paginationMode: "continuous",
      paginationSize: 3,
    };
  },
  defaultChildren({ projectResolution }) {
    return [
      createElement("sprite-ref-save-load-slot-image", { projectResolution }),
      createElement("text-ref-save-load-slot-date", { projectResolution }),
    ];
  },
  capabilities: {
    container: true,
    supportsActions: true,
    supportsVisibility: true,
    supportsOpacity: true,
  },
  panelFeatures: [
    "layout",
    "appearance",
    "visibility",
    "actions",
    "pagination",
    "childInteraction",
  ],
  previewDependencies: {
    saveLoad: true,
    runtimeState: false,
    variables: true,
  },
  immediatePersistFields: [
    "click",
    "rightClick",
    "change",
    "paginationMode",
    "paginationVariableId",
    "paginationSize",
  ],
  compile(node, context) {
    return compileSaveLoadSlotContainer(node, context);
  },
}
```

### Why This Matters

Without this registry:

- create-menu logic is separate from compile logic
- panel capability logic is separate from create logic
- preview requirements are inferred separately
- persistence rules are handled elsewhere

That is the root cause of current fragility.

## Layout Compiler Design

The compiler should be a pure transform from repository element data to runtime
render-state template data.

### Compiler Inputs

- layout item
- repository resources
- element registry
- compile context

### Compiler Outputs

- runtime layout tree
- referenced resource ids
- referenced layouts
- referenced text styles
- required preview/runtime contracts

### Compiler Rules

1. No UI state inside compiler.
2. No service calls inside compiler.
3. No graphics-specific repair patches inside compiler.
4. No direct DOM assumptions.
5. All special behavior goes through the element registry.

### Compiler Subsystems

The compiler should be split into explicit passes:

1. base transform pass
2. feature compile pass by element type
3. reference extraction pass
4. asset dependency extraction pass
5. runtime contract extraction pass

Each pass should be independently testable.

## Layout Conditions

Conditions are currently scattered across:

- visibility
- conditional text styles
- preview-variable discovery
- creator-model validation

This should become one shared condition module.

### Condition Model

There should be one structured condition format:

```js
{
  variableId: "__isLineCompleted",
  op: "eq",
  value: true,
}
```

Supported targets should come from a central catalog:

- project variables
- system variables
- runtime states
- slot-scoped states

### Condition Catalog

The catalog should define:

- `id`
- `name`
- `type`
- `source`
- `description`
- `templateAccessor`
- `scope`

Example:

```js
{
  id: "__autoMode",
  name: "Auto Mode",
  type: "boolean",
  source: "runtime",
  description: "Whether the engine is currently in auto mode",
  templateAccessor: "autoMode",
  scope: "layout"
}
```

### Benefits

- visibility and conditional text styles use the same condition engine
- creator-model validation can use the same ids and scopes
- preview-variable discovery can inspect one structure
- no duplicated runtime condition lists

## Preview System

Preview should be built from explicit providers, not from one large page store.

### Providers

The preview system should have these providers:

- `variables`
- `runtimeState`
- `dialogue`
- `nvl`
- `choice`
- `saveLoad`
- `confirmDialog`
- `fragments`

Each provider owns:

- whether it is needed
- what synthetic data it contributes
- what preview form fields it contributes
- how default values are built
- how submitted preview edits are written back

### Shared Preview Contract

All preview providers should contribute to one final preview data object:

```js
{
  variables: {},
  autoMode: false,
  skipMode: false,
  isLineCompleted: false,
  characterName: "Character",
  dialogueContent: "...",
  choices: [],
  saveSlots: [],
  confirmDialog: {},
}
```

This should match runtime template data shape as closely as possible.

### Dialogue Preview

Dialogue preview should not be special-cased directly in page handlers.

It should be a provider that contributes:

- `characterName`
- `dialogueContent`
- `autoMode`
- `skipMode`
- `isLineCompleted`
- reveal speed

### Save/Load Preview

Save/load preview should own:

- synthetic slot list generation
- continuous vs paginated slot window
- pagination variable application
- slot form writeback

It should not be mixed into generic page selectors.

### Fragment Preview

Fragment traversal should be provider infrastructure, not embedded in the page
store.

It should support:

- preview variable discovery through fragment refs
- save/load preview discovery through fragment refs
- runtime requirement discovery through fragment refs

## Right Edit Panel Design

The right panel should become a thin renderer over feature modules.

### End-State Responsibilities

The panel shell owns:

- selected item values
- which dialogs are open
- dispatching edited field values to the page

Feature modules own:

- how a feature is summarized
- how its dialog defaults are built
- how its form schema is built
- how submitted dialog values are converted into field updates

### Example Feature Modules

- `appearance`
  - opacity
  - rotation
  - anchor
- `visibility`
  - condition summary
  - condition dialog
- `conditionalTextStyles`
  - ordered rule list
  - rule editor
  - move/reorder logic
- `pagination`
  - continuous/paginated
  - variable selection
  - page size
- `childInteraction`
  - inherit hover/click/right-click
- `fragmentRef`
  - fragment selection

### Panel Registry

The panel should ask the element registry which features apply:

```js
const featureIds = elementRegistry[item.type].panelFeatures;
```

Then render the sections returned by those feature modules.

That means:

- no giant `selectViewData` with all feature logic inside
- no one store file that knows every feature in the system

## Actions

Actions should be treated as structured command graphs, not partially merged
objects.

### Rules

1. Dynamic Jempl action references must survive untouched until compile.
2. User-defined actions and built-in actions must be composed by explicit action
   combinators, not by object spread.
3. Runtime action rewriting must be pure and should clone its inputs.
4. Screenshot capture should only happen if the action tree contains a save
   action that needs it.

### Required Shared Module

There should be one action preparation/compiler module that owns:

- detection of save-like actions
- slot id injection from event context
- confirm-dialog nested action propagation
- screenshot thumbnail injection

That module should be used in both scene preview and scene editor runtime.

## Runtime Template Contract

The client and route-engine need one stable shared contract.

### Template Data Buckets

The end-state template data should be flat and explicit:

```js
{
  variables,
  saveSlots,
  confirmDialog,
  isLineCompleted,
  autoMode,
  skipMode,
  canRollback,
}
```

### Rule For State vs Variables

- `variables`
  - author-facing mutable values
  - includes user variables and engine-defined system variables
- runtime state fields
  - engine-owned facts
  - read-only from layout/template perspective

Examples:

- `variables._currentSaveLoadPagination`: variable
- `variables._musicVolume`: variable
- `isLineCompleted`: runtime state
- `autoMode`: runtime state
- `skipMode`: runtime state
- `confirmDialog`: runtime state
- `saveSlots`: runtime state

That rule must be shared across:

- creator-model
- client preview
- route-engine

## Confirm Dialog Design

Confirm dialog should remain a normal layout resource type, but the special
containers must be first-class registry elements with explicit compile
behavior.

### Required Behavior

- `container-ref-confirm-dialog-ok`
  - compiles to click payload using `confirmDialog.confirmActions`
- `container-ref-confirm-dialog-cancel`
  - compiles to click payload using `confirmDialog.cancelActions`

### Runtime Requirement

Interactive container hit behavior must be a route-graphics or route-engine
contract, not a client post-render patch.

The client should be able to assume:

- interactive container surfaces are clickable based on their render bounds

If that contract does not exist, it should be added in the runtime layer.

## Save/Load Design

Save/load should be defined by one shared contract.

### Slot Data Shape

```js
{
  slotId: 1,
  image: "data:image/jpeg;base64,...",
  savedAt: 1710000000000,
}
```

### Save/Load Layout Rules

- slot repeat container loops `saveSlots`
- save image sprite uses `imageId: "${item.image}"`
- save date text uses `${formatDate(item.savedAt)}`
- save data availability is based on `item.savedAt`

### Pagination Rule

Pagination must be driven by `paginationVariableId` and `paginationSize`.

That rule should exist in:

- preview provider
- runtime contract in engine

The field must not be metadata-only.

## Fragment Design

Fragment support should remain a boolean layout capability, not a separate
layout type.

### Repository Rule

- `layoutType` describes runtime behavior
- `isFragment` describes whether a layout can be embedded as a fragment

### Compile Rule

- `fragment-ref` compiles through the registry
- fragment traversal is shared infrastructure
- fragment-contained preview and condition discovery must work exactly like
  local elements

## Persistence Rules

Persistence policy should come from feature and element metadata, not a hardcoded
allowlist in a separate file.

### Desired Model

Each feature or element registry entry can declare:

```js
immediatePersistFields: ["conditionalTextStyles", "click", "rightClick"];
```

Then editor persistence uses those declarations instead of maintaining a
manually curated list.

This prevents regressions where new structured dialog fields are updated in the
panel but lost on selection change.

## Testing Strategy

The end-state design requires contract tests, not only surface tests.

### Registry Tests

For each special element type:

- create template shape
- default child creation
- supported panel features
- compile output
- preview dependencies

### Condition Tests

- build expression from structured condition
- parse expression back to structured condition
- validate allowed target ids and scopes

### Preview Provider Tests

- required provider detection
- default values
- provider output contract
- fragment traversal behavior
- paginated save/load window selection

### Compile Tests

- conditional text styles compile in order
- confirm dialog buttons compile to runtime action references
- save/load slot image/date compile correctly
- fragment refs expand correctly

### Runtime Contract Tests

These belong in route-engine or shared integration coverage:

- save slot update changes `image` and `savedAt`
- confirm dialog action batches close dialog automatically
- interactive containers receive click events reliably
- paginated save/load view uses `_currentSaveLoadPagination`

## Performance Rules

The end-state architecture should explicitly enforce these performance rules:

1. No unconditional screenshot capture on every interaction.
2. No repeated deep fragment traversal in many independent selectors.
3. No large `JSON.stringify` remount keys for routine form updates.
4. No repeated ad hoc template scans in unrelated modules.
5. Preview data providers should be memoizable by explicit inputs.

## Reliability Rules

The layout editor is production-critical. It needs stronger architectural
contracts.

### Required Reliability Rules

1. No silent model rejection for panel edits.
   - Failed persistence must surface user-visible errors.
2. No client-only reinterpretation of repository semantics.
3. No runtime-only hidden fields that preview cannot model.
4. No graphics-service repair patches for contracts that should live in
   route-graphics.
5. No feature that requires touching more than one source-of-truth definition.

## End-State Summary

If we rebuilt the layout editor cleanly today, the core structure would be:

- one element registry for all layout element types
- one shared condition system
- one preview-provider system
- one pure layout compiler
- one thin panel shell with feature modules
- one stable runtime template contract shared with route-engine
- one explicit interaction contract shared with route-graphics

That architecture would make the layout editor:

- easier to reason about
- easier to extend
- less fragile under new feature work
- more aligned with creator-model and runtime behavior
- much more suitable for long-term production support

## Scope Of Future Architecture Work

When we decide to do the redesign, the target is not:

- "clean up a few files"
- "extract a helper or two"
- "reduce store size a bit"

The target is to move the layout editor onto the architecture defined in this
document.

That means the success criterion is structural:

- one home per concept
- one source of truth per special element
- preview and runtime using the same contracts
- panel state separated from feature semantics

Anything less may help temporarily, but it will not solve the long-term
maintenance problem.
