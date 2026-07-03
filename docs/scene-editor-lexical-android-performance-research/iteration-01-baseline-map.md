# Iteration 01 - Baseline Map

## Question

What is the shape of the scene editor surface before optimizing it?

## Evidence

- The scene editor is large enough that performance problems are likely to be cross-layer, not isolated to one function:
  - `src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js`: 3522 lines.
  - `src/pages/sceneEditorLexical/sceneEditorLexical.store.js`: 2217 lines.
  - `src/primitives/lexicalSceneDocumentEditor.js`: 8814 lines.
  - `src/internal/ui/sceneEditor/runtime.js`: 1752 lines.
- The mobile layout renders all section editors, not just the selected section. The mobile `$for section, sectionIndex in sectionEditorItems` creates `rvn-scene-document-editor-lexical#sectionEditor${sectionIndex}` for each section at `src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml:169` and `:174`.
- Desktop has the same all-section editor mounting pattern at `src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml:196` and `:201`.
- Mobile also mounts `rvn-mobile-keyboard-toolbar` and `rvn-system-actions` in the same surface at `src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml:176` and `:177`.
- The primitive registers a Lexical update listener that calls `syncFromEditorState(editorState)` on every editor update at `src/primitives/lexicalSceneDocumentEditor.js:1289`.

## Finding

This is not a single slow function. The current design mounts multiple rich editor instances and connects every local editor update to page state, draft state, runtime preview state, gutters, and mobile keyboard/action UI.

For older Android devices, this is the wrong performance shape: there is too much work coupled to the keystroke path, and too many component instances are alive in the mobile editor view.

## Confidence

High. This follows directly from the view structure and the Lexical update registration.

## Next Question

What exactly happens during one text edit inside the Lexical primitive?
