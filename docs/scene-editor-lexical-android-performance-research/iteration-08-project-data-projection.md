# Iteration 08 - Project Data Projection

## Question

How much work is hidden behind `store.selectProjectData()` when text edits dispatch runtime/canvas sync?

## Evidence

- `selectProjectData` calls `buildProjectDataSourceState`, then sanitizes the source state, then calls `constructProjectData` at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:1573`.
- `buildProjectDataSourceState` walks all domain scenes, sections, and lines at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:514` through `:552`.
- For draft sections, it clones draft lines at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:544`.
- It looks up each draft line with `draftLines.find(...)` inside the line loop at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:552` through `:554`.
- It structured-clones line actions into the source state at `src/pages/sceneEditorLexical/sceneEditorLexical.store.js:560` through `:562`.
- `constructProjectData` constructs all project resources and full story data at `src/internal/project/projection.js:1331` through `:1342`.
- `constructProjectResources` scans/rebuilds images, spritesheets, videos, sounds, voices, animations, characters, transforms, particles, layouts, controls, text styles, colors, fonts, variables, layout resources, and character-derived resources at `src/internal/project/projection.js:1163` through `:1248`.
- `constructStory` walks all scenes, sections, and lines and normalizes every line action at `src/internal/project/projection.js:1251` through `:1306`.
- `alignDialogueModesWithLayouts` walks all story lines again at `src/internal/project/projection.js:1309` through `:1328`.

## Finding

`selectProjectData()` is full-project projection. It is appropriate for runtime initialization, export, and preview setup, but it is too expensive to call after every plain text edit on an older Android device.

The projection also includes several non-text dependencies: resources, layouts, controls, fonts, colors, transforms, animations, particles, and unrelated scenes. Most of those cannot change from typing a character in dialogue.

## Optimization Hypothesis

Priority order:

1. Gate calls to `selectProjectData()` out of the normal text keystroke path.
2. If live preview must update text, implement a narrow current-line text patch or debounced preview-text refresh.
3. Cache resource projection by repository revision/resource collection identity.
4. Cache story projection by scene/section revision when possible.
5. Replace draft `find()` lookup with a `Map` when projection still needs draft overlays.

## Confidence

High. This is a full-project algorithmic path.

## Next Question

Can autosave/draft flush cause periodic stalls independent of immediate typing?
