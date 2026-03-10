# 03 Event Model

Commands become committed events with a server-assigned `committed_id`
ordering cursor and a command-owned `id`.

There is no longer a nested legacy wrapper like:

```json
{
  "event": {
    "type": "...",
    "payload": {},
    "meta": {}
  }
}
```

Both client commands and committed events use top-level `type`, `payload`, and
`meta`.

## Relationship To Client Commands

- Client submission uses the command envelope documented in
  [02-command-catalog.md](./02-command-catalog.md).
- Storage/commit uses the committed event envelope below.
- Both use the same canonical operation `type` names.

## Committed Event Envelope

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

## Idempotency

- Dedupe key: `id`.
- Same `id` + different canonical payload => reject `validation_failed`.
- Same `id` + same payload => return existing commit.

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

Must use deep key-sorted deterministic JSON. The canonical value is derived for
comparison only and should not be stored as a full text column.

## Event Taxonomy

- Project: `project.*`
- Story: `scene.*`, `section.*`, `line.*`
- Resources: `resource.*`
  This includes collection-level lifecycle for `variables` and `layouts`.
- Layout internals: `layout.element.*`
- Stored committed event types and reducer command types use the same names.

## Event-Reducer Contract

- Reducer must be deterministic and side-effect free.
- Unknown event type is invalid and must be rejected before commit.
- There is no separate legacy `type: "event"` or `payload.schema` wrapper.
- Payload shape validation happens before reducer apply.
- Domain preconditions run before reducer apply and may reject otherwise shape-valid commands.
