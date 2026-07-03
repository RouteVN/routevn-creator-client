# Scene Editor Lexical Android Performance Synthesis

## Executive Diagnosis

The slow Android editor is most likely caused by architectural coupling, not a single bad loop.

Plain text input currently causes local editor work, full-section serialization, page draft replacement, page render, all-section selector rebuilds, gutter layout measurement, runtime/canvas projection, section-change extraction, and autosave scheduling. On older Android, the same input often overlaps with IME composition and keyboard viewport events.

The optimal solution is not a rewrite. The best path is:

1. Instrument.
2. Remove global runtime/page work from plain text input.
3. Mount less rich editor UI on mobile.
4. Make primitive snapshots/gutters dirty-line aware.
5. Cache projection/decoration work.
6. Optimize Android storage only if autosave traces prove periodic stalls.

## Ranked Bottlenecks

### 1. Text Edit Triggers Page/Runtime Work

Confidence: very high.

Evidence:

- `handleEditorDataChanged` calls page `render()` and dispatches `sceneEditor.renderCanvas` for normal text edits.
- `renderSceneEditorCanvas` still calls `store.selectProjectData()`, `renderSceneEditorState`, and `updateSceneEditorSectionChanges` even with `skipRender: true`.

Expected impact: largest quick win.

Recommended first behavior change:

- For `changeReason === "text"`, do not dispatch runtime/canvas sync unless an action/presentation-affecting field changed.
- Do not page-render if selected section/line/actions/chrome did not change.

### 2. Full-Section Primitive Snapshot/Diff Per Lexical Update

Confidence: very high.

Evidence:

- `syncFromEditorState` reads all root children, serializes all lines, clones all lines, rebuilds plain text, diffs all lines, then dispatches all lines.

Expected impact: large for long sections and IME composition.

Recommended change after gating global work:

- Track dirty line ids.
- Emit lightweight edit metadata during typing.
- Take full snapshots on debounce, blur, structure edits, composition end, and explicit save.

### 3. All Sections Mounted As Lexical Editors On Mobile

Confidence: high.

Evidence:

- Mobile loops all `sectionEditorItems` and mounts one `rvn-scene-document-editor-lexical` per section.
- Each primitive owns Lexical state, selection patching/listeners, render scheduling, and gutter layout.

Expected impact: large for many-section projects.

Recommended change:

- Mobile should mount only active/visible section editor, with inactive sections as lightweight blocks.

### 4. Gutter Layout Forces Per-Line Measurement

Confidence: high.

Evidence:

- `renderGutters()` loops every line, reads rects, writes styles/datasets, creates preview DOM, measures preview widths, and can schedule another render.

Expected impact: large for long sections and keyboard resize.

Recommended change:

- Dirty-line gutter rendering.
- Build preview DOM only after signature mismatch.
- Avoid measuring unchanged right-gutter content.

### 5. Page Selector Rebuilds Broad Data

Confidence: high.

Evidence:

- `selectViewData` rebuilds section presentations, graph JSON, layout/character arrays, all section decorations, and presentation state.

Expected impact: medium-to-large.

Recommended change:

- Split view data lanes.
- Gate `sectionsGraph` behind graph view.
- Cache text-style/mention/layout/decorations by stable revisions.

### 6. Project Data Projection Is Full-Project

Confidence: high.

Evidence:

- `selectProjectData` rebuilds source state, resources, story, and dialogue layout alignment.

Expected impact: large when runtime path is called often.

Recommended change:

- First gate calls out of text input.
- Later cache resource/story projection by revision.

### 7. Autosave Can Cause Periodic Stalls

Confidence: medium-high.

Evidence:

- Draft flush clones full sections, calls `syncSectionLinesSnapshot`, diffs the whole section, syncs project state, and renders.
- Android SQLite calls go through synchronous native bridge methods.

Expected impact: periodic freeze rather than every-keystroke latency.

Recommended change:

- Instrument first.
- If proven, track dirty lines and batch/coalesce Android draft/checkpoint writes.

## Instrumentation Order

Add temporary direct logs with prefix `[rvn.scene-editor-timing]`. Do not use new browser-global debug flags.

Minimum required traces:

1. `lexical.update`: snapshot, clone, diff, dispatch, line count, changed count, composition state.
2. `lexical.gutter`: render duration, line count, layout read count, replacement count, second render.
3. `page.editorDataChanged`: draft replacement, render duration, canvas dispatch flag.
4. `store.selectViewData`: total duration, section count, line count, decoration duration, graph duration.
5. `runtime.renderCanvas`: project-data duration, engine init, render-state select, section-change duration, UI render.
6. `mobile.keyboard`: event type, metric changes, toolbar render, parent render, event bursts.
7. `draft.flush`: queue delay, clone, sync snapshot, repository sync, equality/rebase, render.
8. `android.bridge`: sqlite query/exec count, total/max duration, payload/result sizes during flush.

## Best First Patch After Instrumentation

The first behavior patch should be intentionally small:

1. In `handleEditorDataChanged`, detect plain text-only changes.
2. For text-only changes:
   - update draft dirty state,
   - preserve selection if unchanged,
   - schedule draft flush,
   - skip page render unless chrome changed,
   - skip runtime/canvas sync.
3. Keep structure/action changes on the old path.
4. Add tests proving text-only edit does not call `renderCanvas`, while structure/action edits still do.

This gives the largest likely win with the lowest risk.

## Decision Points To Confirm With Product

- Should the preview canvas update dialogue text on every keystroke, or is debounced/blur update acceptable?
- On mobile, is it acceptable for inactive sections to be lightweight summaries instead of live editable rich editors?
- During composition, should draft save wait until composition end even if composition lasts several seconds?

## Red Flags

- Do not rewrite the primitive first. It is the riskiest area because it owns rich-text selection, reference chips, composition, and focus restoration.
- Do not optimize Android storage first unless traces show autosave stalls are the dominant issue.
- Do not add permanent debug flags or tests for temporary log payloads.
- Do not rely on desktop timing to decide Android performance.

## Final Recommendation

Proceed in this order:

1. Add temporary Android timing instrumentation.
2. Capture baseline traces on older Android with short section, long section, many sections, IME composition, keyboard open/close, and autosave.
3. Gate text edits away from page render and runtime/canvas sync.
4. Re-test Android timing.
5. Mount only active mobile section editor.
6. Re-test Android timing.
7. Make primitive snapshot/gutter work dirty-line aware.
8. Cache selector/projection/decorations if traces still show broad recomputation.
9. Optimize draft/storage if autosave remains a periodic stall.
