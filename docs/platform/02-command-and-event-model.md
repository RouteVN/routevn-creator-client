# 02 Command And Event Model

All project mutations use one canonical command/event contract.

Authoritative source: `src/domain/commandCatalog.js`.

This document is intentionally high-level. It explains how commands and
committed events relate, while the detailed command registry, payload rules,
and preconditions live in code.

## Client Command Envelope

Client submission uses this envelope:

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

- `type` and `payload` describe the actual domain mutation.
- `partitions` is the authoritative partition list sent to sync.
- `partition` is the primary/base partition and remains part of the client
  command shape.
- `meta` is open-ended JSON-safe metadata. Runtime-reserved fields include
  `clientId` and `clientTs`.

## Committed Event Shape

Commands become committed events with a server-assigned `committed_id`
ordering cursor and a command-owned `id`.

```json
{
  "committed_id": 12345,
  "id": "command-uuidv7",
  "project_id": "uuidv7",
  "user_id": "uuidv7",
  "partitions": ["project:{projectId}:story"],
  "type": "scene.create",
  "payload": {
    "sceneId": "scene-1",
    "name": "Scene 1"
  },
  "meta": {
    "clientId": "uuidv7",
    "clientTs": 1760000000000
  },
  "created": 1760000001000
}
```

Notes:

- client commands and committed events use the same canonical `type` names
- there is no nested legacy wrapper like `type: "event"` plus
  `payload.schema/payload.data`
- the backend/storage model is derived from the same command/event contract, but
  it is not the source of truth

## Relationship Between The Two

- client command = submission envelope
- committed event = normalized stored/replicated form of the same operation
- both share the same domain operation identity:
  - `type`
  - `payload`
  - `id`

Detailed command definitions, accepted payload fields, and preconditions live in
`src/domain/commandCatalog.js`.

## Partition Map

- `project:{id}:story`
- `project:{id}:story:scene:{sceneId}` as a secondary scene partition when a
  scene is known
- `project:{id}:resources:{resourceType}`
- `project:{id}:layouts` for `layout.element.*`
- `project:{id}:settings`

## Command Families

- Project: `project.*`
- Story: `scene.*`, `section.*`, `line.*`
- Resources: `resource.*`
- Layout internals: `layout.element.*`

## Validation And Preconditions

- unknown command types are invalid
- payload shape validation runs before reducer apply
- domain preconditions run before reducer apply
- reducer behavior must stay deterministic and side-effect free

Important examples of semantic preconditions:

- `scene.set_initial` cannot target a folder
- `scene.move` parent must be a folder when provided
- `line.insert_after.afterLineId` must belong to the target section
- `resource.update` for `variables` cannot change `type` / `variableType`
- `layout.element.*` requires an existing layout and existing parent/element
  where applicable

## Idempotency

- dedupe key: `id`
- same `id` + different canonical payload => reject `validation_failed`
- same `id` + same payload => return existing commit

## Canonicalization

Canonical input:

```json
{
  "partitions": ["sorted", "set"],
  "projectId": "uuidv7",
  "userId": "uuidv7",
  "type": "...",
  "payload": {},
  "meta": { "clientId": "uuidv7", "clientTs": 1760000000000 }
}
```

Canonicalization must use deep key-sorted deterministic JSON. The canonical
value is derived for comparison only and should not be stored as a full text
column.
