# 01 Domain Model (V2)

## Root Envelope

```json
{
  "model_version": 2,
  "project": {
    "id": "uuidv7",
    "name": "string",
    "description": "string",
    "createdAt": 1760000000000,
    "updatedAt": 1760000000000
  }
}
```

## Entity Sets

- `scenes`
- `sections`
- `lines`
- `layouts`
- `resources.images`
- `resources.videos`
- `resources.sounds`
- `resources.fonts`
- `resources.transforms`
- `resources.colors`
- `resources.typography`
- `variables`

All entities use UUIDv7 ids and are normalized by id.

## Story Relations

- A scene owns ordered `sectionIds`.
- A section owns ordered `lineIds`.
- Story root has `initialSceneId`.

## Resource Relations

- Layout elements can reference resources by `{ resourceType, resourceId }`.
- Line actions can reference scene ids, layout ids, and resource ids.

## Required Invariants

1. `project.id` exists and is immutable.
2. `story.initialSceneId` must exist in `scenes`.
3. Every `scene.sectionIds[]` entry exists in `sections` and belongs to that scene.
4. Every `section.lineIds[]` entry exists in `lines` and belongs to that section.
5. No duplicate ids in ordered arrays.
6. No cycles in tree-like structures.
7. Every resource reference points to an existing resource.
8. Layout and scene references must point to valid entity type.
9. Deleted entities cannot remain referenced.
10. Numeric ranges:
- positions/sizes finite numbers
- opacity `[0, 1]`
- audio volume `[0, 1]`

## Forbidden Patterns

- Direct arbitrary nested writes to unknown paths.
- Accepting UI blobs/functions in payloads.
- Silent orphan creation.
