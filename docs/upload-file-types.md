# Upload File Types

## Purpose

This document is the source of truth for file types that may be uploaded into
RouteVN Creator.

Use it to keep all upload surfaces aligned:

- picker `accept` filters
- drag-and-drop accepted extensions
- page-level validation and user-facing error messages
- shared upload processing in `projectAssetService`

If an uploadable file type changes, update this document in the same PR.

## Rules

1. Every upload surface must define an explicit allowed file-type set.
2. Picker `accept` and drag-drop `acceptedFileTypes` must match for the same
   surface.
3. Invalid files must produce explicit user feedback.
   Silent filtering is not acceptable.
4. Surface-level acceptance must be enforced before calling
   `projectService.uploadFiles(...)`.
5. Shared runtime validation such as image-dimension checks or media decoding
   is additive.
   It does not replace surface-level file-type validation.
6. `src/deps/services/shared/projectAssetService.js` file-type detection is a
   processing fallback, not the product-level policy for what a page accepts.

## Validation Layers

### 1. Picker / Drop Surface

These are the first-line filters:

- picker `accept` values passed to `appService.pickFiles(...)`
- `acceptedFileTypes` passed into `rvn-media-resources-view`
- `acceptedFileTypes` passed into `rvn-drag-drop`

Shared extension matching currently lives in:

- `src/internal/fileTypes.js`
- `src/components/mediaResourcesView/mediaResourcesView.handlers.js`
- `src/components/dragDrop/dragDrop.handlers.js`

### 2. Page-Level Validation

Pages must validate unsupported types and show a user-facing toast/dialog.

Current explicit page validators:

- `src/pages/images/images.handlers.js`
- `src/pages/videos/videos.handlers.js`
- `src/pages/fonts/fonts.handlers.js`
- `src/pages/sounds/sounds.handlers.js`

### 3. Shared Picker Validation

`appService.pickFiles(...)` supports additional validations in
`src/deps/services/shared/fileSelectionService.js`.

Current validation types:

- `square`
- `image-min-size`

This is used for avatar/icon uploads.

### 4. Upload Processing

`src/deps/services/shared/projectAssetService.js` classifies files using
`detectFileType(...)` from `src/deps/clients/web/fileProcessors.js`.

This layer decides how to process a file after it has already been accepted by
the UI surface.

Supported processing buckets today:

- image
- audio
- video
- font
- generic

Current shared type fallbacks are intentionally narrower than before:

- images: `.jpg`, `.jpeg`, `.png`, `.webp`
- audio: `.mp3`, `.wav`, `.ogg`
- video: `.mp4`

## Current Upload Matrix

### Media Resource Pages

| Surface                | Allowed file types                                | Extra validation              | Notes                                  |
| ---------------------- | ------------------------------------------------- | ----------------------------- | -------------------------------------- |
| Images page            | `.jpg`, `.jpeg`, `.png`, `.webp`                  | explicit invalid-format toast | picker, center drag-drop, edit/replace |
| Character sprites page | `.jpg`, `.jpeg`, `.png`, `.webp`                  | none                          | picker, center drag-drop, edit/replace |
| Videos page            | `.mp4`                                            | explicit invalid-format toast | picker, center drag-drop, edit/replace |
| Sounds page            | `.mp3`, `.wav`, `.ogg`                            | explicit invalid-format toast | picker, center drag-drop, edit/replace |
| Fonts page             | `.ttf`, `.otf`, `.woff`, `.woff2`, `.ttc`, `.eot` | explicit invalid-format toast | picker, center drag-drop, edit/replace |

### Dialog / Special Upload Surfaces

| Surface                             | Allowed file types                | Extra validation                             | Notes                                      |
| ----------------------------------- | --------------------------------- | -------------------------------------------- | ------------------------------------------ |
| Character avatar upload             | `image/*`                         | `image-min-size` + square crop dialog        | create dialog, edit dialog, avatar replace |
| Project icon upload (create dialog) | `image/*`                         | `image-min-size` + square crop dialog        | projects page create dialog                |
| Project icon upload (settings)      | `image/*`                         | `square`                                     | project settings dialog                    |
| Text styles add-font dialog         | `.ttf`, `.otf`, `.woff`, `.woff2` | none in page, drop zone filters by extension | narrower than Fonts page today             |

## Current Code Locations

### Surface Filters

- Images: `src/pages/images/images.handlers.js`,
  `src/pages/images/images.store.js`
- Character sprites: `src/pages/characterSprites/characterSprites.handlers.js`,
  `src/pages/characterSprites/characterSprites.store.js`
- Videos: `src/pages/videos/videos.handlers.js`,
  `src/pages/videos/videos.store.js`
- Sounds: `src/pages/sounds/sounds.handlers.js`,
  `src/pages/sounds/sounds.store.js`
- Fonts: `src/pages/fonts/fonts.handlers.js`,
  `src/pages/fonts/fonts.store.js`
- Text styles font dialog: `src/pages/textStyles/textStyles.view.yaml`,
  `src/pages/textStyles/textStyles.store.js`,
  `src/pages/textStyles/textStyles.handlers.js`
- Character avatars: `src/pages/characters/characters.handlers.js`,
  `src/components/squareImageCropDialog/`,
  `src/components/squareImageCropper/`
- Project create icon: `src/components/projectCreateDialog/`,
  `src/components/squareImageCropDialog/`,
  `src/components/squareImageCropper/`
- Project settings icon: `src/pages/project/project.handlers.js`

### Shared Enforcement

- extension accept / matching: `src/internal/fileTypes.js`
- media center drag-drop: `src/components/mediaResourcesView/mediaResourcesView.handlers.js`
- generic drag-drop: `src/components/dragDrop/dragDrop.handlers.js`
- picker validation flow: `src/deps/services/shared/fileSelectionService.js`
- upload processing: `src/deps/services/shared/projectAssetService.js`
- processing type detection: `src/deps/clients/web/fileProcessors.js`

## Maintenance Checklist

When adding or changing an uploadable file type:

1. Update the page-level picker `accept` string.
2. Update the matching drag-drop `acceptedFileTypes`.
3. Add or update explicit page-level validation and user-facing error text.
4. Confirm `projectAssetService` can actually process the accepted file type.
5. Update this document.
6. Validate both picker upload and drag-drop upload.

## Current Drift To Watch

- Fonts are not fully centralized yet.
  The Fonts page accepts `.ttf`, `.otf`, `.woff`, `.woff2`, `.ttc`, `.eot`,
  while the Text Styles add-font dialog currently accepts only
  `.ttf`, `.otf`, `.woff`, `.woff2`.
- Some image-only surfaces still use `image/*` plus `square` validation instead
  of an explicit extension list.
  If stricter control is required, those surfaces should be narrowed and
  documented here in the same change.
- Sounds currently show copy that mentions `OGG (Windows only)`, but the upload
  surface itself does not enforce a platform-specific OGG restriction.
