# 12 Windows Player Runtime Key/Value Contract

Date baseline: July 11, 2026.

Status: implemented and normative for schema version 1.

## Purpose

This document defines every key and JSON value that the exported Windows
player may store in `runtime.db`. It also defines the validation boundary,
failure behavior, and the scoped update payloads that modify those values.

This contract is deliberately explicit because these rows contain player save
data. A value that does not satisfy this document must not be written.

The database location, single-game identity decision, durability settings,
native command boundary, and IndexedDB cutover are defined in
`11-windows-player-runtime-persistence.md`.

## Identity And Namespace Rule

One Tauri application identifier identifies one game and therefore one
`runtime.db`.

There is no project, player, account, bundle, or namespace prefix inside the
database. In particular, none of these are valid native keys:

```text
<namespace>:saveSlots:1
<projectId>:saveSlots:1
<playerId>:saveSlots:1
saveSlots
```

The valid key for slot 1 is exactly:

```text
saveSlots:1
```

## SQLite Row Contract

`persistence_values` has one row per independently persisted value:

| Column | Contract |
| --- | --- |
| `key` | One supported fixed key or `saveSlots:<slotId>` |
| `value_json` | Syntactically valid JSON whose root is an object |
| `updated_at` | Non-negative Unix epoch timestamp in milliseconds |

The supported `persistence_values.key` values are:

| Physical key | Cardinality | JSON value |
| --- | ---: | --- |
| `saveSlots:<slotId>` | Zero or more | One complete save-slot object |
| `globalDeviceVariables` | Zero or one | Device-scoped variable map |
| `globalAccountVariables` | Zero or one | Account-scoped variable map |
| `globalRuntime` | Zero or one | Persisted global runtime preferences |
| `accountViewedRegistry` | Zero or one | Account-level viewed-content registry |

There is no aggregate `saveSlots` row. Route Engine uses an aggregate
`saveSlots` object in memory, but the native adapter expands it into one row per
slot and reconstructs it on load.

A missing fixed row loads as `{}`. No save-slot rows load as `saveSlots: {}`.
Missing data is different from malformed data: a present malformed row is an
error and is never treated as missing.

## Save-Slot Key Grammar

A physical save-slot key has this grammar:

```text
saveSlots:<slotId>
```

Rules:

- `<slotId>` must not be empty.
- A slot ID may be a non-empty JSON string or a JavaScript-safe integer.
- Numeric slot IDs use their base-10 string form in the physical key.
- The `slotId` inside `value_json` must identify the same slot as the key
  suffix.
- The prefix and capitalization are exact.

Examples:

| Route Engine slot ID | Physical SQLite key | Stored `slotId` |
| --- | --- | --- |
| `1` | `saveSlots:1` | `1` |
| `2` | `saveSlots:2` | `2` |
| `"auto"` | `saveSlots:auto` | `"auto"` |
| `"quick"` | `saveSlots:quick` | `"quick"` |

These combinations are invalid:

```text
key = saveSlots:1, value.slotId = 2
key = saveSlots:, value.slotId = ""
key = saveSlots, value.slotId = 1
```

The Route Engine adapter call still receives an aggregate snapshot:

```js
{
  "1": saveEntryForSlot1,
  "2": saveEntryForSlot2,
}
```

The native adapter validates that complete snapshot and writes two physical
rows:

| Physical key | `value_json` root |
| --- | --- |
| `saveSlots:1` | `saveEntryForSlot1` itself |
| `saveSlots:2` | `saveEntryForSlot2` itself |

The row value is not wrapped in `{ "1": ... }` or `{ "saveSlots": ... }`.

## JSON Number And Integer Rules

All values cross a JavaScript-to-Tauri JSON boundary. Therefore:

- `NaN`, positive or negative infinity, `undefined`, functions, symbols,
  `BigInt`, and cyclic objects are not JSON values and cannot be persisted.
- Fields documented as `number` must be finite JSON numbers.
- Fields documented as `integer` must have no fractional part and must be in
  JavaScript's safe integer range, `-(2^53 - 1)` through `2^53 - 1`.

A syntactically valid JSON value is one of: `null`, a boolean, a finite number,
a string, an array of JSON values, or an object whose properties are JSON
values.

## `saveSlots:<slotId>` Value

Each `saveSlots:<slotId>` row stores one Route Engine save entry. The current
save format version is `1`.

### Complete Example

```json
{
  "formatVersion": 1,
  "slotId": 1,
  "savedAt": 1700000000000,
  "image": "data:image/webp;base64,UklGRg...",
  "state": {
    "contexts": [
      {
        "currentPointerMode": "read",
        "pointers": {
          "read": {
            "sceneId": "scene-1",
            "sectionId": "section-1",
            "lineId": "line-3"
          }
        },
        "configuration": {},
        "views": [
          {
            "layoutId": "dialogue"
          }
        ],
        "bgm": {
          "resourceId": "bgm-1"
        },
        "variables": {
          "score": 12,
          "routeUnlocked": true,
          "profile": {
            "name": "Ada",
            "tags": ["reader", null]
          }
        },
        "runtime": {
          "saveLoadPagination": 1,
          "menuPage": "",
          "menuEntryPoint": ""
        },
        "rollback": {
          "currentIndex": 1,
          "isRestoring": false,
          "replayStartIndex": 0,
          "timeline": [
            {
              "sectionId": "section-1",
              "lineId": "line-1",
              "rollbackPolicy": "free"
            },
            {
              "sectionId": "section-1",
              "lineId": "line-3",
              "rollbackPolicy": "free",
              "executedActions": [
                {
                  "type": "pushOverlay",
                  "payload": {
                    "resourceId": "menu"
                  }
                }
              ]
            }
          ]
        }
      }
    ]
  }
}
```

`image` may be omitted when no thumbnail was supplied. It may also be a JSON
string or `null` when present.

### Top-Level Save Entry

| Field | Required | Type and rule |
| --- | ---: | --- |
| `formatVersion` | Yes | Integer; must equal `1` |
| `slotId` | Yes | Non-empty string or JavaScript-safe integer; must match the physical key suffix |
| `savedAt` | Yes | Non-negative JavaScript-safe integer Unix timestamp in milliseconds |
| `image` | No | String or `null`; normally an image data URL |
| `state` | Yes | Save state object defined below |

The top-level save entry is the only extensible object in the save-slot
contract. Additional top-level JSON fields are preserved for Route Engine or
host metadata. Required fields and their meanings cannot be replaced by an
extension.

### `state`

`state` is a closed object with exactly one supported field:

| Field | Required | Type and rule |
| --- | ---: | --- |
| `contexts` | Yes | Non-empty array of save-context objects |

Each `contexts` entry must satisfy the complete context contract below.

### Save Context

| Field | Required | Type and rule |
| --- | ---: | --- |
| `currentPointerMode` | Yes | String; exactly `read` |
| `pointers` | Yes | Closed object containing exactly one required `read` pointer |
| `configuration` | Yes | JSON object owned by Route Engine |
| `views` | Yes | Array whose entries are JSON objects |
| `bgm` | Yes | JSON object; optional `resourceId` must be a string |
| `variables` | Yes | Variable map defined below |
| `runtime` | No | Closed context-runtime object defined below |
| `rollback` | Yes | Closed rollback-state object defined below |

The context object is closed. Fields such as `projectData`, `pendingEffects`,
global variables, render snapshots, timers, or other transient state are not
allowed.

`configuration`, each `views` entry, and `bgm` are engine-owned JSON objects.
The native layer validates their container types. When `bgm.resourceId` is
present, it must be a string.

### Read Pointer

| Field | Required | Type and rule |
| --- | ---: | --- |
| `sceneId` | No | String |
| `sectionId` | Yes | Non-empty string |
| `lineId` | Yes | Non-empty string |

`sectionId` and `lineId` must be non-empty strings. The pointer object is
closed.

The native storage layer cannot prove that these IDs exist in the exported
project because project data is not passed into persistence commands. Route
Engine performs that referential check against the current `projectData` when
it hydrates or loads a slot. The native layer still validates the complete JSON
shape and pointer consistency before storage.

### Context Variables

`variables` follows the same value rules as the global variable maps. It is a
JSON object whose property names are variable IDs.

| Variable value root type | Allowed |
| --- | ---: |
| String | Yes |
| Finite number | Yes |
| Boolean | Yes |
| JSON object | Yes |
| JSON array | Yes |
| `null` | No |

Variable IDs must be non-empty. A variable's top-level value must not be
`null`. Nested object or array data may contain `null` because that remains a
valid object-variable payload.

The native database does not receive the game's variable configuration, so it
cannot determine whether a particular ID was authored as a string, number,
boolean, or object variable. Route Engine validates that configured type before
it emits persistence updates. The native layer validates the complete allowed
JSON value domain and rejects `null` or non-JSON values.

### Context Runtime

`runtime` is optional. If present, it is closed and all three fields are
required:

| Field | Required | Type and rule |
| --- | ---: | --- |
| `saveLoadPagination` | Yes | JavaScript-safe integer greater than or equal to `1` |
| `menuPage` | Yes | String; may be empty |
| `menuEntryPoint` | Yes | String; may be empty |

`saveLoadPagination` must be a JavaScript-safe integer greater than or equal to
`1`. `menuPage` and `menuEntryPoint` may be empty strings.

These fields belong inside a slot context. They must not be written into the
`globalRuntime` row.

### Rollback State

Rollback-state fields:

| Field | Required | Type and rule |
| --- | ---: | --- |
| `currentIndex` | Yes | JavaScript-safe integer identifying an entry in `timeline` |
| `isRestoring` | Yes | Boolean |
| `replayStartIndex` | Yes | Non-negative JavaScript-safe integer |
| `timeline` | Yes | Non-empty array of rollback-checkpoint objects |

Rollback-checkpoint fields:

| Field | Required | Type and rule |
| --- | ---: | --- |
| `sectionId` | Yes | Non-empty string |
| `lineId` | Yes | Non-empty string |
| `rollbackPolicy` | No | String |
| `executedActions` | No | Array of closed action objects |

Each `executedActions` entry requires a non-empty string `type`. It may also
contain `payload`, whose value may be any syntactically valid JSON value. No
other action fields are accepted.

All rollback objects are closed. Additional rules:

- `timeline` must not be empty.
- `sectionId`, `lineId`, and action `type` must be non-empty strings.
- Optional `rollbackPolicy` must be a string.
- `currentIndex` must identify an entry in `timeline`.
- `replayStartIndex` must be a non-negative JavaScript-safe integer. It may be
  greater than `currentIndex` for Route Engine's compatibility anchor, which
  intentionally skips replay before that index.
- The checkpoint at `currentIndex` must have the same `sectionId` and `lineId`
  as the context's read pointer.
- `executedActions[].payload` may be any syntactically valid JSON value.

## `globalDeviceVariables` Value

This row stores device-scoped persistent variables:

```json
{
  "textSpeed": 42,
  "accessibilityMode": true
}
```

It follows the variable-map contract defined under save-slot context variables.
The root must be an object, variable IDs must be non-empty, and a top-level
variable value must be a JSON string, number, boolean, object, or array. A
top-level `null` value is invalid.

An empty map is valid:

```json
{}
```

## `globalAccountVariables` Value

This row has the same shape and validation rules as
`globalDeviceVariables`, but its values are account-scoped:

```json
{
  "routeUnlocked": true,
  "endingCount": 2
}
```

The Windows local player currently stores both device- and account-scoped
values in the same game-local `runtime.db`. The different keys preserve Route
Engine's scope semantics; they do not imply a cloud account or a second local
database.

## `globalRuntime` Value

This row stores only the seven durable global runtime preferences:

| Field | Type | Default | Additional validation |
| --- | --- | ---: | --- |
| `dialogueTextSpeed` | Number | `50` | Finite JSON number |
| `autoForwardDelay` | Number | `1000` | Finite JSON number |
| `skipUnseenText` | Boolean | `false` | None |
| `skipTransitionsAndAnimations` | Boolean | `false` | None |
| `soundVolume` | Number | `50` | From `0` through `100` inclusive |
| `musicVolume` | Number | `50` | From `0` through `100` inclusive |
| `muteAll` | Boolean | `false` | None |

Canonical full value:

```json
{
  "dialogueTextSpeed": 50,
  "autoForwardDelay": 1000,
  "skipUnseenText": false,
  "skipTransitionsAndAnimations": false,
  "soundVolume": 50,
  "musicVolume": 50,
  "muteAll": false
}
```

The root object is closed. Unknown fields are rejected. Individual fields may
be absent for an empty or older imported record; Route Engine fills absent
fields from the defaults above. Current Route Engine full-snapshot writes
include all seven fields.

Transient fields are intentionally invalid here, including:

```text
autoMode
skipMode
dialogueUIHidden
isLineCompleted
saveLoadPagination
menuPage
menuEntryPoint
```

The first four are session-only. The final three are slot-context runtime
fields.

## `accountViewedRegistry` Value

Canonical value:

```json
{
  "sections": [
    {
      "sectionId": "prologue",
      "lastLineId": "line-5"
    },
    {
      "sectionId": "credits"
    }
  ],
  "resources": [
    {
      "resourceId": "cg-opening"
    }
  ]
}
```

Canonical fields:

| Field | Required | Type and rule |
| --- | ---: | --- |
| `sections` | No | Array of closed section-view objects |
| `resources` | No | Array of closed resource-view objects |

Each section-view object requires a non-empty string `sectionId`. It may also
contain `lastLineId` as a string or `null`. Each resource-view object contains
exactly one required, non-empty string `resourceId`.

The root and entry objects are closed. IDs must be non-empty strings. A missing
or `null` `lastLineId` represents the whole-section-viewed form. `{}` is a valid
empty or pre-normalized record; native `markViewed` writes canonical
`sections` and `resources` arrays.

For compatibility with legacy IndexedDB records and Route Engine's existing
hydration rules, an entry in either array may also be a non-empty string or a
JavaScript-safe integer:

```json
{
  "sections": ["prologue", 2],
  "resources": ["cg-opening", 7]
}
```

New native scoped updates do not produce this scalar form.

## `persistence_metadata` Key And Value

`persistence_metadata` is not Route Engine JSON storage. Schema version 1
allows exactly one internal key/value pair:

| Key | Value | Meaning |
| --- | --- | --- |
| `legacyIndexedDbMigrationCompleted` | Text value `1` | The one-time legacy IndexedDB decision/import committed successfully |

The value is the SQLite text `1`, not JSON `true`, JSON `1`, or the string
`"true"` inside a JSON document.

`clear()` deletes rows from `persistence_values` but preserves this marker so
cleared legacy data is not imported again.

## Scoped Update Input Contract

`applyScopedDataUpdates` does not create another physical key. It modifies
`globalDeviceVariables`, `globalAccountVariables`, or
`accountViewedRegistry` transactionally.

### Variable Set

```json
{
  "scope": "device",
  "path": "variables.textSpeed",
  "op": "set",
  "value": 60
}
```

Rules:

- `scope` is exactly `device` or `account`.
- `path` is `variables.<variableId>` with a non-empty variable ID.
- `op` is exactly `set`.
- `value` follows the variable-value table above; top-level `null` is rejected.
- Only that variable entry is changed.

### Viewed Registry `markViewed`

```json
{
  "scope": "account",
  "path": "viewedRegistry",
  "op": "markViewed",
  "value": {
    "sections": [
      {
        "sectionId": "prologue",
        "lineId": "line-5"
      }
    ],
    "resources": [
      {
        "resourceId": "cg-opening"
      }
    ]
  }
}
```

Rules:

- `scope` is exactly `account`.
- `path` is exactly `viewedRegistry`.
- `op` is exactly `markViewed`.
- `value` is a closed object containing `sections`, `resources`, or both.
- Both fields are arrays when present.
- New update entries are objects, not legacy scalar IDs.
- Entry objects are closed and their IDs are non-empty strings.
- `lineId` is optional; when present it is a non-empty string.

The operations in one call are ordered. The Rust adapter validates the complete
batch and builds the resulting values before issuing any SQL write. If any
operation is invalid, no operation in the batch commits.

## Validation Pipeline

Every write passes through all applicable layers:

1. The Windows JavaScript host requires object-shaped persistence payloads. It
   does not silently convert arrays, strings, `null`, or other invalid values to
   `{}`.
2. The Tauri command boundary and `serde_json` accept only syntactically valid
   JSON values.
3. Rust validates the key-specific semantic contract in this document.
4. Multi-value operations validate their complete snapshot or batch before any
   SQL mutation. SQLite transactions provide a second all-or-nothing boundary.
5. SQLite `CHECK` constraints require a supported key, a valid object-root JSON
   document, and a non-negative `updated_at` value.
6. Every value is parsed and semantically validated again on load before it is
   returned to Route Engine.

The SQLite checks are defense in depth. They do not replace the Rust semantic
validator because SQLite cannot express the complete nested save-slot contract.

## Rejection And Atomicity Rules

When validation fails:

- the command returns an error
- no invalid value is inserted or updated
- `saveSlots(...)` does not delete an omitted old slot or update any valid slot
  from the same rejected snapshot
- `applyScopedDataUpdates(...)` commits none of the batch
- a legacy import writes no runtime rows and does not write the migration marker
- an invalid stored row causes an explicit load failure and remains untouched
  for diagnosis

Validation must never recover by silently replacing a supplied malformed value
with `{}`.

## Row Update Semantics

- A changed row receives a new `updated_at` timestamp.
- An unchanged row is not rewritten and keeps its existing timestamp.
- `saveSlots(...)` deletes physical slot rows absent from a valid incoming slot
  snapshot and upserts changed/present slots in the same transaction.
- Deleting a slot is represented by its absence from the valid aggregate
  snapshot, not by storing `null`.
- `clear()` deletes all `persistence_values` rows in one transaction and keeps
  `persistence_metadata`.

## Versioning Rules

SQLite schema version is stored in `PRAGMA user_version`. The current version
is `1`.

Save-entry format version is stored in each save entry as `formatVersion`. The
current and only accepted version is `1`.

Changing this contract requires coordinated changes:

- adding or removing a physical fixed key requires a SQLite schema migration,
  Rust validation, adapter coverage, tests, and this document
- changing required slot state or context fields requires an explicit save
  format compatibility decision and normally a `formatVersion` change
- changing table columns or SQLite constraints requires a `user_version`
  migration
- adding a scoped operation requires an explicit operation name and validation;
  existing operations must not be overloaded with a new meaning
- adding a persisted global runtime field requires Route Engine's persisted
  runtime catalog, Rust validation, defaults, tests, and this document to move
  together

Do not broaden validation ad hoc to make a malformed row load. Compatibility
must be named, tested, and documented.

## Canonical Implementation And Tests

- Rust schema, validation, transactions, and read validation:
  `crates/routevn-packager/tauri-shell/src-tauri/src/player_persistence.rs`
- Windows JavaScript host boundary:
  `src/deps/clients/tauri/playerRuntimePersistenceHost.js`
- Native command wiring:
  `crates/routevn-packager/tauri-shell/src-tauri/src/lib.rs`
- JavaScript host tests:
  `tests/tauri/playerRuntimePersistenceHost.test.js`
- Route Engine source contract pinned by this app:
  `route-engine-js@1.26.1`

The Rust tests cover valid numeric and named slots, each nested malformed slot
family, fixed-key value validation, malformed scoped updates, rejected
multi-slot snapshots, rejected legacy imports, invalid JSON at the SQLite
boundary, semantic validation on load, and preservation of corrupt rows for
diagnosis.
