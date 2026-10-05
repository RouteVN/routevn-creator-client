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
7. Media upload pages that render temporary processing cards must preserve a
   stable final resource id from pending state through the create/import call.
   The pending card's `resolvedItemId` and the created repository item's id
   must match.

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
- `src/pages/spritesheets/spritesheets.handlers.js`
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

#### Audio Content Validation

Picker-reported audio MIME types are not trusted. The iOS 16 file picker has
no MIME type for `.ogg` and reports it as `application/octet-stream`, and a
renamed file can carry any extension.

An audio upload is accepted only if it decodes. `processFile(...)` decodes the
file for its waveform before storing anything. If decoding fails, it throws an
error with code `unsupported_audio_format`, and `uploadFiles(...)` rethrows it
the same way as `image_texture_too_large`, so the failure is never silently
filtered. The Sounds page shows its localized unsupported-format alert for this
code, and the scene editor voice upload shows its invalid-format alert.

An accepted file is stored with a MIME type taken from its bytes by
`detectAudioMimeTypeFromBytes(...)` in `src/internal/fileTypes.js`, not the
picker-reported type:

| Format | Signature                                               | Stored MIME  |
| ------ | ------------------------------------------------------- | ------------ |
| OGG    | `OggS`                                                  | `audio/ogg`  |
| WAV    | `RIFF` with `WAVE` at byte 8                            | `audio/wav`  |
| MP3    | `ID3` tag, or an MPEG audio frame sync with a layer set | `audio/mpeg` |

AAC ADTS frames share the MPEG sync bits but use layer 0, so they do not match
the MP3 signature. When decodable bytes match no signature, such as an MP3 with
leading padding, the type comes from the `.mp3`, `.wav`, or `.ogg` extension.
Sound and voice resources derive `fileType` from the stored file record.

Sounds uploaded before this check may have `application/octet-stream` records,
which the graphics service routes to the image loader. Tapping a sound on the
Sounds page calls `projectService.repairSoundFileType(...)`:

- It does nothing unless the sound's current file record is
  `application/octet-stream` and its bytes match a signature.
- File records are immutable, so it stores the same bytes with the detected
  type and points the sound at the new file. The old file is left unreferenced,
  as with a sound replacement.
- It re-checks the sound's file just before `updateSound`, so a sound replaced
  or deleted during the copy is not overwritten. A rejected update shows the
  "Failed to update sound." toast.
- Repairs run one at a time, and repeated taps on a sound being repaired are
  ignored.

Untapped sounds stay broken in Preview until then, and voices have no repair
path. Exported players already resolve generic bundle MIME types from file
bytes through `resolveBundleAssetMimeType(...)`.

### 5. Pending Upload Reconciliation

Media resource pages render temporary processing cards from local
`pendingUploads` state before the repository item exists.

The reconciliation contract is:

- the page creates a pending upload id for the temporary card
- once the final repository item id is known, the page stores it as
  `resolvedItemId`
- the actual create/import call must use that same final item id
- `createMediaPageStore` hides the created repository item while the matching
  pending card is still present
- the page removes the pending card immediately after a successful refresh

If the final create/import path drops or replaces the caller-owned item id, the
UI can briefly render both the processing card and the uploaded item at the
same time.

## Current Upload Matrix

### Media Resource Pages

| Surface                | Allowed file types                                 | Extra validation              | Notes                                                          |
| ---------------------- | -------------------------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| Images page            | `.jpg`, `.jpeg`, `.png`, `.webp`                   | explicit invalid-format toast | picker, center drag-drop, edit/replace                         |
| Spritesheets page      | `.png` + `.json`                                   | explicit pair + format toast  | picker and drag-drop import one PNG sheet plus one atlas JSON  |
| Character sprites page | `.jpg`, `.jpeg`, `.png`, `.webp`; `.png` + `.json` | explicit pair + format toast  | upload menu supports image or spritesheet; edit/replace images |
| Videos page            | `.mp4`                                             | explicit invalid-format toast | picker, center drag-drop, edit/replace                         |
| Sounds page            | `.mp3`, `.wav`, `.ogg`                             | invalid-format alert + bytes  | picker, center drag-drop, edit/replace; see audio validation   |
| Fonts page             | `.ttf`, `.otf`, `.woff2`                           | format + weight metadata      | picker, center drag-drop, edit/replace                         |

For iOS Photo Library selections, the native picker preserves supported JPEG,
PNG, and WebP representations. Photos in other formats, such as HEIC, are
converted to JPEG or PNG when that format is allowed by the requesting surface.
The returned files still pass the same page and upload-service validations.

### Dialog / Special Upload Surfaces

| Surface                             | Allowed file types       | Extra validation                      | Notes                                      |
| ----------------------------------- | ------------------------ | ------------------------------------- | ------------------------------------------ |
| Character avatar upload             | `image/*`                | `image-min-size` + square crop dialog | create dialog, edit dialog, avatar replace |
| Project icon upload (create dialog) | `image/*`                | `image-min-size` + square crop dialog | projects page create dialog                |
| Project icon upload (settings)      | `image/*`                | `square`                              | project settings dialog                    |
| Text style editor add-font dialog   | `.ttf`, `.otf`, `.woff2` | format + weight metadata              | matches the Fonts page                     |
| Scene editor voice upload           | `.mp3`, `.wav`, `.ogg`   | invalid-format alert + bytes          | see audio validation; matches Sounds page  |

### Import Packages

Animation and transform import packages may create image dependencies. This
network-backed surface follows the Images page policy and accepts only JPEG,
PNG, and WebP (`image/jpeg`, `image/png`, and `image/webp`). Generalized asset
packages validate every persistent file from the resource and field that owns
the reference:

- images, spritesheets, character sprites, and image thumbnails: JPEG, PNG,
  or WebP
- sounds: MP3, WAV, or OGG
- videos: MP4
- fonts: TTF, OTF, or WOFF2
- sound waveform metadata: JSON

The import path enforces the policy in layers:

1. The manifest must declare file MIME metadata.
2. A contradictory HTTP response content type is rejected before staging.
3. The resolved MIME type must match the file policy for its owning resource.
4. SHA-256 is verified when the package provides it.
5. Normal decoding or parsing for the owning image, audio, video, font, or JSON
   resource must succeed before the atomic resource command batch is submitted.
6. Any original or derived blob stored before a decoding/thumbnail failure is
   tracked by the import plan and deleted through the platform file adapter.

Package image replacement is also validated through the same workflow: when a
user maps a package image to an existing project image, the package file is not
downloaded or stored.

## Current Code Locations

### Surface Filters

- Images: `src/pages/images/images.handlers.js`,
  `src/pages/images/images.store.js`
- Spritesheets: `src/pages/spritesheets/spritesheets.handlers.js`,
  `src/pages/spritesheets/spritesheets.store.js`
- Character sprites: `src/pages/characterSprites/characterSprites.handlers.js`,
  `src/pages/characterSprites/characterSprites.store.js`
- Videos: `src/pages/videos/videos.handlers.js`,
  `src/pages/videos/videos.store.js`
- Sounds: `src/pages/sounds/sounds.handlers.js`,
  `src/pages/sounds/sounds.store.js`
- Fonts: `src/pages/fonts/fonts.handlers.js`,
  `src/pages/fonts/fonts.store.js`
- Text style editor font dialog:
  `src/pages/textStyleEditor/textStyleEditor.view.yaml`,
  `src/pages/textStyleEditor/textStyleEditor.store.js`,
  `src/pages/textStyleEditor/textStyleEditor.handlers.js`
- Character avatars: `src/pages/characters/characters.handlers.js`,
  `src/components/squareImageCropDialog/`,
  `src/components/squareImageCropper/`
- Project create icon: `src/components/projectCreateDialog/`,
  `src/components/squareImageCropDialog/`,
  `src/components/squareImageCropper/`
- Project settings icon: `src/pages/project/project.handlers.js`

### Shared Enforcement

- extension accept / matching and audio byte signatures:
  `src/internal/fileTypes.js`
- media center drag-drop: `src/components/mediaResourcesView/mediaResourcesView.handlers.js`
- generic drag-drop: `src/components/dragDrop/dragDrop.handlers.js`
- picker validation flow: `src/deps/services/shared/fileSelectionService.js`
- upload processing: `src/deps/services/shared/projectAssetService.js`
- processing type detection: `src/deps/clients/web/fileProcessors.js`
- pending upload reconciliation: `src/internal/ui/resourcePages/media/createMediaPageStore.js`,
  `src/internal/ui/resourcePages/media/processPendingUploads.js`,
  `src/deps/services/shared/projectServiceCore.js`
- import package network and staging enforcement:
  `src/deps/clients/importPackageClient.js`,
  `src/deps/services/shared/resourcePackageImportService.js`,
  `src/deps/services/shared/projectAssetService.js`

## Maintenance Checklist

When adding or changing an uploadable file type:

1. Update the page-level picker `accept` string.
2. Update the matching drag-drop `acceptedFileTypes`.
3. Add or update explicit page-level validation and user-facing error text.
4. Confirm `projectAssetService` can actually process the accepted file type.
5. If the surface shows processing cards, confirm the pending card's
   `resolvedItemId` matches the actual created repository item id.
6. Update this document.
7. Validate both picker upload and drag-drop upload.

## Font Compatibility

- New font uploads accept `.ttf`, `.otf`, and `.woff2` files. WOFF1 uploads are
  rejected with an invalid-format alert.
- All three upload formats are decoded through the shared font inspection path
  before their weight metadata is persisted.
- Static fonts expose only their declared `OS/2.usWeightClass` for new text
  styles.
- Variable fonts expose weight choices within their declared `fvar` `wght`
  range.
- If a supported font container opens but its weight metadata cannot be read,
  the three weight fields are left absent. Text Styles treats that font as
  unknown and offers the complete standard 100–900 weight list.
- A file that is not a valid supported font container is still rejected.
- Existing WOFF1 resources remain readable, renderable, and eligible for weight
  metadata migration. Existing TTC and EOT resources remain readable and
  renderable without strict weight metadata.
- Existing text styles keep saved weight values even if the selected font does
  not declare that weight.

### Default Template Font Selection

- The default template contains 400 and 600 WOFF2 resources for combined Latin,
  Greek, and Cyrillic coverage, plus dedicated Simplified Chinese, Traditional
  Chinese, Japanese, and Korean pairs.
- New `zh-Hans`, `zh-Hant`, `ja`, and `ko` projects receive their matching font
  pair. Every other project language currently receives the Latin pair.
- The combined pair also covers Vietnamese and IPA.
- Project initialization removes unselected font resources and file records
  before repository creation. Web, Tauri, Android, and iOS then copy only the
  files retained by the resolved template.
- Changing project language after creation does not replace project fonts or
  rewrite text styles.

## Current Drift To Watch

- Some image-only surfaces still use `image/*` plus `square` validation instead
  of an explicit extension list.
  If stricter control is required, those surfaces should be narrowed and
  documented here in the same change.

## Device Image Dimension Limits

Images, character sprite images, and spritesheet atlas images must fit within
this device's WebGL `MAX_TEXTURE_SIZE` on both axes. The exact limit is allowed.
The limit is queried at runtime, never saved in project settings, and never
inferred from a device model. Upload pages probe a temporary WebGL context once
per session and immediately release it. Failure to determine the limit blocks
image upload with visible feedback.

Picker and drag/drop batches are checked before storing files. Oversized files
are excluded, supported files continue, and one warning lists all oversized
filenames and dimensions plus the device limit. An entirely rejected selection
creates no resources and shows no additional generic upload failure. Replacement
uploads retain the existing resource when rejected. Spritesheets are checked by
the full PNG atlas dimensions; users must re-export the atlas and JSON together.
Shared asset processing also checks dimensions before writing original files or
thumbnails, including image package imports.

This is a device capability check, not a cross-device compatibility guarantee or
a GPU memory guarantee. Existing images loaded into the shared graphics service
are checked against the active renderer's limit, including files imported on
another device. Oversized textures are omitted and reported through the existing
asset-failure UI. Saved originals and references are not modified.
