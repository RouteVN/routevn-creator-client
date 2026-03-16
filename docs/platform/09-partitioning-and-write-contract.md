# 09 Partitioning and Write Contract

Date baseline: February 26, 2026.

This document defines the required end-state write contract for the current platform.

## Canonical Model

- Canonical project state remains tree-based where applicable (`items + tree`).
- Tree is part of domain model semantics, not a legacy compatibility layer.
- Collection roots are top-level plural fields.
- Do not wrap general collections under `resources.*`.
- Each collection owns its own ordering tree.
- Do not duplicate collection ordering in separate root-level `...Order` arrays.
- Singleton roots such as `story` keep only singleton settings.

## Write Path Contract

- Persist only typed domain commands/events.
- End-state command families should be:
  - `project.*`
  - `scene.*`
  - `section.*`
  - `line.*`
  - `image.*`
  - `sound.*`
  - `video.*`
  - `animation.*`
  - `character.*`
  - `character.sprite.*`
  - `font.*`
  - `transform.*`
  - `color.*`
  - `textStyle.*`
  - `variable.*`
  - `layout.*`
  - `layout.element.*`
- Collection-level authored entities should converge on explicit per-family
  command groups, not a generic `resource.*` wrapper.
- `characters` use `character.*` for character lifecycle, while
  `character.sprite.*` remains separate for internal sprite editing.
- `layouts` use `layout.*` for collection lifecycle, while `layout.element.*`
  remains separate for internal layout editing.
- Do not persist intermediary legacy repository mutation events:
  - `set`
  - `unset`
  - `nodeInsert`
  - `nodeDelete`
  - `nodeUpdate`
  - `nodeMove`

In short: command stream is authoritative; state is materialized by domain reducer replay.

## Partition Contract

Partitions must be coarse and stable.

### Story

- Base: `project:<projectId>:story`
- Scene-level: `project:<projectId>:story:scene:<sceneId>`
- Do not partition story by section or line.

### Resources

- Base per collection family: `project:<projectId>:resources:<collection>`
- Example: `project:p1:resources:images`
- The partition segment uses the plural collection root name.
- Do not partition resources by item id.
- `character.sprite.*` also uses `project:<projectId>:resources:characters`

### Layouts

- Base: `project:<projectId>:layouts`

### Settings

- Base: `project:<projectId>:settings`

## Review Checklist

- No runtime write path emits `set/unset/node*`.
- Story commands include scene-level partition when a scene is known.
- Collection-family commands use collection partition only.
- Reducer replay from the command stream reconstructs canonical tree state.
