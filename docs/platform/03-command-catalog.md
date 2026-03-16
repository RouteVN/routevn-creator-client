# 03 Command Catalog

Date baseline: March 14, 2026.

This document lists all canonical RouteVN command/event types and their payload
shapes.

Client commands and committed events use the same canonical `type` names and
the same domain payload shape. In other words, this document is the payload
reference for both submitted commands and stored/replicated committed events.

Authoritative source: `src/internal/project/commands.js`.

## All Event Types

- `project.create`
- `scene.create`
- `scene.update`
- `scene.delete`
- `scene.set_initial`
- `scene.move`
- `section.create`
- `section.update`
- `section.delete`
- `section.move`
- `line.create`
- `line.update_actions`
- `line.delete`
- `line.move`
- `resource.create`
- `resource.update`
- `resource.move`
- `resource.delete`
- `resource.duplicate`
- `layout.element.create`
- `layout.element.update`
- `layout.element.move`
- `layout.element.delete`

## Shared Payload Rules

- Canonical payloads use root fields only for target ids, placement, and
  operation flags. Mutable domain content goes under `data`.
- `project.create.state` is the main exception: it bootstraps a full domain
  state snapshot instead of a small mutation body.
- `line.create` is the other notable special case: it can create one or many
  lines, so the command body is `lines[]`, and each created item uses its own
  `data`.
- The runtime still accepts older payload aliases (`patch`, `line`, `element`,
  and root `name` on some create commands) when replaying older events, but
  `data` is the canonical shape going forward.
- `index` is supported only where explicitly listed below and must be an
  integer greater than or equal to `0`.
- `position` is supported only where explicitly listed below and must be one of:
  - `"first"`
  - `"last"`
  - `{ "before": "<id>" }`
  - `{ "after": "<id>" }`
- `parentId` fields listed as `string | null` are optional and may be omitted or
  set to `null`.
- `replace` fields listed as `boolean` are optional and may be omitted.
- `resourceType` must be one of:
  - `images`
  - `tweens`
  - `videos`
  - `sounds`
  - `characters`
  - `fonts`
  - `transforms`
  - `colors`
  - `typography`
  - `variables`
  - `layouts`
  - `components`

## Settings Commands

### `project.create`

Payload (YAML):

```yaml
state:
  model_version: 2
  project:
    id: "<string>"
    name: "<string>"
    description: "<string>"
    createdAt: 0
    updatedAt: 0
  story:
    initialSceneId: "<string|null>"
    sceneOrder: []
  scenes: {}
  sections: {}
  lines: {}
  resources:
    images: { items: {}, tree: [] }
    tweens: { items: {}, tree: [] }
    videos: { items: {}, tree: [] }
    sounds: { items: {}, tree: [] }
    characters: { items: {}, tree: [] }
    fonts: { items: {}, tree: [] }
    transforms: { items: {}, tree: [] }
    colors: { items: {}, tree: [] }
    typography: { items: {}, tree: [] }
    variables: { items: {}, tree: [] }
    layouts: { items: {}, tree: [] }
    components: { items: {}, tree: [] }
```

Notes:

- `state` is a full project domain state snapshot, not an arbitrary object.
- `project.create` replaces the whole domain state with `payload.state`.
- The submitted state must match the RouteVN domain model shape and satisfy
  domain invariants.
- At minimum this means:
  - `model_version` must be `2`
  - `project.id` must exist and match the command `projectId`
  - all required top-level collections must exist
  - references and ordering structures must be internally consistent
- Treat `src/internal/project/state.js` (`createEmptyProjectState`) and
  `src/internal/project/projection.js` as the current structural reference for
  this state payload.

## Story Commands

### Scenes

#### `scene.create`

Payload (YAML):

```yaml
sceneId: "<string>"
parentId: "<string|null>" # optional
data:
  name: "<string>"
index: 0 # optional
position: "last" # optional; also "first", "before", "after"
positionTargetId: "<string>" # optional; required when position is "before" or "after"
```

#### `scene.update`

Payload (YAML):

```yaml
sceneId: "scene-intro"
data:
  name: Train Station
  position:
    x: 520
    "y": 240
```

Notes:

- Use `scene.update` for generic non-structural scene field changes.
- Use `data.name` for scene renames; there is no separate `scene.rename`
  command.
- Current real examples in the app/codebase are name and position updates.
- `scene.update` is broad, but it is still not a free-for-all:
  reducer-owned structural fields such as `id`, `sectionIds`, and `type` are not
  updated through this path.

#### `scene.delete`

Payload (YAML):

```yaml
sceneIds:
  - "<string>"
```

Notes:

- `sceneIds` must be a non-empty array, even when deleting one scene.

#### `scene.set_initial`

Payload (YAML):

```yaml
sceneId: "<string>"
```

#### `scene.move`

Payload (YAML):

```yaml
sceneId: "<string>"
index: 0
parentId: "<string|null>" # optional
position: "last" # optional; also "first", "before", "after"
positionTargetId: "<string>" # optional; required when position is "before" or "after"
```

### Sections

#### `section.create`

Payload (YAML):

```yaml
sectionId: "<string>"
sceneId: "<string>"
parentId: "<string|null>" # optional
data:
  name: "<string>"
index: 0 # optional
position: "last" # optional; also "first", "before", "after"
positionTargetId: "<string>" # optional; required when position is "before" or "after"
```

#### `section.update`

Payload (YAML):

```yaml
sectionId: "<string>"
data:
  name: "<string>"
```

Notes:

- Use `data.name` for section renames; there is no separate `section.rename`
  command.

#### `section.delete`

Payload (YAML):

```yaml
sectionIds:
  - "<string>"
```

Notes:

- `sectionIds` must be a non-empty array, even when deleting one section.

#### `section.move`

Payload (YAML):

```yaml
sectionId: "<string>"
index: 0
parentId: "<string|null>" # optional
position: "last" # optional; also "first", "before", "after"
positionTargetId: "<string>" # optional; required when position is "before" or "after"
```

### Lines

#### `line.create`

Payload (YAML):

```yaml
sectionId: "section-main"
lines:
  - lineId: "line-2"
    data:
      actions:
        dialogue:
          content:
            - text: Second line
          mode: adv
  - lineId: "line-3"
    data:
      actions:
        dialogue:
          content:
            - text: Third line
          mode: adv
position: "after"
positionTargetId: "line-1"
```

Notes:

- `lines` must be a non-empty array.
- The lines are created sequentially in array order.
- Use `position: "before"` / `position: "after"` with `positionTargetId` to
  place the first new line relative to an existing line.
- `index` is still supported and applies to the first created line when you
  want explicit numeric placement.
- `parentId` is still optional for parity with the shared story placement
  contract, but current line ordering is flat within a section.
- There is no separate canonical `line.insert_before` or `line.insert_after`
  command.
- Older single-line payloads (`lineId` + `data`) and older
  `line.insert_after` payloads still normalize to `line.create`.

#### `line.update_actions`

Payload (YAML):

```yaml
lineId: "<string>"
data: {}
replace: false # optional
```

#### `line.delete`

Payload (YAML):

```yaml
lineIds:
  - "<string>"
```

Notes:

- `lineIds` must be a non-empty array, even when deleting one line.

#### `line.move`

Payload (YAML):

```yaml
lineId: "<string>"
toSectionId: "<string>"
index: 0
parentId: "<string|null>" # optional
position: "last" # optional; also "first", "before", "after"
positionTargetId: "<string>" # optional; required when position is "before" or "after"
```

## Resource Commands

### `resource.create`

Payload (YAML):

```yaml
resourceType: "<resourceType>"
resourceId: "<string>"
data: {}
parentId: "<string|null>" # optional
index: 0 # optional
position: "last" # optional; also "first", "before", "after"
positionTargetId: "<string>" # optional; required when position is "before" or "after"
```

### `resource.update`

Payload (YAML):

```yaml
resourceType: "<resourceType>"
resourceId: "<string>"
data: {}
```

Notes:

- `resourceType` must be one of the supported resource types listed above.
- Use `data.name` for resource renames; there is no separate `resource.rename`
  command.
- For non-folder `variables`, `data.type` and `data.variableType` cannot
  change the existing variable type.

### `resource.move`

Payload (YAML):

```yaml
resourceType: "<resourceType>"
resourceId: "<string>"
index: 0
parentId: "<string|null>" # optional
position: "last" # optional; also "first", "before", "after"
positionTargetId: "<string>" # optional; required when position is "before" or "after"
```

### `resource.delete`

Payload (YAML):

```yaml
resourceType: "<resourceType>"
resourceIds:
  - "<string>"
```

Notes:

- `resourceIds` must be a non-empty array, even when deleting one resource.

### `resource.duplicate`

Payload (YAML):

```yaml
resourceType: "<resourceType>"
sourceId: "<string>"
newId: "<string>"
parentId: "<string|null>" # optional
name: "<string>" # optional
index: 0 # optional
position: "last" # optional; also "first", "before", "after"
positionTargetId: "<string>" # optional; required when position is "before" or "after"
```

## Layout Element Commands

### `layout.element.create`

Payload (YAML):

```yaml
layoutId: "<string>"
elementId: "<string>"
data: {}
parentId: "<string|null>" # optional
index: 0 # optional
position: "last" # optional; also "first", "before", "after"
positionTargetId: "<string>" # optional; required when position is "before" or "after"
```

### `layout.element.update`

Payload (YAML):

```yaml
layoutId: "<string>"
elementId: "<string>"
data: {}
replace: false # optional
```

### `layout.element.move`

Payload (YAML):

```yaml
layoutId: "<string>"
elementId: "<string>"
index: 0
parentId: "<string|null>" # optional
position: "last" # optional; also "first", "before", "after"
positionTargetId: "<string>" # optional; required when position is "before" or "after"
```

### `layout.element.delete`

Payload (YAML):

```yaml
layoutId: "<string>"
elementIds:
  - "<string>"
```

Notes:

- `elementIds` must be a non-empty array, even when deleting one element.
