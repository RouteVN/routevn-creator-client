# 02 Command Catalog

All mutations are commands. UI must only submit commands from this catalog.

## Command Envelope

```json
{
  "id": "uuidv7",
  "projectId": "uuidv7",
  "partition": "project:{projectId}:story",
  "type": "scene.create",
  "commandVersion": 1,
  "actor": {
    "userId": "uuidv7",
    "clientId": "uuidv7"
  },
  "clientTs": 1760000000000,
  "payload": {}
}
```

## Partition Map

- `project:{id}:story`
- `project:{id}:resources`
- `project:{id}:layouts`
- `project:{id}:settings`

## Story Commands

- `scene.create`: `{ sceneId, name, index? }`
- `scene.rename`: `{ sceneId, name }`
- `scene.delete`: `{ sceneId }`
- `scene.set_initial`: `{ sceneId }`
- `scene.move`: `{ sceneId, index }`

- `section.create`: `{ sectionId, sceneId, name, index? }`
- `section.rename`: `{ sectionId, name }`
- `section.delete`: `{ sectionId }`
- `section.reorder`: `{ sectionId, index }`

- `line.insert_after`: `{ lineId, sectionId, line, afterLineId? }`
- `line.update_actions`: `{ lineId, patch, replace? }`
- `line.delete`: `{ lineId }`
- `line.move`: `{ lineId, toSectionId, index }`

## Resource Commands

- `resource.create`: `{ resourceType, resourceId, data, parentId?, index? }`
- `resource.update`: `{ resourceType, resourceId, patch, replace? }`
- `resource.rename`: `{ resourceType, resourceId, name }`
- `resource.move`: `{ resourceType, resourceId, parentId?, index }`
- `resource.delete`: `{ resourceType, resourceId }`
- `resource.duplicate`: `{ resourceType, sourceId, newId }`

Collection-level authored entities should converge on `resource.*`, including:

- media/resource collections (`images`, `sounds`, `videos`, `fonts`, `colors`, `typography`, `characters`, `transforms`, `tweens`, `components`)
- `variables`
- `layouts`

## Layout Commands

- `layout.element.create`: `{ layoutId, elementId, parentId?, index?, element }`
- `layout.element.update`: `{ layoutId, elementId, patch, replace? }`
- `layout.element.move`: `{ layoutId, elementId, parentId?, index }`
- `layout.element.delete`: `{ layoutId, elementId }`

## Validation Rules

- Unknown command types: reject `validation_failed`.
- Payload must pass schema for its command type.
- Precondition checks must run before reducer apply.
