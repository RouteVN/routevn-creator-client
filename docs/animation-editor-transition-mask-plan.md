# Animation Editor Transition Mask Plan

## Purpose

This document defines the end state and implementation path for adding
transition-mask support to the animation editor.

The goal is to let users build transition masks through normal RouteVN resource
workflows, not through raw JSON or manual asset-path entry.

This is a client plan first, but it intentionally calls out the runtime and
repository constraints that must be satisfied for the feature to be correct.

## End-State Definition

The work is complete when these conditions are true:

1. Transition animations can define an optional `mask`.
2. The editor supports all three `route-graphics` mask kinds:
   - `single`
   - `sequence`
   - `composite`
3. Users choose mask images from project image resources.
4. The editor exposes a clear mask UI in the transition animation editor right
   panel instead of a placeholder.
5. Transition preview uses the real transition rendering path when a mask is
   present, so preview, ruler scrub, and Play all reflect the actual masked
   transition.
6. Saved animation data remains compatible with `route-graphics`.
7. Export, runtime asset loading, and resource/file reachability all include
   mask image assets.
8. Deleting an image that is used by a transition mask is prevented or handled
   correctly by the existing resource-usage rules.

## Current State

### 1. `route-graphics` Already Supports Transition Masks

The engine already supports transition masks:

- schema support in
  `../../route-graphics/src/schemas/animations/animation.yaml`
- docs support in
  `../../route-graphics/src/plugins/animations/tween/docs/README.md`
- runtime support in
  `../../route-graphics/src/plugins/animations/replace/runReplaceAnimation.js`

Important engine facts:

- `mask` is transition-only.
- `mask` can be combined with `prev.tween` and `next.tween`.
- supported kinds are `single`, `sequence`, and `composite`.

### 2. The Client Editor Has No Mask Model Yet

The transition animation editor currently supports:

- `prev` property tweens
- `next` property tweens
- transition preview using two preview rectangles

But it does not support:

- any `mask` state in the editor
- any right-panel mask UI
- any persistence of mask configuration
- any real transition-mask preview path

The current transition preview in
`src/pages/animationEditor/animationEditor.store.js` is a simplified
two-rectangle tween preview, not a real masked transition preview.

### 3. Animation Projection Is Still Raw Pass-Through

Animation resources are currently projected through as raw `item.animation`
payloads in `src/internal/project/projection.js`.

That means whatever we save for masks must either:

- already be in a runtime-compatible shape, or
- be explicitly projected into one before runtime/export.

### 4. Asset Discovery Does Not Yet Know About Mask Fields

The generic render-state file scan in `src/internal/project/layout.js` only
detects known asset-bearing keys such as `fileId`, `url`, `src`, and similar.

It does not currently understand:

- `mask.texture`
- `mask.textures[]`
- `mask.items[].texture`

Without fixing that, mask assets may be omitted from runtime preloading or
export file collection.

## Recommended Product Shape

### Core Principle

Users should pick mask images from the project image library, not type or paste
raw texture keys.

The editor should stay no-code and resource-oriented:

- image resources are selected through image-picker UI
- mask kinds are chosen through structured controls
- sequence and composite masks are edited through ordered lists, not raw arrays

### Right Panel UI

The right panel in the transition animation editor should become the `Mask`
panel.

Recommended first visible structure:

- `Mask`
- `Enabled`
- `Kind`
- shared fields:
  - `Softness`
  - `Invert`
- kind-specific content:
  - `Single`
    - one mask image
    - one channel
  - `Sequence`
    - ordered mask image list
    - shared channel
    - `Sample`
  - `Composite`
    - ordered item list
    - per-item image
    - per-item channel
    - per-item invert
    - `Combine`
- progress controls:
  - first version should expose a simple progress editor
  - recommended first version shape:
    - `Duration`
    - `Easing`
  - this should compile to:
    - `progress.initialValue = 0`
    - one keyframe to value `1`

This keeps v1 usable while avoiding a second full keyframe editor inside the
right panel.

## Recommended Data Model

### Editor Contract

The editor should use image-resource references, not raw free-form texture
strings.

Recommended editor-side shape:

```js
{
  kind: "single" | "sequence" | "composite",
  imageId: "..." ,
  imageIds: ["..."],
  items: [
    {
      imageId: "...",
      channel: "red",
      invert: false,
    },
  ],
  channel: "red",
  combine: "max",
  sample: "linear",
  softness: 0.08,
  invert: false,
  progressDuration: 900,
  progressEasing: "linear",
}
```

This is not the final runtime payload. It is the editor-facing contract.

### Runtime / Saved Animation Contract

The final animation payload must still be compatible with `route-graphics`.

Recommended compiled shape:

```js
{
  type: "transition",
  prev: { tween: ... },
  next: { tween: ... },
  mask: {
    kind: "single" | "sequence" | "composite",
    texture: "...",
    textures: ["..."],
    items: [
      {
        texture: "...",
        channel: "red",
        invert: false,
      },
    ],
    channel: "red",
    combine: "max",
    sample: "linear",
    softness: 0.08,
    invert: false,
    progress: {
      initialValue: 0,
      keyframes: [
        {
          duration: 900,
          value: 1,
          easing: "linear",
        },
      ],
    },
  },
}
```

## Chosen Direction

The preferred long-term direction is:

1. keep the editor/resource contract image-resource-based
2. compile that contract to the raw `route-graphics` mask shape before runtime
   use
3. ensure file extraction and asset loading understand the compiled mask
   texture fields

Why this is the right direction:

- users choose project images, not file ids
- image-resource semantics remain visible at editor level
- runtime still receives the exact shape `route-graphics` expects

If repository/model validation currently requires the raw `route-graphics`
shape, that validation must be updated before or together with the client save
path.

## Architecture Direction

### 1. Keep The Animation Editor As The Composition Root

The page files remain the composition root:

- `src/pages/animationEditor/animationEditor.store.js`
- `src/pages/animationEditor/animationEditor.handlers.js`
- `src/pages/animationEditor/animationEditor.view.yaml`

Mask-specific constants can live in:

- `src/pages/animationEditor/animationEditor.constants.js`

Small pure projection helpers should live in:

- `src/internal/animationDisplay.js`

Runtime/resource projection changes belong in:

- `src/internal/project/projection.js`
- `src/internal/project/layout.js`

### 2. Replace The Fake Transition Preview Path

The current transition preview should not stay as a separate fake path once mask
support exists.

Recommended end state:

- update animations keep the current simple update preview pipeline
- transition animations use one real transition preview pipeline
- that transition preview pipeline is used for:
  - initial preview render
  - Play
  - ruler scrub

This avoids preview drift between tween-only transitions and masked transitions.

### 3. Reuse Existing Image Selection UI

Use existing project image selection patterns rather than inventing a mask-only
picker.

Relevant reusable UI today:

- `src/components/imageSelector/`
- `src/components/fileImage/`

The mask editor should select by image resource, not by uploaded file directly.

## Workstreams

### 1. Editor State And Persistence

Deliverables:

- transition animation store state gains optional `mask`
- load/edit/save path for mask configuration
- autosave persists mask changes
- add/remove/reorder logic for sequence and composite items

Completion criteria:

- existing transition animations load without mask state
- new mask data saves and reloads correctly
- transition animations can have:
  - prev/next only
  - mask only
  - prev/next plus mask

### 2. Right Panel Mask UI

Deliverables:

- replace the placeholder panel with a real mask editor
- kind switcher
- shared fields
- image picker integration
- sequence list editor
- composite item list editor

Completion criteria:

- no raw JSON editing is required
- users can fully author `single`, `sequence`, and `composite` masks through UI

### 3. Transition Preview Pipeline

Deliverables:

- one real transition preview renderer for transition animations
- preview path that can include `mask`
- ruler scrub support for transition preview
- playhead behavior remains aligned with the shared ruler

Completion criteria:

- Play reflects real masked transitions
- ruler hover scrubs the real transition result
- preview does not fall back to the old fake two-update path when mask exists

### 4. Runtime Projection And Asset Resolution

Deliverables:

- animation projection compiles editor mask data into `route-graphics`
  transition mask data
- mask textures resolve to loadable runtime asset keys
- export/runtime file discovery includes mask textures

Completion criteria:

- scene/layout runtime can load mask assets automatically
- export includes mask files
- runtime asset keys match what `route-graphics` resolves through `Assets`

### 5. Resource Usage And Deletion Safety

Deliverables:

- image usage tracking includes images referenced by animation masks
- deleting an image referenced by a mask follows the same safety behavior as
  other live image references

Completion criteria:

- image cleanup does not remove mask-dependent assets incorrectly
- project usage/export scans keep those assets alive

## Suggested Execution Order

1. Define the editor-side mask contract and compiled runtime mask contract.
2. Add store persistence for mask state.
3. Build the right-panel mask editor UI.
4. Add compile helpers from editor mask state to `route-graphics` mask payload.
5. Extend runtime/export file discovery for mask textures.
6. Replace the transition preview path with a real transition renderer.
7. Validate deletion/usage tracking for image resources referenced by masks.
8. Remove any temporary preview-only or save-time fallback code.

## Validation Requirements

For the feature work:

- `bun run lint`
- `bun run build:tauri`

Recommended targeted validation:

- transition animation save/load with:
  - `single` mask
  - `sequence` mask
  - `composite` mask
- transition preview Play for:
  - mask only
  - prev/next plus mask
- ruler scrub for masked transitions
- export/runtime asset discovery for mask images
- image deletion protection when an image is used by a mask

## Risks

### 1. Raw Runtime Contract Leakage

If the UI writes raw texture strings directly, the feature becomes technical and
error-prone.

The editor must remain image-resource-driven.

### 2. Preview Drift

If tween-only transitions keep using the fake preview while masked transitions
use the real one, the editor will have two different transition preview models.

That split will create maintenance and behavior drift.

### 3. Asset Discovery Gaps

If mask texture fields are not included in file extraction and runtime loading,
the feature may appear to save correctly but fail in preview, export, or scene
runtime.

### 4. Repository / Model Contract Mismatch

If the creator-model schema currently assumes raw `route-graphics` animation
payloads only, an image-resource-based editor contract will need a matching
schema update.

This must be settled before shipping the persistence layer.

## Done Criteria

This plan is done when:

- the transition editor can author all three mask kinds through structured UI
- preview, Play, and scrub all work with masks
- saved transition animations remain runtime-compatible
- export/runtime correctly include mask assets
- image resource usage and deletion logic treat mask references as live
- the placeholder right panel is gone for transition animations
