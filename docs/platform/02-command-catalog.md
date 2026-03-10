# 02 Command Catalog

All mutations are commands. UI must only submit commands from this catalog.

## Client Command Envelope

```json
{
  "id": "uuidv7",
  "projectId": "uuidv7",
  "partition": "project:{projectId}:story",
  "partitions": ["project:{projectId}:story"],
  "type": "scene.create",
  "commandVersion": 1,
  "actor": {
    "userId": "uuidv7",
    "clientId": "uuidv7"
  },
  "clientTs": 1760000000000,
  "payload": {},
  "meta": {}
}
```

Notes:

- `partitions` is the authoritative partition list sent to sync.
- `partition` is the primary/base partition and is still part of the client command shape.
- The client command envelope is a submission contract. It is not the same thing as the stored committed event row.

## Partition Map

- `project:{id}:story`
- `project:{id}:story:scene:{sceneId}` as a secondary scene partition when a scene is known
- `project:{id}:resources:{resourceType}`
- `project:{id}:layouts` for `layout.element.*`
- `project:{id}:settings`

## Project Commands

- `project.created`: `{ state }`
- `project.update`: `{ patch }`

## Story Commands

- `scene.create`: `{ sceneId, name, parentId?, index?, position?, data? }`
- `scene.update`: `{ sceneId, patch }`
- `scene.rename`: `{ sceneId, name }`
- `scene.delete`: `{ sceneId }`
- `scene.set_initial`: `{ sceneId }`
- `scene.move`: `{ sceneId, parentId?, index, position? }`

- `section.create`: `{ sectionId, sceneId, name, parentId?, index?, position?, data? }`
- `section.rename`: `{ sectionId, name }`
- `section.delete`: `{ sectionId }`
- `section.reorder`: `{ sectionId, parentId?, index, position? }`

- `line.insert_after`: `{ lineId, sectionId, line, afterLineId?, parentId?, index?, position? }`
- `line.update_actions`: `{ lineId, patch, replace? }`
- `line.delete`: `{ lineId }`
- `line.move`: `{ lineId, toSectionId, parentId?, index, position? }`

## Resource Commands

- `resource.create`: `{ resourceType, resourceId, data, parentId?, index?, position? }`
- `resource.update`: `{ resourceType, resourceId, patch }`
- `resource.rename`: `{ resourceType, resourceId, name }`
- `resource.move`: `{ resourceType, resourceId, parentId?, index, position? }`
- `resource.delete`: `{ resourceType, resourceId }`
- `resource.duplicate`: `{ resourceType, sourceId, newId, parentId?, index?, position?, name? }`

Collection-level authored entities should converge on `resource.*`, including:

- media/resource collections (`images`, `sounds`, `videos`, `fonts`, `colors`, `typography`, `characters`, `transforms`, `tweens`, `components`)
- `variables`
- `layouts`

## Layout Commands

- `layout.element.create`: `{ layoutId, elementId, parentId?, index?, element }`
- `layout.element.update`: `{ layoutId, elementId, patch, replace? }`
- `layout.element.move`: `{ layoutId, elementId, parentId?, index, position? }`
- `layout.element.delete`: `{ layoutId, elementId }`

## Validation Rules

- Unknown command types: reject `validation_failed`.
- Payload must pass schema validation for its command type.
- Precondition checks must run before reducer apply.
- Some semantic constraints live in domain preconditions rather than payload shape alone.
  Important examples:
  - `scene.set_initial` cannot target a folder
  - `scene.move` parent must be a folder when provided
  - `line.insert_after.afterLineId` must belong to the target section
  - `resource.update` for `variables` cannot change `type` / `variableType`
  - `layout.element.*` requires an existing layout and existing parent/element where applicable
