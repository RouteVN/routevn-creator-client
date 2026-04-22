# Export Bundle Size Reduction Plan

## Goal

Reduce release export size in the `Versions` flow without changing the runtime
behavior of exported games.

The work should happen in this order:

1. Do not export resources and assets that can never be reached at runtime.
2. Apply ordinary compression wins that are currently missing.
3. Remove repeated byte ranges across the remaining exported assets.

The first step is higher priority than deduplication. If we can prove an asset
is unreachable, we should not ship it at all.

## Current State

The current branch implements the main export-bundle changes already:

- `src/pages/versions/versions.handlers.js`
  - snapshots repository state for the selected version
  - compiles export usage from reachability
  - builds filtered `projectData`
  - exports explicit `{ fileId, mimeType }` file entries
- `src/internal/project/projection.js`
  - walks reachable story content from `story.initialSceneId`
  - follows transitions from story content and layouts/controls
  - filters scenes, sections, lines, resources, and file ids from that graph
- `src-tauri/src/export_zip.rs`
  - writes shipping distribution ZIPs
  - emits `package.bin v4`
  - uses whole-file dedupe for raw payloads
  - uses diced-image atlases for eligible image groups
- `scripts/main.js`
  - reads `package.bin v4`
  - reconstructs diced images back into normal runtime assets

## Remaining Opportunities

### 1. Reachability Needs Continued Regression Coverage

The reachability pass is implemented, but it remains the highest-risk export
area. Future feature work must keep adding tests for newly introduced runtime
dependencies.

### 2. Startup Cost For Diced Images Is Still Eager

Bundle size can improve while player startup still does atlas decode and diced
image reconstruction before first render. This is an acceptable tradeoff for
now, but it is the main remaining runtime cost to watch.

### 3. Some Asset Sets Still Need Raw Fallbacks

Not every bundle benefits from image optimization. The native exporter should
keep raw whole-file storage as the default fallback whenever diced output does
not earn its keep.

## Recommended Technical Direction

### Step A: Stronger Export Reachability

Add a proper export reachability compiler before bundling:

- compute the set of reachable scenes from `story.initialSceneId`
- compute the reachable sections and lines inside those scenes
- collect all resource references from reachable story content only
- recursively expand resource dependencies
  - layouts -> controls/layout refs/colors/text styles/fonts/images/videos
  - text styles -> fonts/colors/backgrounds/etc.
  - characters -> sprites -> image file ids
  - animations/transforms -> referenced assets and nested resources
  - variables only when runtime semantics require them
- derive final exported resource ids and final exported file ids from that
  compiled graph

Expected result:

- dead scenes stop keeping assets alive
- dead resources stop keeping file ids alive
- exported `projectData` and exported files are aligned to the same reachable
  graph

### Step B: Baseline Compression

Apply compression before deduplication work:

- JS test/smoke ZIP generation: use `DEFLATE` intentionally and measure the result
- Tauri ZIP export: switch from `Stored` to a compressed mode where practical
- evaluate whether `package.bin` itself should remain raw inside the ZIP or be
  wrapped in additional compression only at the ZIP layer

This is not a substitute for dedupe, but it should land first because it is
small, low-risk, and immediately measurable.

### Step C: `package.bin` v4 With Native Image Optimization

Keep the custom bundle format, but move the shipping optimization work into the
native Tauri exporter.

Current implemented direction:

- keep whole-file dedupe for all bundled payloads
- use `package.bin v4`
- optimize repeated image regions through diced image atlases in native export
- reconstruct diced images back into normal runtime image assets in the player

This keeps the player contract stable while letting export optimize the asset
payloads that actually benefit.

## Chosen Implementation Model

### Shipping Export Path

There is one production export path:

- shipping distribution ZIPs are produced by the native Tauri exporter
- the native exporter writes `package.bin v4`
- the player runtime reads `package.bin v4`

The shared JS bundle writer is retained only for tests and smoke scripts. It is
not a production export path.

### Why This Is The Right Split

- Tauri already owns the production distribution ZIP flow.
- native export has direct disk access and can run heavier image optimization
  without adding web-worker/wasm complexity
- keeping the shared JS path minimal reduces format-drift risk instead of
  pretending there are two equivalent bundlers

## Proposed Architecture

### Phase 1: Reachability Compiler

Add a dedicated export reachability layer in `src/internal/project/`.

Suggested responsibilities:

- compile reachable story graph from `initialSceneId`
- compile reachable resource graph from reachable story content
- return:
  - reachable scene ids
  - reachable section ids
  - reachable line ids
  - reachable resource ids by type
  - reachable file ids

Suggested output shape:

```js
{
  story: {
    sceneIds: [],
    sectionIds: [],
    lineIds: [],
  },
  resources: {
    images: [],
    videos: [],
    sounds: [],
    animations: [],
    transforms: [],
    characters: [],
    sprites: [],
    fonts: [],
    colors: [],
    textStyles: [],
    layouts: [],
    controls: [],
    variables: [],
  },
  fileIds: [],
}
```

Then update export filtering so it uses this compiled result rather than a
shallow whole-repository scan.

### Phase 2: Bundle Compression Baseline

Make no format change yet.

- compress ZIP output intentionally in web and Tauri
- add measurement logging in development/tests so we know:
  - raw asset bytes
  - exported asset count
  - final `package.bin` bytes
  - final ZIP bytes

This gives a reliable before/after baseline for the dedupe work.

### Phase 3: Native Bundle Core

Create a native export core that owns:

- `package.bin v4` manifest encoding
- whole-file dedupe for raw payloads
- diced-image atlas generation for eligible images
- streamed ZIP writing and export stats

Suggested structure:

- keep Tauri command wiring in `src-tauri/src/`
- keep the shared JS writer minimal and test-only

## `package.bin v4` Shape

The implemented format is conceptually:

1. version/header
2. manifest length
3. manifest JSON
4. unique chunk payload area

Manifest contents include:

- `chunking`
  - currently `whole-file-only` in the shared JS test writer
- `chunks`
  - chunk id/hash
  - start offset
  - byte length
- `assets`
  - raw asset entries
  - or diced-image entries with atlas references and reconstruction metadata
- `atlases`
  - atlas image payload entries for diced assets
- `instructions`
  - bundle instructions metadata

## Runtime / Player Changes

Update `scripts/main.js` to:

- read `package.bin v4`
- reconstruct raw assets from stored payload chunks
- reconstruct diced-image assets from atlas images before handing them to the
  existing asset pipeline

There is no migration window in the current branch. The runtime and the
shipping exporter both target `v4`.

## Deferred Follow-Up: `route-graphics` Asset Loading

This is not required for the current bundle-size work, but it is a likely
follow-up if diced-image exports start improving disk size while still adding
too much startup cost.

Current limitation:

- the bundle player materializes a full `assetBufferMap` up front
- `route-graphics.loadAssets(...)` eagerly realizes the entire map
- diced images therefore pay atlas decode, pixel reconstruction, and runtime
  texture creation during startup, even when many of those assets are not used
  by the opening scene

Potential future improvement:

- extend `route-graphics` to support lazy asset resolvers, so assets can be
  realized on first use instead of all at startup
- or allow direct `ImageBitmap`, canvas, or raw RGBA pixel sources so diced
  images do not need to be re-encoded as PNG blobs just to fit the current
  asset-loading contract

Expected benefit:

- faster first render / startup
- lower peak memory during bundle boot
- less wasted CPU work for unused diced assets
- simpler diced-image runtime pipeline

This should stay deferred until startup cost becomes a real bottleneck. The
current export/runtime work should not expand into `route-graphics` changes by
default.

## Testing Plan

### Reachability Tests

Add tests that prove unused content is removed:

- unreachable scene does not keep image alive
- unreachable layout/control does not keep resources alive
- dead character/sprite chain does not keep file alive
- dead text style/font chain does not keep file alive
- reachable nested dependency remains exported

### Bundle Format Tests

Add tests that prove `v4` correctness:

- reconstructing raw assets from manifest yields original bytes
- exact duplicate raw assets collapse into one stored payload
- diced-image assets resolve through atlas metadata correctly
- exported runtime still boots from the generated bundle

## Acceptance Criteria

### Reachability Milestone

- export excludes files from unreachable story content
- filtered `projectData` and filtered files come from the same dependency graph
- tests cover nested dependency cases

### Compression Milestone

- web and Tauri exports use intentional compression settings
- size measurements are recorded before dedupe lands

### Dedupe Milestone

- `package.bin v4` stores repeated raw assets once
- eligible `png` / `jpeg` / `webp` assets can be emitted as diced-image atlases
- exported runtime still loads correctly
- Tauri export is the production path
- the shared JS writer stays minimal and test-only

## Risks

### 1. False Negatives In Reachability

If the reachability compiler misses a runtime dependency, export can become
broken. This is the highest-risk part and needs strong tests.

### 2. Image Optimization May Not Help Every Asset Set

Some bundles are dominated by unique or already-compressed assets. In those
cases, diced-image processing may add complexity without large savings, so the
exporter must keep raw fallback paths.

### 3. Diced Images Still Add Startup Work

The current player reconstructs diced assets before engine start. This is
acceptable for now, but it can become a startup bottleneck on larger bundles.

## Recommended Delivery Order

1. Strengthen export reachability and dead-resource elimination.
2. Add ZIP compression and size instrumentation.
3. Add `package.bin v4` native export with whole-file dedupe plus diced images.
4. Update player parser/runtime for `v4`.
5. Optimize startup cost later if diced-image reconstruction becomes a real
   bottleneck.

## External References

- Sprite Dicing:
  https://github.com/elringus/sprite-dicing
- Texture atlas compression based on repeated content removal:
  https://texture-atlas-compression.github.io/
