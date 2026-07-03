# Iteration 11 - Validation And Regression Risk

## Question

What validation is needed before simplifying the scene editor hot path?

## Evidence

- There is extensive rich-text primitive coverage in `tests/sceneEditor/lexicalLineEditing.test.js`.
- There is preview/gutter-style coverage in `tests/sceneEditor/lexicalLinePreview.test.js`.
- Scene editor project-data projection is covered in `tests/sceneEditor/lexicalProjectData.test.js`.
- Draft persistence behavior is covered in `tests/sceneEditor/lexicalDraftPersistence.test.js`.
- Line decorations are covered in `tests/sceneEditor/lineViewModels.test.js`.
- Scene editor page handlers have targeted tests in `tests/sceneEditor/sceneEditorLexical.handlers.test.js`.
- There is a manual Android keyboard screenshot script at `scripts/mobile-keyboard-screenshot-android.js`.
- VT coverage for the scene editor exists in `vt/specs/project/scenes.yaml`.

## Finding

The repo has useful correctness tests for content editing, projection, decoration, persistence, and scene editor handlers. That is good for refactoring safety.

The missing layer is performance-behavior validation:

- no automated guard that normal text input avoids route-runtime work,
- no automated guard that keyboard geometry changes do not cause full editor recomputation,
- no Android timing budget,
- no composition-specific performance assertion,
- no test that only the active mobile section editor is mounted if we choose that architecture,
- no regression test proving deferred full snapshots still persist final text correctly.

## Refactor Risks

The most fragile areas are:

- IME composition: deferring snapshots can lose intermediate content if composition end is mishandled.
- Selection/caret restoration: avoiding page render must not break selected-line state or toolbar commands.
- Draft reliability: debounced or delta-based persistence must still save exact final content.
- Preview expectations: if live preview text currently updates per keystroke, changing it to debounce must be product-approved.
- Section navigation: mounting fewer editors must preserve cross-section arrow navigation, scroll positioning, and section headers.
- System actions: action editor must still receive the selected line's current actions after deferred text updates.

## Validation Plan

1. Before changes:
   - Add temporary Android timing logs.
   - Record baseline traces for short section, long section, many sections, IME composition, keyboard open/close, and autosave.

2. For hot-path gating:
   - Unit-test that plain `reason: "text"` does not dispatch runtime/canvas sync when no presentation-affecting field changed.
   - Unit-test that structure/action changes still dispatch runtime/canvas sync.
   - Browser-test final serialized content after fast typing and blur.

3. For composition:
   - Browser-test composition start/update/end if practical.
   - At minimum, manual Android test with Japanese/Chinese IME and long text input.

4. For mobile active-section mounting:
   - Test that selected section editor is mounted and inactive sections are lightweight.
   - Test cross-section navigation and section switching.
   - Validate scroll restoration and toolbar availability on Android.

5. For autosave:
   - Keep existing draft persistence tests.
   - Add dirty-line/delta tests only if the persistence model changes.

## Confidence

High. The existing test surface is strong for correctness, but Android performance must be validated with direct timing output and manual/device runs.

## Next Question

What is the simplest architecture that removes the hot-path coupling without rewriting the editor from scratch?
