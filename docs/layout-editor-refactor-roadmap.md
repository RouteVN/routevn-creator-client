# Layout Editor Refactor Roadmap

## Purpose

This roadmap turns the end-state architecture in
`docs/layout-editor-end-state-architecture.md` into executable work.

This is not an incremental "small cleanup" plan. It is the implementation map
for moving the layout editor to the desired production structure.

## End-State Definition

The refactor is complete when these conditions are true:

1. Layout conditions are defined in one shared module.
2. Preview data comes from explicit preview providers, not from one large page
   store.
3. Special layout elements are defined in one shared element registry.
4. The right edit panel renders feature modules instead of owning feature
   semantics directly.
5. Preview and runtime use the same template-data contracts.
6. Persistence policy is declared by features or element definitions, not by a
   scattered hardcoded allowlist.

## Workstreams

### 1. Shared Conditions

Deliverables:

- one shared condition catalog
- one shared parser/builder for condition expressions
- one shared accessor catalog for:
  - project variables
  - system variables
  - runtime state
  - slot state

Completion criteria:

- visibility and conditional text styles use the same condition module
- preview variable discovery uses the same condition module
- client and model agree on supported runtime condition ids

### 2. Preview Providers

Deliverables:

- fragment traversal provider
- preview variable provider
- runtime state preview provider
- dialogue preview provider
- choice preview provider
- save/load preview provider
- confirm dialog preview provider

Completion criteria:

- `layoutEditor.store.js` does not directly implement feature-specific preview
  logic
- preview form generation and preview data generation both flow through the
  providers

### 3. Element Registry

Deliverables:

- one registry entry per layout element type
- create template ownership
- capability ownership
- type rule ownership
- preview dependency ownership
- panel feature ownership

Completion criteria:

- new element types do not require scattered edits across unrelated files
- current special elements compile through registry-driven definitions

### 4. Right Edit Panel Features

Deliverables:

- shared panel feature registry
- feature modules for:
  - appearance
  - layout
  - actions
  - visibility
  - conditional text styles
  - pagination
  - child interaction
  - fragment selection

Completion criteria:

- `layoutEditPanel.store.js` is reduced to UI orchestration and feature
  composition
- feature summaries and dialog defaults come from feature modules

### 5. Runtime Contract Alignment

Deliverables:

- one explicit runtime template contract shared by preview and engine
- explicit ownership of runtime state versus variables
- removal of client-side compensating behavior where runtime/graphics should own
  the contract

Completion criteria:

- preview and runtime both use the same field names for save/load, confirm
  dialog, and runtime state
- no feature depends on a hidden preview-only contract

## Suggested Execution Order

1. Shared conditions
2. Preview providers
3. Element registry
4. Panel feature modules
5. Runtime contract cleanup
6. Dead-code removal and consolidation

## Validation Requirements

For each workstream:

- targeted unit tests for the new module contracts
- existing layout-editor tests updated to use the new modules
- no change in user-visible behavior unless explicitly intended

Final validation:

- layout editor preview tests
- layout visibility/conditional style tests
- layout persistence tests
- model validation tests for layout conditions and element fields

## Done Criteria

The roadmap is done when:

- the new modules are the primary code paths
- old mixed-responsibility code has been removed
- the architecture document matches the actual code layout
- adding a new special element or preview feature no longer requires touching
  large unrelated files
