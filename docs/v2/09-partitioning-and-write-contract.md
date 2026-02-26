# 09 Partitioning and Write Contract (V2 Target)

Date baseline: February 26, 2026.

This document defines the required end-state write contract for V2.

## Canonical Model

- Canonical project state remains tree-based where applicable (`items + tree`).
- Tree is part of domain model semantics, not a legacy compatibility layer.

## Write Path Contract

- Persist only typed domain commands/events (`scene.*`, `section.*`, `line.*`, `resource.*`, `layout.*`, `variable.*`, `project.update`).
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

- Base per resource type: `project:<projectId>:resources:<resourceType>`
- Example: `project:p1:resources:images`
- Do not partition resources by item id.

### Layouts

- Base: `project:<projectId>:layouts`

### Settings

- Base: `project:<projectId>:settings`

## Review Checklist

- No runtime write path emits `set/unset/node*`.
- Story commands include scene-level partition when a scene is known.
- Resource commands use resource-type partition only.
- Reducer replay from typed command stream reconstructs canonical tree state.
