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

The current export path already has a first pass of resource filtering:

- `src/pages/versions/versions.handlers.js`
  - snapshots repository state for the selected version
  - calls `collectUsedResourcesForExport(...)`
  - calls `buildFilteredStateForExport(...)`
  - builds `projectData`
  - exports only the selected `fileIds`
- `src/internal/project/projection.js`
  - `collectUsedResourcesForExport(...)` scans references and collects used
    resource ids and file ids
  - `buildFilteredStateForExport(...)` filters resource collections before
    `constructProjectData(...)`

That is good, but it is not the full optimization we want yet.

## Main Gaps

### 1. Reachability Is Not Yet Story-Compiled

The current resource scan walks `state.scenes` directly. That means a scene or
section that is still present in repository state but is no longer reachable
from `story.initialSceneId` can still keep resources and files alive during
export.

We want a stronger reachability pass:

- start from `story.initialSceneId`
- walk scene/section/line transitions
- include transitions originating from layouts and controls
- include dependencies introduced by text styles, characters, sprites, fonts,
  colors, animations, transforms, and variables as needed
- treat anything not reached by that compiled dependency graph as dead for
  export

This is the "tree shaking" step for story data and resources.

### 2. We Are Still Leaving Easy Compression Wins On The Table

Current ZIP generation does not yet fully exploit compression:

- web export uses `JSZip`
- Tauri export writes the ZIP in Rust with `CompressionMethod::Stored`

Before building a more complex dedup format, we should capture the simpler
baseline improvement first.

### 3. Bundle Payload Still Duplicates Repeated Byte Ranges

The current `package.bin` format stores:

- header
- index JSON
- full asset byte payloads concatenated one after another
- instructions JSON

This deduplicates repeated `fileId`s only indirectly through the current
`Set`-based collection of `fileIds`. It does not deduplicate repeated byte
ranges across different assets or across slightly changed versions of similar
assets.

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

- web ZIP export: use `DEFLATE` intentionally and measure the result
- Tauri ZIP export: switch from `Stored` to a compressed mode where practical
- evaluate whether `package.bin` itself should remain raw inside the ZIP or be
  wrapped in additional compression only at the ZIP layer

This is not a substitute for dedupe, but it should land first because it is
small, low-risk, and immediately measurable.

### Step C: `package.bin` v3 With Chunk-Level Deduplication

Keep the custom bundle format, but change how payload bytes are stored.

Do not adopt a third-party archive tool such as `casync` or `zpaq` as the
shipping export format. They are useful references, but they are not a good
fit for the current player/runtime integration.

Recommended algorithm:

- use content-defined chunking
- use FastCDC for chunk boundary detection
- hash each chunk strongly
- store unique chunks once
- store per-asset chunk references in the manifest

This gives us deduplication that survives byte shifts better than fixed-size
chunking and is a better fit than an ad hoc "shuffle" strategy.

## Chosen Implementation Model

### One Core Implementation

Do not maintain separate chunkers in JS and Rust.

Instead:

- build one Rust export core
- use it directly from Tauri
- compile the same Rust core to WebAssembly for web export

This keeps bundle encoding logic, chunking behavior, and manifest semantics
identical across platforms.

### Why This Is The Right Split

- Tauri already has a Rust export path, so the first implementation fits the
  existing architecture naturally.
- A separate pure-JS FastCDC implementation would increase maintenance cost and
  format drift risk.
- WebAssembly lets web export reuse the exact same chunking and manifest logic.

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

### Phase 3: Rust Bundle Core

Create a small Rust core that owns:

- FastCDC chunking
- chunk hashing
- `package.bin v3` manifest encoding
- reconstruction metadata for runtime loading

Suggested structure:

- keep Tauri command wiring in `src-tauri/src/`
- move bundle encoding logic into a reusable Rust library crate

The core should accept:

- asset stream descriptors
- asset ids
- instructions JSON

And emit:

- `package.bin v3`
- or a streamed writer for `package.bin v3`

### Phase 4: Tauri First

Implement the new format in Tauri export first.

Why:

- no wasm setup needed for the first milestone
- faster iteration on chunking parameters
- easier streaming of large assets directly from disk

Deliverables:

- new bundle encoder in Rust
- Tauri export command switched to v3
- player parser updated to read both v2 and v3
- tests and size benchmarks

## `package.bin v3` Shape

The exact wire format can change during implementation, but it should look like
this conceptually:

1. version/header
2. manifest length
3. manifest JSON or binary metadata
4. unique chunk payload area
5. instructions payload

Manifest contents should include:

- chunk table
  - chunk hash
  - start offset
  - byte length
- asset table
  - asset id
  - mime
  - ordered list of chunk references
- instructions metadata
  - location and length

This allows:

- reconstructing any asset by walking its chunk list
- storing repeated chunks once
- keeping the player-side loading model deterministic

## Runtime / Player Changes

Update `scripts/main.js` to:

- keep support for bundle format v2 during migration
- add parser support for v3 manifest + chunk references
- reconstruct asset bytes into `Blob`s before handing them to the existing
  asset pipeline

Migration rule:

- read v2 and v3 for one release window
- write only v3 once export confidence is high

## Testing Plan

### Reachability Tests

Add tests that prove unused content is removed:

- unreachable scene does not keep image alive
- unreachable layout/control does not keep resources alive
- dead character/sprite chain does not keep file alive
- dead text style/font chain does not keep file alive
- reachable nested dependency remains exported

### Bundle Format Tests

Add tests that prove v3 correctness:

- reconstructing all assets from manifest yields original bytes
- duplicate byte regions collapse into fewer stored bytes
- chunk references are stable enough across similar inputs
- v2 parser compatibility remains intact

### Regression / Benchmark Tests

Capture representative samples:

- many identical assets
- many nearly identical assets
- mostly unique assets
- large image/video payloads

Track:

- raw bytes
- bytes after reachability filtering
- bytes after ZIP compression
- bytes after v3 dedupe
- export time
- load time

## Acceptance Criteria

### Reachability Milestone

- export excludes files from unreachable story content
- filtered `projectData` and filtered files come from the same dependency graph
- tests cover nested dependency cases

### Compression Milestone

- web and Tauri exports use intentional compression settings
- size measurements are recorded before dedupe lands

### Dedupe Milestone

- `package.bin v3` stores repeated chunks once
- exported runtime still loads correctly
- Tauri export ships first
- web export reuses the same Rust core through wasm
- no separate JS chunker is maintained

## Risks

### 1. False Negatives In Reachability

If the reachability compiler misses a runtime dependency, export can become
broken. This is the highest-risk part and needs strong tests.

### 2. Dedupe Overhead Can Outweigh Gains

If chunk size parameters are poor, manifest overhead can erase benefits on
small projects. We need benchmark coverage before finalizing defaults.

### 3. Web Export Could Freeze The UI

Web export must run in a worker once wasm is introduced. Do not run large
chunking jobs on the main thread.

## Recommended Delivery Order

1. Strengthen export reachability and dead-resource elimination.
2. Add ZIP compression and size instrumentation.
3. Add `package.bin v3` with FastCDC in Rust for Tauri.
4. Update player parser for v2 + v3.
5. Reuse the Rust core from web export through wasm and a worker.

## External References

- FastCDC paper:
  https://www.usenix.org/conference/atc16/technical-sessions/presentation/xia
- `fastcdc-rs`:
  https://github.com/nlfiedler/fastcdc-rs
- `casync` design reference:
  https://github.com/systemd/casync
- wasm-pack targets:
  https://rustwasm.github.io/docs/wasm-pack/print.html
