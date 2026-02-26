# 03 Event Model (V2)

Commands become committed events with server-assigned `committed_id`.

## Committed Event Envelope

```json
{
  "id": "uuidv7",
  "client_id": "uuidv7",
  "project_id": "uuidv7",
  "partitions": ["project:{projectId}:story"],
  "committed_id": 12345,
  "event": {
    "type": "scene.created",
    "payload": {},
    "meta": {
      "commandId": "uuidv7",
      "projectId": "uuidv7",
      "actor": { "userId": "uuidv7", "clientId": "uuidv7" },
      "ts": 1760000000000
    }
  },
  "status_updated_at": 1760000000000
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
  "event": { "type": "...", "payload": {} }
}
```

Must use deep key-sorted deterministic JSON.

## Event Taxonomy

- Story: `scene.*`, `section.*`, `line.*`
- Resources: `resource.*`
- Layouts: `layout.*`, `layout.element.*`
- Variables: `variable.*`

## Event-Reducer Contract

- Reducer must be deterministic and side-effect free.
- Unknown event type is invalid in V2 (reject before commit).
