# Iteration 05 - Line Decorations And Section Changes

## Question

How expensive is the decoration data that feeds each editor's gutters?

## Evidence

- `buildSceneDocumentLineDecorations` delegates to `buildSceneDocumentLineViewModels` at `src/internal/ui/sceneEditor/lineViewModels.js:357`.
- `buildSceneDocumentLineViewModels` rebuilds character lookups from repository state each call at `src/internal/ui/sceneEditor/lineViewModels.js:293` and `:298`.
- It maps every line and normalizes line actions for each line at `src/internal/ui/sceneEditor/lineViewModels.js:300`.
- `getSectionLineEntry` searches `sectionLineChanges.lines` with `.find()` at `src/internal/ui/sceneEditor/lineViewModels.js:5`.
- The per-line mapping calls `getSectionLineEntry` for the current line and often the previous line at `src/internal/ui/sceneEditor/lineViewModels.js:302` and `:305`.
- The same line mapping builds background, character sprite, visual, transition, choices, conditional, variable, input, voice, SFX, next-line, dialogue layout, and control preview fields at `src/internal/ui/sceneEditor/lineViewModels.js:313` through `:351`.
- `updateSceneEditorSectionChanges` loops through every section id and calls `graphicsService.engineSelectSectionLineChanges({ includePresentationState: true })` at `src/internal/ui/sceneEditor/runtime.js:1046` through `:1062`.
- `selectViewData` builds decorations for the selected section and then again for every section item at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:1857` and `:1895`.

## Finding

Decoration work scales poorly:

- It is called once for selected-section data and once per section editor item.
- Each call rebuilds character lookups.
- Each line lookup scans the section-change array with `.find()`.
- Each line normalizes actions and builds many preview fields.
- The underlying `sectionLineChanges` data itself is recomputed for every section in the runtime path.

If a scene has many sections or many lines, a plain text edit can indirectly cause repeated decoration and section-change work that has little to do with the edited character.

## Optimization Hypothesis

- Index `sectionLineChanges.lines` by line id once per section, not via `.find()` per line.
- Cache character lookups per repository revision.
- Cache line decorations by `(sectionId, sectionLinesVersion, sectionChangesVersion, repositoryRevision, sceneSettings.showLineNumbers)`.
- For mobile, build decorations only for the active/visible section editor.
- Do not recompute `includePresentationState` section changes after plain dialogue text edits unless an action/presentation-affecting field changed.

## Confidence

High for algorithmic shape. Runtime share must be measured, especially versus gutter layout and route-engine work.

## Next Question

How much DOM/layout work happens after decoration props reach the primitive?
