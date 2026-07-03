# Iteration 09 - Draft Flush And Autosave

## Question

Can autosave create periodic freezes even if per-keystroke work is reduced?

## Evidence

- Text draft saves debounce at 2000 ms, have a 5000 ms minimum interval, and a 10000 ms maximum wait at `src/internal/ui/sceneEditorLexical/draftPersistence.js:14`.
- `scheduleSceneEditorDraftFlush` clears/replaces the save timer at `src/internal/ui/sceneEditorLexical/draftPersistence.js:356` through `:397`.
- `flushSceneEditorDrafts` syncs draft input, selects pending draft sections, and enters the latest-only persistence queue at `src/internal/ui/sceneEditorLexical/draftPersistence.js:168` through `:223`.
- For each pending draft section, it clones all draft lines into `snapshotLines` at `src/internal/ui/sceneEditorLexical/draftPersistence.js:263`.
- It calls `projectService.syncSectionLinesSnapshot({ sectionId, lines: snapshotLines })` at `src/internal/ui/sceneEditorLexical/draftPersistence.js:269`.
- After persistence, it syncs store project state at `src/internal/ui/sceneEditorLexical/draftPersistence.js:273`.
- It compares current draft lines against the snapshot using `areSceneEditorLinesEqual` at `src/internal/ui/sceneEditorLexical/draftPersistence.js:282`.
- It may reconcile the current editor session at `src/internal/ui/sceneEditorLexical/draftPersistence.js:316` through `:321`.
- It calls `deps.render()` after the flush completes at `src/internal/ui/sceneEditorLexical/draftPersistence.js:333`.
- `syncSectionLinesSnapshot` builds desired line id lists, maps desired lines with `structuredClone`, computes deletes/creates/moves, and compares dialogue with `JSON.stringify` at `src/deps/services/shared/commandApi/story.js:561` through `:709`.

## Finding

Autosave is not the likely cause of every keystroke lag because it is debounced. But when it fires, it can produce periodic stalls:

- full-section clone,
- command-context lookup,
- full section diff for deleted/created/moved/updated lines,
- per-line dialogue JSON comparisons,
- command submission,
- project-state sync,
- editor session reconciliation,
- full page render.

On older Android, this can show up as "typing is mostly okay, then freezes every few seconds."

## Optimization Hypothesis

- Instrument draft flush separately from keystrokes.
- Store dirty line ids or dirty ranges during editing, so autosave can avoid full-section diff when only one dialogue changed.
- Avoid page render after clean save unless visible save state changed or repository revision needs visible UI updates.
- Consider idle scheduling for expensive post-save reconciliation on mobile.
- During IME composition, avoid forcing draft sync until composition end.

## Confidence

High for periodic-stall risk. Medium for exact user impact until measured on Android.

## Next Question

What instrumentation shape will prove which lane dominates on real devices?
