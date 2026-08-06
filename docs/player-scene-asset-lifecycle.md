# Player Scene Asset Lifecycle

Status: accepted design, not implemented

## Goal

Keep exported games responsive without retaining every image texture for the
entire playthrough.

The scene is the smallest loading and eviction unit. The player must not
schedule additional asset loads at individual lines inside a scene.

## Decisions

- Load every asset used anywhere in the active scene before rendering it.
- Preload every immediate possible next scene in the background while the
  active scene is playing.
- Derive possible next scenes from authored actions. Do not add or persist a
  `nextSceneIds` field in the export format.
- Keep the source and destination scenes resident until their transition has
  completed.
- Release the previous scene and unselected prefetched scenes after the
  destination has been selected.
- Unload an asset only when no active, transitioning, prefetched, or global
  owner still references it.
- Gate rendering on the complete destination scene asset set. Never commit a
  render state whose required images are only partially loaded.
- Use a DOM-owned black loading overlay for blocking loads. Custom loading UI
  can be added later without changing the asset lifecycle.

## Scene Asset Sets

A scene asset set contains every bundle asset reachable from every section and
line in that scene, including assets referenced indirectly through resources
such as:

- backgrounds, characters, sprites, particles, and animations
- layouts and controls
- fonts, text styles, colors, and transition masks
- sound, music, and video
- nested resources referenced by any of the above

The player may derive and cache these sets from `projectData` once during
startup. Loading remains scene-level even if the implementation loads the
individual files through a bounded worker queue.

Assets that are not owned by one scene must use separate owners. Examples
include player UI, save thumbnails, and media that intentionally continues
across scene boundaries.

## Deriving Possible Next Scenes

Build a `sectionId -> sceneId` index from `projectData`. Section IDs are the
canonical runtime navigation targets, so the owning scene can be resolved
without exported successor metadata.

For each source scene, recursively scan all action batches that can execute
while that scene is active. This includes:

- line actions in every section of the scene
- choice item click actions
- conditional branches and other nested action batches
- relevant interactions in layouts and controls referenced by the scene

Skip condition payloads such as `when`; they are data, not action batches.

An outgoing scene edge is produced by either of these authored actions:

- `sectionTransition`
- `resetStoryAtSection`

For each action, resolve its target `sectionId` through the section owner
index. Creator-side `sectionTransition` data may also contain `sceneId`, but
the section owner is sufficient after projection to Route Engine data.

Choices are not a separate navigation primitive. They contribute outgoing
edges when their event actions contain `sectionTransition` or
`resetStoryAtSection`.

Deduplicate the resulting scene IDs. A transition to another section in the
same scene does not add a new preload unit because the complete source scene is
already resident. Follow only one scene-graph hop; do not recursively preload
successors of successors.

The existing scene overview and export reachability code already perform
related recursive transition discovery. The implementation should extract or
share one canonical traversal so scene diagrams, export reachability, deletion
checks, and player preloading cannot disagree.

## Navigation Outside The Static Successor Graph

Some runtime operations can restore or move the pointer without representing
an authored next-scene edge:

- loading a save slot
- rollback
- development or tooling use of `jumpToLine`
- future navigation actions not yet understood by the graph compiler

These operations must resolve the destination scene from the resulting engine
pointer and call the same blocking `ensureScene` path. They do not require the
static graph to predict every possible destination.

`jumpToLine` exists in Route Engine but is currently treated as tooling or
non-player transport rather than a Creator-authored story transition. If it
becomes an authored navigation action, successor derivation must include a
cross-scene `jumpToLine` target.

## Runtime Lifecycle

### Startup

1. Show the black loading overlay.
2. Acquire global assets.
3. Derive the initial scene from `story.initialSceneId`.
4. Acquire and fully load the initial scene.
5. Render its first frame atomically.
6. Hide the loading overlay.
7. Begin background preloading of all immediate successor scenes.

### Scene Selection And Transition

1. Acquire the selected destination as an active scene. Reuse any in-flight or
   completed prefetch work.
2. Release prefetch ownership for unselected sibling scenes.
3. If the destination is not ready, show the black loading overlay and lock
   player input until it is ready.
4. Keep both the source and destination scene assets pinned during the visual
   transition.
5. Commit the destination render only after its complete scene asset set is
   ready.
6. Hide the loading overlay after a successful destination render.
7. When the visual transition completes, release the source scene.
8. Begin background preloading of the destination's immediate successors.

The destination must be promoted to active ownership before its prefetch owner
is released. This prevents a zero-reference interval from destroying textures
needed by the next render.

### Same-Scene Section Transition

No scene asset ownership changes are required. The full scene was loaded on
entry, so `sectionTransition` and `resetStoryAtSection` can move between its
sections without another asset load.

## Asset Registry

The current monotonic `loadedAssetIds` model must be replaced by an asset
registry whose state reflects actual renderer ownership.

Each asset entry should track at least:

- status: unloaded, loading, ready, or failed
- the shared in-flight load promise
- active owners or a reference count
- last use and estimated decoded/GPU size
- the Route Graphics/Pixi texture or media handle

Suggested ownership scopes include:

- `global`
- `active-scene:<sceneId>`
- `prefetch:<sourceSceneId>:<destinationSceneId>`
- `transition:<transitionId>`
- `media:<channelId>`

When the final owner releases an asset, remove it from the Pixi asset cache,
destroy its texture/source safely, release associated image bitmap data, and
mark it unloaded. A later acquisition must be able to load it again.

## Loading Overlay

The loading overlay must be ordinary DOM outside the WebGL canvas so it still
works when the renderer or GPU context is unavailable.

- Keep the default presentation solid black.
- Show it immediately during startup and explicit scene-boundary waits.
- Do not show it for successful background prefetch work.
- Lock progression input while a blocking scene acquisition is pending.
- Hide it only after Route Graphics confirms assets are decoded/uploaded and
  the complete destination frame has rendered.
- Keep loading state and presentation separate so a later project-level theme
  can replace the black presentation.

A background prefetch failure should be recorded but should not interrupt the
current scene. If that destination is selected, retry it through the blocking
path and keep the overlay visible. A blocking failure must provide a retry or
terminal error state rather than leaving an unexplained permanent black frame.

## Memory And Concurrency

The intended resident window is:

- global assets
- the active scene
- source and destination scenes during a transition
- all immediate successor scenes being prefetched
- explicitly persistent media

Asset IDs must be deduplicated across every owner. Shared assets consume one
texture and retain multiple references.

Scene-level loading does not require unbounded parallel decoding. Load assets
through bounded concurrency to avoid transient `Blob`, `ImageBitmap`, and GPU
upload spikes. The scene acquisition promise resolves only when the complete
queue has finished.

Preloading all immediate successors can still exceed a device's memory budget
when a scene has large branches. The player must always prioritize:

1. global and active-scene assets
2. transition destination assets
3. speculative successor prefetches

Attempt to preload every immediate successor. If the full one-hop window does
not fit the runtime budget, stop or evict speculative prefetches and rely on
the black blocking overlay if one of those destinations is selected. Export
validation should derive and report the estimated decoded size of each
`current scene + immediate successors` window without persisting the graph in
the bundle.

## Renderer Recovery

Listen for WebGL context loss. When it occurs:

1. show the DOM loading overlay
2. invalidate renderer residency in the asset registry
3. recreate or restore Route Graphics
4. reacquire global assets and the active scene
5. render the active scene atomically
6. resume successor prefetching

The registry must not treat an asset as ready solely because it was loaded
before context loss.

## Implementation Boundaries

- Project/runtime derivation owns scene asset sets and outgoing scene IDs.
- Route Engine remains responsible for story state and exposes enough pointer
  state to identify the active scene after navigation or restoration.
- The bundle player owns scene acquisition, prefetch scheduling, loading UI,
  and ownership transitions.
- Route Graphics owns renderer-specific load, unload, texture destruction, and
  context recovery operations.
- Export validation may calculate scene windows and warnings, but the shipping
  bundle does not need an exported `nextSceneIds` field.

## Required Coverage

Successor derivation tests must cover:

- direct `sectionTransition`
- `sectionTransition` inside a choice click
- direct and nested `resetStoryAtSection`
- transitions inside conditional branches
- transitions from referenced layouts and controls
- same-scene section targets
- duplicate targets and scene graph cycles
- unknown section targets

Lifecycle tests must cover:

- initial scene blocking load
- successful successor prefetch promotion
- selection before prefetch completion
- failed prefetch followed by blocking retry
- release of unselected branches
- shared assets surviving source-scene release
- source assets surviving until transition completion
- save/load and rollback to an unprefetched scene
- renderer context loss and active-scene recovery
- no partial destination render while any scene asset is missing
