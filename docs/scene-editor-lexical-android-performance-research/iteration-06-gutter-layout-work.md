# Iteration 06 - Gutter Layout Work

## Question

What DOM and layout work does the primitive do after each scheduled render?

## Evidence

- `scheduleRender` batches primitive rendering to `requestAnimationFrame` at `src/primitives/lexicalSceneDocumentEditor.js:7525`.
- `render()` always calls `renderGutters()` at `src/primitives/lexicalSceneDocumentEditor.js:7536` and `:7557`.
- `renderGutters()` builds a fresh decoration map, reads the surface rect, and computes max right-gutter width at `src/primitives/lexicalSceneDocumentEditor.js:7582` through `:7594`.
- It loops every line in `this.state.lines` at `src/primitives/lexicalSceneDocumentEditor.js:7600`.
- For each line, it reads `lineElement.getBoundingClientRect()` at `src/primitives/lexicalSceneDocumentEditor.js:7610`.
- It updates selected/mode datasets and left gutter layout for every line at `src/primitives/lexicalSceneDocumentEditor.js:7613` through `:7628`.
- It calls `createPreviewItems(lineDecoration)` before knowing whether the right gutter row signature changed at `src/primitives/lexicalSceneDocumentEditor.js:7631`.
- It updates right gutter rows and then measures right gutter item width at `src/primitives/lexicalSceneDocumentEditor.js:7649` and `:7788`.
- `getMaxRightGutterWidth` performs another surface `getBoundingClientRect()` read at `src/primitives/lexicalSceneDocumentEditor.js:7776`.
- If line padding or global gutter width changes, it schedules another render at `src/primitives/lexicalSceneDocumentEditor.js:7669`.
- Gutter signature creation uses `JSON.stringify` at `src/primitives/lexicalSceneDocumentEditor.js:7695` and `:7729`.
- `updateLeftGutterRow` and `updateRightGutterRow` can replace row children at `src/primitives/lexicalSceneDocumentEditor.js:7707` and `:7726`.

## Finding

Primitive rendering is a full-line layout pass. It interleaves layout reads, DOM writes, detached DOM allocation, signature stringify work, and possible second-frame scheduling.

This is expensive on older Android because forced layout reads after contenteditable mutations can block the main thread. The problem grows with:

- number of lines in the active section,
- number of decorated lines,
- number of mounted section editors,
- keyboard resize frequency,
- font-size or gutter-width changes.

## Optimization Hypothesis

Gutters need dirty scopes:

- Selection change should update old/new selected rows only, not measure every line.
- Text insertion should measure the edited line and maybe following rows only when height changed.
- Decoration changes should update only affected line rows.
- Right gutter preview DOM should be built only after signature mismatch.
- Width measurement should be batched and avoided for unchanged signatures.
- Inactive/mobile offscreen sections should not run gutter layout at all.

## Confidence

High that this is a major risk on Android. Exact contribution relative to project/runtime work needs instrumentation.

## Next Question

How do Android keyboard and IME events amplify the hot path?
