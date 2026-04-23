# Resource Tags Spec

## Purpose

This document defines the persisted model and editor behavior for resource tags.

The goal is to let users assign multiple tags to resource items and then filter
resource pages by those tags.

V1 scope:

- images
- sounds
- videos
- character sprites

Tags are editor metadata. They are not runtime/export data.

## Goals

- let one item reference multiple tags
- keep tag scopes isolated by resource area
- reuse existing `{ items, tree }` collection logic
- keep tag collections flat in v1
- avoid adding extra properties onto existing resource collection objects
- support optional tag colors
- preserve a clear path for future scopes

## Non-Goals

- one global/shared tag registry for all resources
- nested tag folders
- tag usage in runtime/export projection
- v1 tag support for every project collection

## Chosen Data Model

Tags are stored in one new top-level `tags` root.

```js
tags: {
  images: { items: {}, tree: [] },
  sounds: { items: {}, tree: [] },
  videos: { items: {}, tree: [] },
  "characterSprites:char-1": { items: {}, tree: [] },
}
```

Tag items reuse the same collection pattern as other tree-backed data, but the
collection stays flat.

```js
{
  id: "tag-a",
  type: "tag",
  name: "Background",
  color: "#4F46E5",
}
```

Flat tree example:

```js
tags: {
  images: {
    items: {
      "tag-a": {
        id: "tag-a",
        type: "tag",
        name: "Background",
        color: "#4F46E5",
      },
      "tag-b": {
        id: "tag-b",
        type: "tag",
        name: "Night",
      },
    },
    tree: [{ id: "tag-a" }, { id: "tag-b" }],
  },
}
```

This shape is intentionally different from:

```js
images: {
  items,
  tree,
  tags: { items, tree },
}
```

We do not want to introduce extra properties onto existing collection objects.
Current model collections are strict `{ items, tree }`, and this feature should
preserve that pattern.

## Scope Rules

Supported scope keys in v1:

- `images`
- `sounds`
- `videos`
- `characterSprites:<characterId>`

Rules:

- `images`, `sounds`, and `videos` exist as normal empty collections in new
  project state
- character-sprite scopes are keyed by character id, not character name
- character-sprite scopes may be omitted when empty and treated as empty by the
  client
- scope keys are internal identifiers, not user-visible labels
- scope keys are not free-form in v1; only the formats above are valid

The `characterSprites:<characterId>` format must be built and parsed through a
shared helper in both repos. It should not be assembled ad hoc in page code.

## Item Changes

The following non-folder items gain optional `tagIds`:

- image items
- sound items
- video items
- character sprite image items

Rules:

- `tagIds` is optional
- omit `tagIds` when empty
- folder items do not carry `tagIds`
- `tagIds` must be unique within one item
- every referenced tag id must exist in the matching scope

Examples:

```js
images.items["image-1"].tagIds = ["tag-a", "tag-b"];
```

```js
characters.items["char-1"].sprites.items["sprite-1"].tagIds = ["tag-a"];
```

## Tag Collection Rules

Tag collections are flat-only in v1.

Rules:

- use `tree`, not `order`, in persisted state
- tag items use `name`, not `label`, in persisted state
- tag items must always have `type: "tag"`
- tag collections do not allow folder items
- tag tree nodes do not allow `children`
- tag items do not use `parentId`
- tag names must be unique case-insensitively within one scope
- `color` is optional and, when present, must be `#RRGGBB`

The UI can still refer to a tag's display text as a "label", but persisted
state should use `name` so existing tree helpers can be reused cleanly.

## Commands

This feature adds one generic tag command family scoped by `scopeKey`.

Recommended v1 command surface:

- `tag.create`
- `tag.update`
- `tag.delete`

Recommended payload shapes:

```js
{
  type: "tag.create",
  payload: {
    scopeKey: "images",
    tagId: "tag-a",
    data: {
      type: "tag",
      name: "Background",
      color: "#4F46E5",
    },
    index: 0,
  },
}
```

```js
{
  type: "tag.update",
  payload: {
    scopeKey: "images",
    tagId: "tag-a",
    data: {
      name: "Background",
      color: "#4F46E5",
    },
  },
}
```

```js
{
  type: "tag.delete",
  payload: {
    scopeKey: "images",
    tagIds: ["tag-a"],
  },
}
```

Command rules:

- `tag.create` can append by default and may optionally accept `index`
- `tag.delete` can accept multiple ids for batch delete consistency
- existing image/sound/video/character-sprite create and update commands gain
  `tagIds` support in their `data`
- assignment and unassignment should happen through the existing item update
  commands, not through separate `tag.assign` or `tag.unassign` commands
- v1 does not need `tag.move`; tag ordering can stay simple and append-only

## Reducer Behavior

Required reducer behavior:

- creating a tag inserts it into the target scope collection tree
- updating a tag only changes allowed tag fields
- deleting a tag removes that tag item from the scope collection and removes
  the deleted id from every item in that same scope
- deleting a character removes `tags["characterSprites:<characterId>"]`
- deleting an item does not delete its tags; tags are reusable within the scope

## Validation Rules

State-level invariants:

- `state.tags` is a top-level object owned by the repository/model
- `state.tags.images`, `state.tags.sounds`, and `state.tags.videos` are
  collections with exact `{ items, tree }`
- dynamic `state.tags["characterSprites:<characterId>"]` entries are also
  collections with exact `{ items, tree }`
- every character-sprite tag scope must reference an existing character
- every tag id in any item's `tagIds` must resolve inside the correct scope
- duplicate tag ids in one item's `tagIds` are invalid
- duplicate case-insensitive tag names in one scope are invalid

Payload-level invariants:

- tag create/update payloads only allow supported fields
- `color`, when present, must be `#RRGGBB`
- item create/update payloads only allow `tagIds` on non-folder items

## Persistence And Projection

Tags are editor metadata and should remain in repository state.

They should not be included in runtime/export `constructProjectData()`.

That means:

- repository state remains the source of truth
- editor/domain projection should mirror `tags` into `getState()` and
  `domainState` using the same shape
- tag-aware pages may use `getState()` / `domainState` for tag data
- runtime/export projection still ignores tags

## UI Behavior

The user-facing pattern should stay consistent across images, sounds, videos,
and character sprites.

Recommended behavior:

- each supported page gets a `Manage Tags` action
- the page header uses `rtgl-tag-select` for tag filtering
- selected filter tags render inside the `rtgl-tag-select` trigger
- selecting multiple tags uses AND semantics
- search matches item name, item description, and assigned tag names
- the detail panel shows assigned tags through a slot in `rvn-detail-view`
- edit dialogs use `rtgl-form` `field.type: "tag-select"` for tag assignment
- `rtgl-tag-select` `add-option-click` opens the same tag-management flow used
  by the page-level `Manage Tags` action
- assigned tags render with `rtgl-tag`, using the stored tag color when present
- tag management still happens in a small dedicated dialog or panel, not inline
  on every card

V1 should not default to rendering full tag chip lists on every resource card
or a second custom filter-chip row in the page header. `rtgl-tag-select`
already covers the filter-selection surface cleanly.

## Rettangoli UI Direction

This spec assumes `@rettangoli/ui` `1.7.3`.

Relevant component support:

- `rtgl-form` supports `field.type: "tag-select"`
- `rtgl-tag-select` supports `options`, `selectedValues`, `addOption`, and the
  `value-change` / `add-option-click` events
- `rtgl-tag` is the read-only display primitive for assigned tags

Use the built-in tag components where they fit instead of inventing a parallel
chip picker. The only custom surface that still needs app-owned UI is tag
management itself, because the built-in selector does not cover tag rename,
color edit, or delete flows.

## Compatibility Direction

This is a persisted schema change.

Implications for `../routevn-creator-model`:

- add `tags` as a new top-level state root
- bump package minor version and align `SCHEMA_VERSION`
- add a new compatibility archive for the new schema line
- update payload, state, and stream fixtures for the new command/state shapes

Compatibility with older projects should be handled the same way other old
top-level collections are handled now:

- older states without `tags` should still load
- missing `tags` should normalize to an empty v1 tag state

Recommended normalized empty shape:

```js
tags: {
  images: { items: {}, tree: [] },
  sounds: { items: {}, tree: [] },
  videos: { items: {}, tree: [] },
}
```

Character-sprite scopes can then be created lazily.

## Review Notes

### 1. Current Domain State Drops Tags

The current `projectRepositoryStateToDomainState(...)` projection builds a
fixed domain shape and does not include `tags`.

That is acceptable today only because the feature does not exist yet. Once
tags are added, omitting them from `getState()` would force tag-aware pages to
special-case repository reads even though most page code already treats
`getState()` / `domainState` as the normal editor-facing state.

Accepted solution:

- add `tags` to `projectRepositoryStateToDomainState(...)`
- keep the same shape in domain state as in repository state
- allow tag-aware pages to read tags from `getState()` / `domainState`
- keep `constructProjectData()` unchanged so runtime/export still excludes tags

This is the simplest acceptable boundary because it keeps `getState()` as the
common page-facing contract without pulling tags into runtime/export.

### 2. This Is A Real Model-Schema Change

The model repo validates top-level state keys strictly, and collection objects
are also strict `{ items, tree }`.

This proposal is good because it avoids mutating existing collection objects,
but it still adds a new top-level root and new persisted item fields. It must
be treated as a schema-line change, not a patch-only change.

Accepted solution:

- add `tags` to the top-level model state as one dedicated root
- normalize missing `tags` to:

```js
tags: {
  images: { items: {}, tree: [] },
  sounds: { items: {}, tree: [] },
  videos: { items: {}, tree: [] },
}
```

- add one dedicated `validateTagsRoot(...)` model validator instead of trying
  to force `tags` through the normal top-level collection validator
- treat this as the next schema line in `routevn-creator-model`, with the
  required package minor bump, `SCHEMA_VERSION` bump, and compatibility archive

This keeps the model change narrow: one new top-level root, one dedicated root
validator, and additive `tagIds` on existing item types.

### 3. Dynamic Scope Keys Need One Canonical Helper

`characterSprites:<characterId>` is simple, but if it is built manually in
multiple places, drift is likely. A typo or alternate separator will create
orphaned scopes that are hard to notice.

This should be centralized early in both repos.

Accepted solution:

- define one shared prefix constant:
  `CHARACTER_SPRITE_TAG_SCOPE_PREFIX = "characterSprites:"`
- define one helper to build the key from a character id
- define one helper to test or parse a character-sprite scope key
- keep non-character scope keys as fixed literals: `images`, `sounds`,
  `videos`

Do not introduce a more generic scope-registry abstraction in v1.

### 4. Cascade Cleanup Is Required

Two cleanup paths are required for correctness:

- deleting a tag must remove that id from every item in the same scope
- deleting a character must remove its character-sprite tag scope

If either cleanup is missed, the state will accumulate broken references.

Accepted solution:

- implement both cleanups directly in reducers
- `tag.delete` removes deleted ids from the target tag collection and strips
  those ids from every item in that same scope
- `character.delete` also deletes the matching
  `tags["characterSprites:<characterId>"]` entry
- item delete does not touch tag collections

This is simpler and safer than adding any post-processing pass or background
repair step.

### 5. Reusing Tree Logic Does Not Mean Reusing Folder UI

Reusing `{ items, tree }` helpers is the right decision.

Reusing folder-oriented UI as-is is not. Tag collections are flat-only, so the
UI should reuse tree data helpers and ordering behavior, not folder creation,
nesting, or move-to-folder affordances.

Accepted solution:

- reuse the `{ items, tree }` data shape and flat tree helpers only
- do not reuse folder explorer actions such as `New Folder`, nested drag/drop,
  or move-to-parent flows
- use a dedicated flat tags management dialog or panel
- use `rtgl-tag-select` in the resource-page header for filter selection
- keep tag ordering append-only in v1; do not add reorder UI or `tag.move`
  until there is a concrete user need

This keeps the UI small and avoids forcing a folder-style surface onto a flat
concept.

## Decision Summary

The recommended direction is:

1. add one top-level `tags` root keyed by scope
2. keep every tag scope as a flat `{ items, tree }` collection
3. store tag text as `name`
4. store item assignments as `tagIds`
5. keep tags in repository and mirrored editor state, but out of runtime/export

This gives the feature a clean persisted model without introducing a new
collection shape inside existing resource roots.

## Implementation Plan

### Recommended Sequence

Implement this in this order:

1. `routevn-creator-model`
2. client core contract, command API, and `@rettangoli/ui` `1.7.3`
3. shared media-page UI for images, sounds, and videos
4. character-sprites integration
5. tests, VT coverage, and manual validation

Do not start the client UI work before the model shape and command surface are
final. The client depends on the model package and should target one stable
schema line.

### Phase 1: Model Repo

Repository:

- `../routevn-creator-model`

#### 1. Schema And Versioning

Update:

- `../routevn-creator-model/package.json`
- `../routevn-creator-model/src/model.js`

Changes:

- bump package version from `1.2.10` to `1.3.0`
- bump `SCHEMA_VERSION` from `2` to `3`
- add `tags` to the top-level persisted state contract
- normalize old states that omit `tags`

Target normalized empty shape:

```js
tags: {
  images: { items: {}, tree: [] },
  sounds: { items: {}, tree: [] },
  videos: { items: {}, tree: [] },
}
```

Character-sprite scopes remain lazy and can be absent when empty.

#### 2. Tag Scope Helpers And Validation

Update:

- `../routevn-creator-model/src/model.js`

Add:

- one shared prefix constant for character-sprite tag scopes
- one helper to build `characterSprites:<characterId>`
- one helper to test and parse character-sprite scope keys
- one dedicated `validateTagsRoot(...)`
- one dedicated `validateTagCollection(...)`
- one dedicated `validateTagItem(...)`

Validation rules to enforce:

- `state.tags.images`, `state.tags.sounds`, and `state.tags.videos` are exact
  `{ items, tree }` collections
- `state.tags["characterSprites:<characterId>"]` entries are also exact
  `{ items, tree }` collections
- tag items must be `{ id, type: "tag", name, color? }`
- tag collections are flat only
- tag tree nodes cannot have `children`
- tag items cannot have `parentId`
- tag names are unique case-insensitively within one scope
- `color`, when present, must be `#RRGGBB`
- character-sprite scope keys must reference existing characters

Do not try to squeeze `tags` through the existing generic top-level collection
validator. Add one explicit root validator for this new shape.

#### 3. Extend Resource Item Data

Update:

- `../routevn-creator-model/src/model.js`

Extend create/update data validators for:

- images
- sounds
- videos
- character sprites

Changes:

- allow optional `tagIds`
- reject `tagIds` on folder items
- reject duplicate ids inside one `tagIds` array
- validate every id against the correct scope

Resource-to-scope mapping:

- image item -> `tags.images`
- sound item -> `tags.sounds`
- video item -> `tags.videos`
- character sprite item -> `tags["characterSprites:<characterId>"]`

#### 4. Add Tag Commands And Reducers

Update:

- `../routevn-creator-model/src/model.js`

Add command types:

- `tag.create`
- `tag.update`
- `tag.delete`

V1 intentionally does not add:

- `tag.move`

Command behavior:

- `tag.create`
  - payload: `scopeKey`, `tagId`, `data`, optional `index`
  - reducer inserts one flat root-level tree node
- `tag.update`
  - payload: `scopeKey`, `tagId`, `data`
  - reducer updates `name` and `color`
- `tag.delete`
  - payload: `scopeKey`, `tagIds`
  - reducer removes tag items from the scope collection
  - reducer strips removed ids from every item in the same scope

Also update reducers so:

- `character.delete` deletes `tags["characterSprites:<characterId>"]`
- item delete does not delete tags

#### 5. Expose The New Command Surface

Update:

- `../routevn-creator-model/src/model.js`
- `../routevn-creator-model/tests/model-api.test.js`
- `../routevn-creator-model/tests/command-direct-coverage.test.js`

Changes:

- include the new tag command types in `listCommandTypes()`
- extend model API tests to assert the new public command list
- add direct command coverage for create, update, delete, and cascade cleanup

#### 6. Compatibility Fixtures

Update:

- `../routevn-creator-model/scripts/generate-compat-fixtures.js`
- `../routevn-creator-model/tests/compat/schema-3/**`

Add:

- a new `schema-3` archive
- payload fixtures for `tag.create`, `tag.update`, `tag.delete`
- updated image/sound/video/character-sprite payload fixtures with `tagIds`
- state fixtures that include the new `tags` root
- stream fixtures that cover:
  - tag create/update/delete
  - item tag assignment
  - tag delete cascade cleanup
  - character delete cleanup for sprite scopes

Run:

```bash
cd ../routevn-creator-model
bun run generate:compat-fixtures
bun run test:compat
bunx vitest run tests/model-api.test.js tests/compatibility-fixtures.test.js tests/command-direct-coverage.test.js
```

### Phase 2: Client Dependency And Core Contract

Repository:

- current repo

#### 1. Update Model Dependency

Update:

- `package.json`

Change:

- bump `@routevn/creator-model` from `1.2.10` to `1.3.0`

#### 2. Add Client Command Types And Scope Helpers

Update:

- `src/internal/project/commands.js`

Add:

- `COMMAND_TYPES.TAG_CREATE`
- `COMMAND_TYPES.TAG_UPDATE`
- `COMMAND_TYPES.TAG_DELETE`

Also add:

- `CHARACTER_SPRITE_TAG_SCOPE_PREFIX`
- `getCharacterSpriteTagScopeKey(characterId)`
- `isCharacterSpriteTagScopeKey(scopeKey)`

Important:

- do not add `tags` to `RESOURCE_TYPES`
- tags are not a standalone resource page
- tag commands still belong to the `"resources"` scope

#### 3. Add Tag Command API Methods

Add:

- `src/deps/services/shared/commandApi/tags.js`

Update:

- `src/deps/services/shared/commandApi.js`

Add public project-service methods:

- `createTag({ scopeKey, tagId, data, index })`
- `updateTag({ scopeKey, tagId, data })`
- `deleteTags({ scopeKey, tagIds })`

Partition mapping:

- `images` -> images resource partition
- `sounds` -> sounds resource partition
- `videos` -> videos resource partition
- `characterSprites:<characterId>` -> characters resource partition

Keep this mapping in one place inside the tag command API. Do not duplicate it
in page handlers.

#### 4. Mirror Tags Into Domain State

Update:

- `src/internal/project/projection.js`

Changes:

- add the normalized empty `tags` root in `createEmptyProjectState(...)`
- update `projectRepositoryStateToDomainState(...)` to mirror repository
  `tags` into domain state with the same shape
- leave `constructProjectData(...)` unchanged so runtime/export still ignores
  tags

This is the chosen client contract:

- repository state is the source of truth
- `getState()` / `domainState` mirrors tags for editor use
- runtime/export still excludes tags

#### 5. Check For Exact-Key Client Assumptions

Review and update any client tests or helpers that assume the old exact domain
state shape.

Primary places to verify:

- smoke tests
- any direct state fixture assertions
- any helper that clones or compares root-level state keys

### Phase 3: Shared Client Tag Data Flow

#### 1. Resolve Tags Into Media Items

Update:

- `src/internal/ui/resourcePages/media/mediaPageShared.js`

Add shared helpers to:

- resolve the tag scope for a media page resource type
- join tag ids to tag records for one collection
- decorate non-folder items with client-only derived tag display data

Recommended derived field:

```js
item.resolvedTags = [
  { id, name, color },
]
```

Do not persist `resolvedTags`. This is client-only display data.

#### 2. Extend Shared Media Page Store

Update:

- `src/internal/ui/resourcePages/media/createMediaPageStore.js`

Add state:

- `tagsData`
- `activeTagIds`
- `isTagsDialogOpen`

Add actions/selectors:

- `setTagsData`
- `setActiveTagIds`
- `openTagsDialog`
- `closeTagsDialog`

Filtering behavior:

- selected tags use AND semantics
- search matches `name`, `description`, and `resolvedTags[].name`
- filtering happens in the shared store so images, sounds, and videos all use
  one implementation

Keep this opt-in with a flag such as `supportsTags: true` so fonts continue to
use the shared media page without tag UI.

#### 3. Extend Character Sprites Store

Update:

- `src/pages/characterSprites/characterSprites.store.js`

Mirror the same local store behavior as the shared media-page store:

- `tagsData`
- `activeTagIds`
- `isTagsDialogOpen`
- search includes tag names
- selected tags filter with AND semantics

Character sprites remain the one custom page because their scope key depends on
the current character id.

### Phase 4: Shared UI Surface

#### 1. Extend The Shared Resource View

Update:

- `src/components/mediaResourcesView/mediaResourcesView.view.yaml`
- `src/components/mediaResourcesView/mediaResourcesView.store.js`
- `src/components/mediaResourcesView/mediaResourcesView.handlers.js`

Add support for:

- a `Manage Tags` button in the top bar beside search
- an `rtgl-tag-select` filter control in the top bar
- showing assigned tags in the detail panel

Add emitted events for:

- opening the tags dialog
- updating the selected tag filters from `rtgl-tag-select`

Do not add tag chips to every card in v1.

#### 2. Use Built-In Tag Components For Assignment And Display

Implement tag assignment with the built-in form component instead of a custom
slot control.

Use:

- `rtgl-form` field type `tag-select` in edit dialogs
- `field.options` built from the current scope's tag records
- form values seeded from the item's `tagIds`
- `field.addOption` so users can jump into tag creation from the selector
- `rtgl-tag` in detail-panel slots for assigned-tag display

This keeps tag selection aligned with the shipped Rettangoli UI contract and
reduces custom handler code.

#### 3. Keep The Tags Dialog Inline

Implement the tags dialog directly in:

- `src/components/mediaResourcesView/mediaResourcesView.view.yaml`
- `src/pages/characterSprites/characterSprites.view.yaml`

Keep the dialog markup and behavior aligned across both places, but do not add
another reusable component layer for v1.

Reason:

- the shared media view already covers images, sounds, and videos
- character sprites is the only custom page that needs its own copy
- duplicating one small flat dialog is simpler than adding a nested component
  abstraction

Dialog behavior should stay intentionally small:

- flat list of tags
- create tag
- edit tag name
- edit tag color
- delete tag
- optional create-from-selector handoff when `add-option-click` is used
- no folders
- no nesting
- no reorder UI
- no drag/drop

### Phase 5: Media Pages

#### 1. Images, Sounds, And Videos

Update shared orchestration:

- `src/internal/ui/resourcePages/media/createMediaPageHandlers.js`

Add shared handlers for:

- opening and closing the tags dialog
- tag create/update/delete actions
- handling `rtgl-tag-select` filter updates

Update resource-page stores:

- `src/pages/images/images.store.js`
- `src/pages/sounds/sounds.store.js`
- `src/pages/videos/videos.store.js`

Changes:

- opt into tag support in `createMediaPageStore(...)`
- add a detail-panel `slot` field for assigned tags
- add an edit-form `tag-select` field for tag assignment

Update resource-page handlers:

- `src/pages/images/images.handlers.js`
- `src/pages/sounds/sounds.handlers.js`
- `src/pages/videos/videos.handlers.js`

Changes:

- include `tagIds` in edit-form submit payloads
- map scope tags into `tag-select` options and back
- no change to upload/create flows unless a future version wants tag assignment
  at creation time

Do not add tag UI to fonts or other media-factory pages in this work.

### Phase 6: Character Sprites Page

Update:

- `src/pages/characterSprites/characterSprites.view.yaml`
- `src/pages/characterSprites/characterSprites.store.js`
- `src/pages/characterSprites/characterSprites.handlers.js`

Changes:

- resolve the current scope key with
  `getCharacterSpriteTagScopeKey(characterId)`
- mirror the same top-bar `Manage Tags` action and `rtgl-tag-select` filter
- render assigned tags in the detail panel
- add `tag-select` assignment UI to the edit dialog
- wire tag create/update/delete actions through the generic tag command API
- include `tagIds` in sprite update payloads

Extra correctness check:

- switching from one character to another must switch tag scopes immediately
- no sprite tag from character A may appear in character B's picker or filter

### Phase 7: Tests

#### 1. Client Storage And Command Tests

Add:

- `tests/puty/resource-tags.spec.yaml`

Cover:

- `tag.create`
- `tag.update`
- `tag.delete`
- image tag assignment
- sound tag assignment
- video tag assignment
- character-sprite tag assignment
- tag delete cascade cleanup
- character delete sprite-scope cleanup

If Puty becomes awkward for the full command mix, keep the YAML scenario focused
on storage persistence and add any missing behavioral assertions to the existing
script-driven tests.

#### 2. VT Coverage

Update:

- `vt/specs/project/images.yaml`
- `vt/specs/project/sounds.yaml`
- `vt/specs/project/videos.yaml`
- `vt/specs/project/character-sprites.yaml`

Minimum expected visible coverage:

- create a tag with color
- assign multiple tags to one item
- filter by one tag
- filter by multiple tags with AND semantics
- clear filters
- edit tag name/color
- delete a tag and verify the assignment disappears

Character-sprites VT must also verify scope isolation between two characters.

#### 3. Manual Validation

Check all of these before closing the feature:

- image tags are not shared with sounds
- image tags are not shared with videos
- sprite tags for character A are not shared with character B
- deleting a tag removes it from filtered results and item detail views
- editing an item without changing tags preserves existing tag ids
- folder items never show tag assignment UI
- export/runtime output is unchanged

### Recommended Change Slices

For reviewability, split the work like this:

1. Model repo PR
   - schema 3
   - `tags` root
   - tag commands
   - `tagIds`
   - compatibility fixtures and tests
2. Client core PR
   - dependency bump
   - command API
   - `commands.js`
   - projection `getState()` support
   - no app UI yet
3. Shared media-page PR
   - shared store/view/handlers
   - `rtgl-tag-select` filter and form integration
   - inline tags-management dialog UI in the shared media view
   - images/sounds/videos integration
   - VT updates for shared media path
4. Character-sprites PR
   - per-character scope integration
   - character-sprites VT
   - final manual cleanup

This keeps the work understandable and avoids mixing model-schema work with UI
iteration in one large change.
