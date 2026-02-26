# 04 Sync Protocol (V2)

Protocol layer is Insieme `1.0` based.

## Required Flow

1. `connect`
2. `connected`
3. `sync`
4. `sync_response` pages until `has_more=false`
5. submit commands as single-event `submit_events`

## Transport Envelope

Required fields:

- `type`
- `protocol_version`
- `payload`

Optional:

- `msg_id`
- `timestamp`

## Error Codes

- `auth_failed`
- `protocol_version_unsupported`
- `bad_request`
- `forbidden`
- `validation_failed`
- `rate_limited`
- `server_error`

## Authorization

- Token identity validated on connect.
- Partition authorization on submit and sync.
- Unauthorized partition access => `forbidden`.

## Broadcast Rules

- Origin submitter gets authoritative submit result.
- Other clients get `event_broadcast`.
- Broadcast suppressed while client has active sync paging.
