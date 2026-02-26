# 02 Command Catalog (V2)

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
- `scene.reorder`: `{ sceneId, index }`

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
- `resource.rename`: `{ resourceType, resourceId, name }`
- `resource.move`: `{ resourceType, resourceId, parentId?, index }`
- `resource.delete`: `{ resourceType, resourceId }`
- `resource.duplicate`: `{ resourceType, sourceId, newId }`

## Layout Commands

- `layout.create`: `{ layoutId, name, layoutType }`
- `layout.rename`: `{ layoutId, name }`
- `layout.delete`: `{ layoutId }`
- `layout.element.create`: `{ layoutId, elementId, parentId?, index?, element }`
- `layout.element.update`: `{ layoutId, elementId, patch, replace? }`
- `layout.element.move`: `{ layoutId, elementId, parentId?, index }`
- `layout.element.delete`: `{ layoutId, elementId }`

## Variable Commands

- `variable.create`: `{ variableId, name, variableType, initialValue }`
- `variable.update`: `{ variableId, patch, replace? }`
- `variable.delete`: `{ variableId }`

## Validation Rules

- Unknown command types: reject `validation_failed`.
- Payload must pass schema for its command type.
- Precondition checks must run before reducer apply.
