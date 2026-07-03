# Iteration 03 - Page And Runtime Coupling

## Question

After `scene-lines-changed`, what non-local work does a normal text edit trigger?

## Evidence

- `handleEditorDataChanged` receives full `lines` from the event at `src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js:1967`.
- It replaces the draft section lines at `src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js:1988`.
- It updates editor target selection at `src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js:2001`.
- It calls page `render()` unconditionally at `src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js:2005`.
- It schedules draft persistence at `src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js:2023`.
- It dispatches `sceneEditor.renderCanvas` with `skipRender: true` and `syncPresentationState: true` at `src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js:2027`.
- `renderSceneEditorCanvas` still builds selected project data from `store.selectProjectData()` before doing anything else at `src/internal/ui/sceneEditor/runtime.js:1246`.
- It still loads/preloads scene assets, calls `renderSceneEditorState`, and calls `updateSceneEditorSectionChanges` at `src/internal/ui/sceneEditor/runtime.js:1261`, `:1270`, and `:1275`.
- `renderSceneEditorState` calls `store.selectProjectData()`, clones project data with the selected entry point, reinitializes the route engine, selects presentation state, and selects render state at `src/internal/ui/sceneEditor/runtime.js:819` through `:890`.
- `skipRender` only gates the final UI render, and even that can be bypassed if the presentation-state snapshot changes at `src/internal/ui/sceneEditor/runtime.js:1281`.

## Finding

The text-edit path is coupled to the route runtime. Even when canvas painting is logically skipped, the code still performs project-data projection, route-engine initialization, presentation-state selection, render-state selection, asset checks, and section-change recomputation.

This is likely unnecessary for plain dialogue text edits. Dialogue content can affect preview text, but it should not require rebuilding global scene/project runtime state on every character.

## Optimization Hypothesis

Separate text-content changes from presentation/action changes:

- Plain dialogue text edit: update local editor, mark draft dirty, optionally debounce a lightweight preview text refresh.
- Structure edit: update draft, page render, possibly section list render, then preview sync.
- Action/presentation edit: update runtime projection and canvas.

`sceneEditor.renderCanvas` should not be the generic follow-up to every editor data change.

## Confidence

High for the coupling. Medium-high that it is a top contributor on Android, because route-engine and project-data projection scale with project size.

## Next Question

How much expensive derived data is rebuilt by the page render itself?
