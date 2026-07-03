# Iteration 04 - Page Render Selector

## Question

What does page `render()` rebuild after a text edit?

## Evidence

- `selectViewData` starts by calling `selectScene({ state })` at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:1693`.
- It builds text-style and mention-target option arrays from repository state at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:1767` and `:1768`.
- It computes `sectionPresentationById` by mapping every scene section through `getSectionPresentation` at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:1773`.
- It always computes `sectionTransitionsDAG` at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:1787`, then stringifies it for view data at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:2049`.
- It builds line decorations for the selected section at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:1857`.
- It builds `sectionEditorItems` by mapping every section at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:1865`.
- Inside every `sectionEditorItems` entry, it builds line decorations again for that section at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:1895`.
- It also maps layouts and all characters into arrays for the returned view data at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:2039`.
- It returns `presentationState: selectEffectivePresentationState({ state })` at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:2066`.

## Finding

One page render after a text edit is not scoped to the edited line. It rebuilds:

- draft-overlaid scene data,
- section presentation summaries,
- section graph data,
- all section editor item props,
- selected section decorations,
- every section's decorations again,
- layout/character lists,
- mobile sizing data,
- system actions data,
- effective presentation state.

Some of this is useful for initial render or section/action changes, but it is excessive for each plain character insertion.

## Optimization Hypothesis

Split selector output by UI lane:

- Editor lane: active editor props only.
- Section list lane: section headers/ordering/dead-end state.
- Actions lane: selected line actions and presentation state.
- Preview lane: canvas/runtime data.
- Graph/debug lane: only when `sectionsGraphView` is active.

The hot text path should avoid recomputing graph data, inactive section decorations, layout/character arrays, and action-panel data unless their dependencies changed.

## Confidence

High for recomputation breadth. The exact runtime share needs instrumentation.

## Next Question

How expensive are line decorations and section-change data specifically?
