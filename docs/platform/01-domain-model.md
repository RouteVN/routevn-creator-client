# 01 Domain Model

This document currently tracks the intended end-state model being reviewed for
the denormalized command surface and flattened top-level collection layout.

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

## Collection Roots

- Collection roots are top-level plural fields.
- Do not wrap general collections under `resources.*`.
- Each collection owns its own `items + tree`.
- Singleton roots keep only true singleton settings.

Target collection roots:

- `scenes`
- `sections`
- `lines`
- `images`
- `sounds`
- `videos`
- `animations`
- `characters`
- `fonts`
- `transforms`
- `colors`
- `textStyles`
- `variables`
- `layouts`

All entity ids use UUIDv7.

## Story Relations

- Story root has `initialSceneId`.
- Collection ordering belongs to each collection’s own `tree`.
- Do not duplicate collection ordering in separate root-level `...Order` arrays.

## Resource Relations

- Character resources can own a nested `sprites` tree collection.
- Layout elements can reference resources by `{ resourceType, resourceId }`.
- Line actions can reference scene ids, layout ids, and resource ids.

## Required Invariants

1. `project.id` exists and is immutable.
2. `story.initialSceneId` must exist in `scenes.items`.
3. Every collection tree entry must reference an existing item.
4. No duplicate ids in collection trees.
5. No cycles in tree-like structures.
6. Every resource reference points to an existing entity.
7. Layout and scene references must point to valid entity type.
8. Deleted entities cannot remain referenced.
9. Numeric ranges:

- positions/sizes finite numbers
- opacity `[0, 1]`
- audio volume `[0, 1]`

## Forbidden Patterns

- Direct arbitrary nested writes to unknown paths.
- Accepting UI blobs/functions in payloads.
- Silent orphan creation.
