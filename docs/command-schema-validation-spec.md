# Versioned Command Validation Specification

Status: the strict model, client acceptance path, storage version preservation,
and literal-object runtime changes are implemented on their feature branches.
Production dependency pins and reader/writer delivery are still pending. See
[implementation and release status](./validation-preparation/implementation-status.md)
for the exact test evidence and remaining release gates.

Date: September 13, 2026.

User review completed September 17, 2026. The
[approved behavior and handoff](./validation-preparation/README.md#approved-behavior-from-the-user-review)
records the decisions accepted one at a time, including templates and database
reconciliation. Implementation has resumed on `docs/versioned-schema-validation-plan`
at the user’s request, starting with the frozen compatibility baseline.

September 18 review refresh: this branch now includes client main `4d1fe31f`.
The implementation baseline uses creator-model `1.15.0` / schema `15`; M must
be a later release. Original schema-14 observations and illustrative `15`
fixture values remain archival evidence, not a strict-version registry. The
catalog now includes avatar previews/default-transform commands and an engine
release prerequisite for explicit literal object writes. No feature code was
implemented by these documentation corrections.

Preparation status: Phase 1 contracts and fixture artifacts are documented in
the [preparation package](./validation-preparation/README.md). This is ready for
implementation planning. The [old-project baseline gate](./validation-preparation/legacy-project-test-plan.md)
must pass before validator changes; strict writes remain disabled until
implementation, upstream releases, and required feature tests are complete.

## 1. Decision and outcome

Store a model schema version with each newly authored command inside the
existing persisted `payload` value. Use command envelope version `2` to identify
the new wrapper. Continue reading historical envelope-version-`1` commands with
their existing compatibility behavior.

This provides strict validation for every new command, including commands
written into existing projects, without changing SQLite tables or rewriting
historical command payloads.

The implementation must:

1. Preserve existing legacy project opening, loading, and recovery behavior;
   new validation must not introduce new load failures for legacy records.
2. Validate new command structure, state-aware preconditions, and the effective
   data produced by the command before accepting the write.
3. Preserve the validation version through drafts, persistence, replay,
   checkpoints, backup, and any configured synchronization.
4. Reject invalid or unsupported versioned records explicitly. They must never
   fall back to legacy validation.
5. Apply the same model-owned validation contract to the UI and a future API.

The application is local-first and this implementation does not require an
application server. References to sync cover the client integration already in
the repository; they do not prescribe a server implementation or deployment.

### 1.1 Compatibility requirement approved after review

**A legacy project that works before upgrading must still open afterward;
its subsequent edits receive strict validation.** Preserving files alone does
not satisfy this requirement. Loading, recovery, preview/export availability,
and the recovered state must retain their existing behavior.

This rule applies to ordinary opens, full reloads, draft recovery, checkpoint
recovery, and supported whole-project imports/restores. Preserve existing
legacy normalization and recovery/skip behavior where currently supported.
Do not add a new completeness, schema, or source-integrity gate that makes
such a project fail to open or become read-only because of its legacy data.
These rules also apply to the legacy portion of mixed histories.

All newly authored commands still pass current strict validation before
saving. A rejected edit leaves the loaded project and original history intact;
it does not make the project unloadable. Malformed envelope-2 records and
unsupported future versions remain explicit errors and cannot use legacy
recovery as a fallback. A new request cannot select the historical-load path.

Additional hardening of legacy recovery, including blocking on missing scene
source data or rejecting previously tolerated legacy version representations,
is deferred to a separate proposal. Compatibility must be verified against
the previous reader before release; the existing preparation probes alone do
not establish this guarantee.

## 2. Scope and exclusions

In scope:

- Versioned command encoding and decoding for SQLite and IndexedDB.
- Strict schemas for line actions and other places that contain authored
  actions, including nested callbacks and control interactions.
- Integration with all new-write and historical-read entry points.
- Compatible validation of mixed legacy/current project state.
- Regression coverage for old projects and persistence round trips.

This release does not introduce:

- New SQLite columns, tables, or a change to SQLite `PRAGMA user_version`.
- A new project history generation, a replacement bootstrap, history
  compaction, or an archive migration.
- An automatic rewrite, cleanup, or backfill of old command rows.
- A project-wide switch that marks all old content as strictly validated.
- A change to project-format compatibility or support for obsolete local
  database layouts.
- A blanket sanitizer for API payloads or historical actions.
- New blocking checks for legacy history/recovery that the previous reader
  accepted, including a new requirement to prove complete recovery sources.

These exclusions are intentional risk controls. Historical sanitization is
addressed separately in section 13.

## 3. Verified starting point

At the original preparation baseline (schema 14; see the September 18 refresh above):

- The client depends on `@routevn/creator-model` `1.14.0`.
- `creatorVersion` in project app-store metadata is derived from the Creator
  app's major version. It is not an exact creation app version or a command
  model version.
- `COMMAND_ENVELOPE_VERSION` is `1`. Its persisted SQLite column is
  `schema_version`.
- No dedicated model schema version is reliably persisted per command.
- `local_drafts` and `committed_events` both store `schema_version` and a
  `payload` BLOB. The payload codec serializes JSON into that existing value.
- Arbitrary command `meta` is not preserved by the current SQLite row format.
  Putting the model version only in `command.meta` would lose it on reload.
- The history loader reconstructs committed history plus ordered local
  drafts. A native local-only project may keep its entire history in drafts.
- For complete histories, main and scene projections use disposable checkpoints.
  Tauri also has an existing missing-bootstrap recovery path that depends on
  original checkpoints; those recovery sources must be retained (section 12).
- Model validation currently checks that line actions are objects, but does
  not comprehensively validate their contents. Similar gaps exist in layout
  interactions and control keyboard mappings.

Relevant implementation sources are linked in section 16. Older platform
documents contain historical version numbers and implementation descriptions;
those numbers must not be used to infer a command's actual authoring version.

## 4. Version vocabulary

| Version                             | Owner           | Meaning                                                | Storage under this proposal                              |
| ----------------------------------- | --------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| Project format (`creatorVersion`)   | Client          | Project container/open compatibility                   | Existing project app-store metadata; unchanged           |
| Command envelope (`schemaVersion`)  | Client          | How to interpret the stored event payload              | Existing `schema_version`; read `1` and `2`, write `2`   |
| Model schema (`modelSchemaVersion`) | Creator model   | Command payload and transition validation contract     | Required `mv` field inside an envelope-2 payload wrapper |
| Projection/view version             | Client          | How a cached projection is constructed and interpreted | Existing checkpoint version/metadata facilities          |
| Import-package schema               | Import contract | Resource-package transport format                      | Existing package manifest; independent of the above      |

Use `M` in implementation planning to mean the first released strict model
schema. Examples below use `15`; this is illustrative, not permission to
hard-code a version before release. The model package's exported
`SCHEMA_VERSION` remains aligned with its package minor version.

An envelope-1 record means **legacy model version unspecified**. It does not
mean model version `1` or model version `14`.

Supported strict model versions must be an explicit registry. A positive
integer is not automatically supported, and a version less than the current
one is not automatically legacy.

## 5. Stored event format

### 5.1 Envelope version 1: historical representation

For `type = "line.delete"`, the existing decoded payload is:

```json
{
  "lineIds": ["line-a"]
}
```

The row has `schema_version = 1`. All existing row values remain unchanged.

### 5.2 Envelope version 2: new representation

For the same command, the new decoded payload is:

```json
{
  "mv": 15,
  "commandPayload": {
    "lineIds": ["line-a"]
  }
}
```

The row has `schema_version = 2`. `type`, command identity, partition,
timestamps, and the database's other columns retain their existing purposes.

This applies to every newly authored command family, including
`project.create`, resource commands, and commands that contain no line actions.
There is no separate storage rule for the native draft table.

The wrapper has exactly two required keys:

| Field            | Contract                                                                            |
| ---------------- | ----------------------------------------------------------------------------------- |
| `mv`             | JSON number; positive safe integer; member of the supported strict-version registry |
| `commandPayload` | JSON object; validated by the named command's model contract                        |

`mv` means model schema version. Use this compact key in storage; the codec maps
it to `modelSchemaVersion` in the internal command descriptor. This saves 16 bytes
per command in uncompressed JSON while keeping the internal API descriptive.

Unknown wrapper keys, missing keys, arrays, null values, string versions,
fractional versions, and unsupported versions are errors. The command payload
itself may contain null only where its domain schema explicitly permits it.

The version is stored inside the existing JSON-encoded payload BLOB. This is
an envelope-format change, not a SQLite schema migration. Existing payload
serialization and compression mechanisms remain responsible for the bytes.

### 5.3 Decode by envelope version, never by shape guessing

| Stored envelope                                                       | Decoder behavior                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `1`                                                                   | Treat the entire stored payload as the legacy domain payload              |
| `2` with a valid wrapper and supported model version                  | Extract `commandPayload` and retain the explicit model version            |
| `2` without the required version or payload                           | Fail with an envelope error                                               |
| `2` with an unsupported model version                                 | Fail with a model-version compatibility error                             |
| Historical value already interpreted as legacy by the existing reader | Retain that existing read behavior under section 11.1; preserve raw bytes |
| Other unknown, missing, or malformed envelope version                 | Fail; do not invent a legacy interpretation or coerce it to `2`           |

An envelope-1 payload containing keys named `mv` or
`commandPayload` must not be reinterpreted as envelope 2. Envelope-2 validation
failure must not trigger a second attempt using envelope-1 rules.
The historical representation exception is scoped to existing compatibility
operations, never new authoring or a failed envelope-2 decode.

### 5.4 Canonical in-memory command

After decoding, the model sees domain data, with stored `mv` mapped to
`modelSchemaVersion`:

```json
{
  "type": "line.delete",
  "modelSchemaVersion": 15,
  "payload": {
    "lineIds": ["line-a"]
  }
}
```

Application envelope fields such as id and partition may accompany this
descriptor outside the model. For decoded envelope-1 history, the
`modelSchemaVersion` property is omitted.

`modelSchemaVersion` is compatibility metadata on the command descriptor. It
must not become a field in the domain payload or project state tree.

## 6. Ownership and public model behavior

The client owns the envelope-1/envelope-2 codec. The creator model owns the
versioned payload validators, preconditions, reducers, action contracts, and
result validation. The client must not implement private validators that hide
missing model support.

Extend the existing model entry points with an optional model version rather
than introducing separate command implementations for every client:

```js
validatePayload({ type, payload, modelSchemaVersion });
validateAgainstState({ state, command });
processCommand({ state, command });
replayCommands({ state, commands });
validateState({ state, modelSchemaVersion });
```

The existing unversioned signatures retain their documented compatibility
behavior. An explicit supported strict version selects its strict contract.
An explicit invalid value, including null, never means "version omitted."

`validateState({ state })` remains the compatible whole-state check. An
explicit model version requests full-state validation for that strict schema,
for example when validating a new template or full new project.

`processCommand` does not automatically call strict whole-state validation on
all content merely because one command has a strict version. Its mixed-state
contract is specified in section 8.

The model remains pure and transport-independent. It does not inspect SQLite
rows, wrap stored payloads, choose actors, or decide whether a caller is
allowed to submit legacy data.

Keeping an unversioned compatibility API is not an authorization mechanism.
The app-owned submission boundary must always attach the current strict model
version before invoking the model for new input.

### 6.1 Existing client model extensions

The current creator-model adapter reduces some character sprite/spritesheet
commands entirely in the client. It also strips spritesheet state before
ordinary model calls and merges it back afterward. These are explicit gaps in
the proposed model-owned validation boundary, not version propagation alone.

The [action catalog](./validation-preparation/action-contracts.md) inventories
shipped adapter-only shapes and transformations. Support their strict payloads,
state, references, and reducer semantics in the
owning model release before enabling strict authoring. New templates containing
spritesheets and line actions referencing spritesheet sprites must validate
against the complete supported domain state.

Every strict command must reach model version dispatch. A client-only early
success return or validation against a projection that hides authored fields
does not satisfy the contract. Existing historical compatibility transforms
may remain, but must not repair invalid new payloads or hide invalid newly
produced content before strict validation.

## 7. New input versus historical replay

There are two application operations with one shared version dispatcher:

```text
New UI/API input
  -> validate the authoring request envelope
  -> attach current model version M internally
  -> validate and apply against current repository state
  -> encode envelope 2
  -> persist the accepted command

Existing stored history
  -> decode the recorded envelope version
  -> select the recorded model contract, or legacy when envelope = 1
  -> replay without changing the record
```

The public authoring request supplies domain `type` and `payload`, plus any
separately documented request identity fields. It cannot supply a legacy
validation flag or select an older validation contract. Reserved version
fields supplied by an external authoring caller are rejected rather than
used as instructions. Application-internal commands must agree with the
current authoring versions.

All newly authored commands use envelope 2 and the current model version,
including new edits to old projects. The absence of a caller-provided version
does not grant access to the historical path.

Historical records retain their original identity, version, and payload during
reload, retransmission, and backup. Retransmitting an already persisted legacy
record is distinct from authoring a new unversioned command. A low-level sync
retry must not stamp or re-encode an existing record using today's versions.

The app must not expose its raw history importer as an unrestricted command
submission API. A supported whole-project import is explicitly a compatibility
operation; it is not proof that the imported content was ever strictly
validated. Strict resource-package imports remain separate.

## 8. Validation of commands and state

### 8.1 Required checks

Each newly accepted command must pass:

1. **Payload validation:** exact allowed structure, values, and nested schemas.
2. **Preconditions:** the command is applicable to the current authoritative
   local repository state, including required referenced data.
3. **Effective-result validation:** after applying merge, preserve, and reducer
   rules on a working copy, the newly authored structures satisfy their strict
   schema.
4. **Compatible state/invariant validation:** the resulting project retains
   existing structural and consistency guarantees.

Validation must not mutate the supplied payload or current state. A failed
command must produce no accepted event and no published next state.

### 8.2 Mixed-state rule

Existing projects can contain both legacy and strictly authored content. The
latest command's version must not be treated as the version of the whole
project.

Example:

- Line A contains a historical action with an unrecognized field.
- Line B contains a current dialogue action.
- A current command changes Line B.

Line B's new effective dialogue action must pass strict validation. Line A is
not retroactively rejected. Existing compatible whole-state checks still run.

The strict scope follows domain mutation semantics, not merely a generic
recursive diff. Copying content, creating a new object, replacing an object,
and preserving part of an edited action each have explicit rules:

| Operation                                                   | Strict result scope                                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `project.create`                                            | Complete supplied initial state, recursively                                                                                |
| `line.create`                                               | Every newly created line's complete actions object                                                                          |
| `line.update_actions`, default merge                        | Each supplied action and the effective changed action batch; untouched sibling actions are not retroactively schema-checked |
| `line.update_actions`, `replace: true`                      | Complete replacement actions object                                                                                         |
| Update with `preserve: ["dialogue.content"]`                | Effective dialogue action, including retained content                                                                       |
| Create/copy an element, control, or layout                  | Complete newly created action-bearing content, including nested callbacks                                                   |
| Update an interaction                                       | Complete effective interaction being written                                                                                |
| Rename/reorder without changing ownership or action context | Placement/name preconditions and existing invariants; no blanket action migration                                           |
| Move across ownership/context boundaries                    | Relevant inbound/outbound reference and context checks, in addition to placement and existing invariants                    |
| Delete an action/item                                       | Removal semantics and reference consequences; deletion must not require repairing the removed action first                  |

If preserved legacy content makes an edited action invalid, reject the write
with the affected path. The caller must supply a supported complete action or
use an explicit supported conversion. Silently dropping retained dialogue
content is forbidden.

Payload schemas must distinguish a permitted patch from a complete action.
For example, `preserve: ["dialogue.content"]` permits omitting that field in
the request, but the effective dialogue must include valid retained content.
Default `line.update_actions` merge replaces each supplied action as a whole;
it does not recursively merge fields within that action. Only explicitly
supported preserve behavior carries fields across that replacement.

Checks for interactions between actions must inspect the relevant effective
batch, including known retained siblings. For example, adding a navigation
action cannot ignore another supported navigation action already present.
An unrelated untouched legacy subtree must not become a reason to validate
the entire project under the strict schema.

### 8.3 References and partitioned state

Strict checks cover concrete references and their expected resource types,
scene/section ownership, and variable operation permissions/types. Dynamic
bindings must have an explicitly supported schema and evaluation context;
they cannot be mistaken for static resource ids or accepted as arbitrary code.

An unloaded scene or resource is not evidence that it does not exist. The
submission service must load the affected state and dependencies, or query
appropriate authoritative indexes, before state-aware validation.

Resource deletion and edits to referenced resources must follow explicit
model rules. They must not introduce newly dangling references in supported
authored structures. Do not retroactively fail an unrelated operation merely
because an existing legacy reference was already invalid. Reference cleanup
must use documented reducer behavior or explicit commands, not an implicit
project-wide sanitizer.

Moving a section from Scene A to Scene B can invalidate an unchanged
`sectionTransition` that still targets `{ sceneId: A, sectionId: S }`.
Ownership changes, variable type/permission changes, and similar dependency
edits therefore require reference-impact checks even when no action payload
is directly edited. Compare relevant before/after relationships: reject newly
invalid supported references, while leaving already invalid unrelated legacy
references alone. This does not require tagging every state object with its
authoring version. Any automatic reference rewrite must be an explicit,
versioned model reducer rule covered by fixtures.

### 8.4 Batches

Preflight the entire batch against a sequential working state before writing
any of it. Later commands see earlier proposed results. Invalid arrays,
missing command entries, or falsy entries are errors, not entries to filter
out. Invalid input in command N means zero new rows from the batch.

Run affected-result checks for each command even if a later command deletes
the invalid data. Full compatible state checking can be amortized only when
equivalence to sequential authoritative application is proven.

Validation atomicity does not itself guarantee database transaction atomicity.
Current native `insertDrafts` adapters can perform sequential single inserts.
The implementation must preserve accurate partial/unknown I/O failure
reporting and retry identities; it must not claim an all-or-nothing disk
transaction without testing the actual platform adapter. General transaction
redesign is a separate concern from the envelope format.

### 8.5 Validation and write ordering

The final state-aware check and acceptance decision must run within the
project's serialized write operation. An earlier UI preflight is useful for
feedback but cannot authorize a later write against a different state.

One project acceptance operation must own state refresh, sequential preflight,
persistence, and advancement of the authoritative accepted state before
releasing its queue. UI command APIs and direct sessions delegate to that
operation; they must not independently apply the same accepted command again.
Serializing only database inserts still lets a second command validate against
state that omits a first command already written to disk.

On partial or unknown insertion failure, reconcile persisted command identities
and recover the accepted state before allowing another write. Never assume
the whole batch failed or blindly retry with new identities. The
[acceptance contract](./validation-preparation/replay-and-acceptance.md) names
the shared repository coordinator and each platform's coordination and recovery
mechanism.

Capture the project identity and relevant revision while loading dependencies.
If either changes before acceptance, revalidate against the current state or
return an explicit stale-context error. Do not publish a result calculated
from an obsolete state. Across tabs or processes, use the storage adapter's
supported coordination/revision mechanism; a JavaScript queue in one instance
alone is not a cross-instance lock.

### 8.6 Historical dependency state

During authoritative replay, command preconditions and effective results must
be evaluated against the state immediately preceding that command in history,
including referenced data from other partitions. Loading the latest main
projection does not supply the historical dependencies of an earlier event.

For example, a valid history can create Image X, assign it to a line, clear the
line's image action, and then delete X. Replaying the assignment against today's
main state would incorrectly reject the missing image. Cold and warm reloads
must both reproduce the valid final result.

The correctness baseline is chronological replay with dependencies at the
matching history position. The initial implementation uses a complete
chronological authority and derives UI projections from accepted state, as
specified in the [replay contract](./validation-preparation/replay-and-acceptance.md).
Lazy projection optimizations must either reconstruct those dependencies or
consume transitions already validated against that exact history prefix and
policy. They must not silently disable strict checks, use current resources
as historical substitutes, or skip failed versioned events.

## 9. Strict action-schema requirements

### 9.1 Registry and coverage

There must be an explicit versioned registry of Creator-supported action names
and their permitted contexts. No action is supported solely because its value
is an object, a runtime has a similarly named function, or a UI can display it.

Before enabling strict writes, inventory all action shapes emitted by the
current client and shipped templates. Compare them with engine contracts and
historical model fixtures. Publish a contract/fixture matrix in the model
repository with required/optional fields, types, ranges, references, contexts,
and mutation behavior for each supported action.

The initial coverage must include:

| Family                                                           | Required coverage                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Dialogue                                                         | Content and segments, presentation/layout references, clear behavior, supported alternative representations         |
| Screen/background/visual/character                               | Resource and sprite references, transforms, effects, animations, playback settings, nested items                    |
| BGM/voice/SFX                                                    | Sources, channels, scheduling, playback/effect options, persistent sound identities                                 |
| Choice/input/form-like workflows                                 | Items and fields, permitted value bindings, nested event actions, submission/cancellation actions where supported   |
| Navigation and playback controls                                 | Section/scene targets, next-line configuration, overlays, save/load/rollback, permitted action combinations         |
| Variable/condition actions                                       | Operator grammar, operands, variable types, writable targets, branch structure, nested actions                      |
| Runtime settings                                                 | Per-action value types and ranges; event bindings only where supported                                              |
| Layout/control interactions                                      | Click/change/scroll and other supported interaction wrappers, keyboard and keyup entries, recursive payload actions |
| Confirmation callbacks and other supported nested action holders | Recursion through every action-bearing branch; no opaque catch-all action payload                                   |

The engine has capabilities beyond the client authoring UI. The inventory must
explicitly decide which are Creator-supported. A new runtime feature must not
silently become a free-form Creator action.

### 9.2 Structural rules

- Reject unknown action names and unknown structural fields in strict input.
- Distinguish omitted, null, empty object, empty array, and explicit clear
  operations according to each action's contract.
- Require finite numbers and domain-appropriate ranges. Integer requirements
  use safe integers where values become indexes, counts, or durations.
- Validate array entries, permitted duplicates, and minimum/maximum lengths.
- Validate exact expression grammar and allowed bindings; an object-shaped
  expression is not automatically valid.
- Use own-property checks for dictionaries and bindings. Restrict dangerous
  property-path segments where traversal or mutation is possible.
- Reject non-JSON application values, cycles, and unsupported object types at
  the direct JavaScript/API boundary rather than relying on serialization to
  erase them.
- Do not automatically coerce strings into numbers or remove unknown fields
  in an authoring request.

Explicit literal-data fields, such as an object variable's supported literal
value, may allow bounded JSON data. Their keys are data, not action names.
Do not recursively interpret or strip those keys as if they were schema
fields, and do not execute them as actions.

### 9.3 Limits and schema completeness

The API/model implementation must define limits for command bytes, batch
count, strings, arrays, expression/action nesting, and validation work. Check
outer limits before expensive cloning or recursive traversal.

Concrete thresholds and their checked-in corpus measurements are recorded in
[limits and inputs](./validation-preparation/limits-and-inputs.md). Exact action
fields, ranges, contexts, and reference rules are in the
[action catalog](./validation-preparation/action-contracts.md). These documents
complete the original follow-up specification task; implementation must cover
every listed branch without unvalidated placeholders.

Historical reading still uses bounded, safe parsing. Loading a supported old
project does not mean executing arbitrary payload code or disabling all
existing structural validation.

## 10. Entry-point contract

| Entry point                                                    | Required behavior                                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| New project from template                                      | Validate the complete initial state under M; emit an envelope-2 `project.create`, even if bootstrap writes bypass the usual command API |
| UI commands, autosave, scene draft flush                       | Current strict submission path before local draft insertion                                                                             |
| Future API                                                     | Accept authoring requests, not raw history rows; assign current versions internally and strictly validate                               |
| `projectService.submitCommand` and direct session submission   | Same current-authoring gate; no alternate unversioned path                                                                              |
| `submitCommands` and resource-package command plans            | Whole-batch preflight; preserve sequential dependencies and errors                                                                      |
| `submitEvent`                                                  | No public bypass; either route authoring through the same gate or restrict to application-internal validated record persistence         |
| Raw store `insertDraft` / `insertDrafts` / bootstrap insertion | Internal storage operations; application call sites must have passed the applicable authoring or historical-ingestion gate              |
| Open existing project                                          | Preserve existing legacy loading/recovery behavior; validate envelope-2 records by their recorded versions                              |
| Full replay after cache loss                                   | Apply mixed versions in their existing order, retaining the model version through every mapping step                                    |
| Main, scene, overview, and text-stat loading                   | Decode before inspecting domain payload fields; respect checkpoint compatibility                                                        |
| Existing local draft reload                                    | Preserve legacy draft recovery; do not restamp old drafts or skip invalid envelope-2 drafts                                             |
| Exact retry/retransmission of a persisted record               | Preserve id, envelope version, wrapper, and payload; do not turn a replay into a new authoring operation                                |
| Copy/paste, duplicate, or restore content into current state   | New authoring; validate all newly introduced content under M                                                                            |
| Current resource package import                                | Keep the package's own schema contract; generated model commands are strict envelope 2                                                  |
| Whole-project folder/database import or backup restore         | Supported historical-open path with explicit compatibility semantics; no claim that imported legacy actions were strictly authored      |
| Newly submitted full-state payload                             | Strict complete state validation; cannot masquerade as historical project import                                                        |
| Playable export/preview                                        | Consume decoded domain state; never emit the persistence wrapper into engine actions                                                    |
| Project backup/export carrying history                         | Preserve recorded versions and wrappers exactly so restoration selects the same contracts                                               |
| Any existing sync receive path                                 | Decode and validate before accepting/publishing new project history; do not rely solely on an after-commit callback                     |
| Sync `applyCommittedBatch` and `applySubmitResult`             | Gate both incoming history pages/broadcasts and draft acknowledgment promotion before accepted-history mutation or draft deletion       |

Bootstrap and scene readers currently access `payload.state` directly in
several places. Under envelope 2 that access is valid only after decoding.
Updating just the normal command-to-event mapper is insufficient.

Template files remain domain project data. Do not add a command `mv` inside
their state or manually version every template action. Audit and fix their
contents to satisfy the strict schema; at project creation the app validates
the resulting complete state and assigns the current version to the generated
`project.create` command. Validate shipped templates in automated checks
before release as well as at creation time. Updating a shipped template does
not modify projects previously created from it.

When sync is configured, the app-owned store ingestion adapter must cover both
`applyCommittedBatch` and `applySubmitResult`. An acknowledgment can create a
committed record from a draft and delete that draft without passing through
the incoming-event callback. Validate recorded identity, envelope, and any
change to authoritative ordering before accepting the promotion. Preserve the
draft's original version and payload; promotion is not new authoring. Resolve
missing history before accepting a changed ordering, and preserve recoverable
data when validation fails. Test acknowledgment-before-broadcast and duplicate
delivery as well as ordinary incoming batches.

Incoming live unversioned writes must not be treated as historical merely
because a peer labels them old. Loading an existing history and receiving a
new authoring operation are different application operations. A resync or
initial-history import must have a defined record-identity/history contract.
If that distinction cannot be established, retain the data for reconciliation
without silently accepting it as a new legacy write.

A whole-project import is necessarily an explicit compatibility boundary. The
format/version label alone cannot prove when arbitrary external data was
created. This proposal guarantees strict new authoring, not that importing an
old database retroactively makes all its content strict.

## 11. Encoding, decoding, and persistence integration

Provide one app-owned codec at the existing collab/repository boundary.

Encoding requirements:

- Accept a canonical current-version command, not an already wrapped payload.
- Build exactly one wrapper, encode `modelSchemaVersion` as `mv`, and set
  envelope version 2.
- Keep model version inside stored payload; do not rely on arbitrary `meta`.
- Preserve command identity across validation, insertion, retries, and sync.

Decoding requirements:

- Inspect the original persisted version before reading command-specific
  fields. Apply exact envelope-2 checks and only the existing historical
  legacy-read normalization described in section 11.1.
- Return a canonical command with unwrapped domain payload and explicit model
  version for envelope 2.
- Preserve the distinction between omitted legacy version and invalid version.
- Decode exactly once at each raw-record boundary. Downstream domain code must
  not contain ad hoc `payload.commandPayload ?? payload` fallbacks.
- Do not mutate the raw stored record while constructing a decoded command.

Audit normalization allowlists and mappers so they preserve the in-memory model
version. In particular, `normalizeCommandEnvelope` currently filters fields.
Historical loader reconstruction, bootstrap helpers, and scene projections
must agree on whether their input is a raw record or a decoded command.

The wrapper participates in Insieme's existing payload serialization and
idempotency comparison. Tests must prove that identical wrapped retries
deduplicate and that the same id with different payload/version content is
not silently accepted as an identical event.

Creator's comparison must also preserve domain payload property enumeration
order: indexed spritesheet clips use the order of `atlas.frames`, while
Insieme's generic comparison sorts keys. The
[acceptance contract](./validation-preparation/replay-and-acceptance.md)
defines the additional order-preserving check before raw-store mutation and
the matching history/checkpoint digest rule. Exact retries retain the original
payload; reordered same-id payloads involving envelope 2 are rejected rather
than normalized. Retain existing legacy-only duplicate/recovery behavior;
the new identity check must not introduce a legacy load failure.

No dependency patch is required to put the wrapper in the existing generic
payload. If a missing integration hook is discovered, fix that behavior in
the owning upstream repository and consume a normal release; do not patch
dependencies or add an unsynchronized side table.

### 11.1 Preserve raw versions and existing legacy reads

The installed Insieme SQLite/LibSQL and IndexedDB readers currently parse
event schema versions with `parseInt`. Raw `1.5` or `"1junk"` can therefore
become envelope `1` before the application codec sees them. A strict codec
above that conversion cannot recover the original invalid value.

The owning storage library must expose original version values through a
supported raw-preserving read path across the adapters used by the client.
Do not replace existing legacy reads with unconditional rejection: where the
previous reader interprets a persisted historical value as envelope 1, retain
that behavior and its existing payload validation without rewriting the row.
For example, historical `1.5` / `"1junk"` retain the existing legacy read
interpretation; their payloads do not gain a strict-validation guarantee.

New authoring never accepts caller-selected storage versions. Envelope-2
decoding and newly authored persisted writes require exact positive safe integers;
driver-specific integer representations need lossless conversion. Raw `2.9`
or `"2junk"` must not become envelope 2. Unknown future versions and invalid
`mv` still fail explicitly. Neither a failed strict decode nor the shape of
its payload can select legacy mode. The historical exception belongs only to
the already defined historical-open/import/retry operation, not arbitrary
API requests or unseen live writes.

Prefer an upstream Insieme fix consumed through a normal published version.
An app-owned raw-row guard is sufficient only where a supported integration
point demonstrably sees every original value before conversion. The current
web adapter has no such raw-row hook. Do not patch dependencies or add parallel
IndexedDB reads to bypass the owning storage abstraction. Verify malformed raw
SQLite and IndexedDB rows, not just already parsed JavaScript events: test
unchanged legacy interpretation alongside exact strict/future-version errors.
No SQL schema migration is needed. Blanket rejection of previously tolerated
legacy representations is separate compatibility-hardening work.

## 12. Full reloads and checkpoints

For complete histories, checkpoints are caches, not evidence that the history
was validated under this proposal. Existing checkpoint-backed recovery projects
are the source-preservation exception described below.

The initial rollout uses new validation-policy view names in the existing
checkpoint facilities and rebuilds affected disposable views. It does not
delete or overwrite original recovery-source checkpoints or command rows.
Main, scene, overview, and text-stat caches must be assessed together.

New checkpoint compatibility must include:

- The applicable projection/validation policy revision.
- The relevant source-history position and existing history-stat checks.
- A supported set of envelope/model contracts for the represented history.

These may use existing view-version and checkpoint-metadata facilities; they
must not require new SQLite columns. Do not stamp a mixed-state checkpoint
with the latest model version and interpret that as full strict-state proof.

On cache load, run compatible shape/invariant checks. If an applicable source
or new-policy cache check fails, rebuild using the existing legacy source and
recovery behavior plus recorded strict suffix validation. A new cache check
must not introduce a legacy project-open failure. A cache cannot replace
new-command validation or bypass envelope-2/future-version error detection.

Per-command strict checks occur while replaying versioned events. The final
mixed state receives compatible full-state validation. Full strict state
validation is appropriate for a newly supplied project state, but not for an
arbitrary mixed checkpoint merely because its last event was versioned.

Batch boundaries, pagination, committed/draft separation, and lazy scene
loading must not change the replay result. Missing referenced data in a
partial projection must cause dependency loading, not a false validation
failure.

The existing Tauri missing-bootstrap recovery path can rely on original main
and scene checkpoint rows as source data. Retain those rows in place and use
their established legacy history cutoff, including the supported no-metadata
checkpoint variant. Reconstruct that legacy baseline, then validate
new suffix commands by their recorded versions. Here, materialization means
the state produced by the existing legacy reader, including its supported
recovery behavior; it does not require a new proof that every original source
is present. Do not create a replacement
bootstrap or sanitize the baseline. New disposable caches use distinct view
names, so resetting them cannot erase the retained source rows.

If original scene data is absent and the previous reader still opened the
project, preserve that same loading and preview/export behavior. This feature
must not introduce `recovery_data_incomplete` as a blocking error for that
legacy case. The returned state is not proof that original story data was
complete; retain available source rows and do not rewrite history or replace
them with a cleaned bootstrap. New completeness checks and their recovery UX
belong to a separate proposal. Validate subsequent edits against the resolved
legacy-compatible state; a new edit's validation error must not disable
opening or using the rest of the recovered project.
The [replay and recovery contract](./validation-preparation/replay-and-acceptance.md)
defines recognition, prefix verification, import/backup handling, and limits of
this existing recovery case.

## 13. Historical data and sanitization

Opening an existing project must not alter stored legacy payloads or delete
unknown historical fields as a side effect of this feature.

Historical commands continue to receive existing validation; "legacy" does
not mean "skip validation." Envelope 2 carries a strict contract and never
uses an object-only fallback for its action contents.

When the user replaces a legacy action with a valid current action, that
ordinary command can remove obsolete fields from the current result while
the old row remains in history. That is a scoped authoring operation, not a
bulk migration.

Automatic cleanup of old fields is deferred. Any later cleanup proposal must
identify fields proven unused, preserve story behavior, and specify whether
it is an explicit command, a read-only display conversion, or a migration.
It must not be smuggled into this feature's history decoder.

The first strict schema may explicitly accept multiple documented
representations where the runtime supports them. Such compatibility must be
expressed and tested in the model schema, not implemented as arbitrary
client-side coercion.

## 14. Errors, failures, and older clients

Errors must identify their stage and actionable location. Proposed code
categories are:

| Category                                    | Example information                                     |
| ------------------------------------------- | ------------------------------------------------------- |
| `unsupported_command_envelope_version`      | Event id, received envelope version, supported versions |
| `invalid_command_envelope`                  | Invalid wrapper field and stored path                   |
| `unsupported_model_schema_version`          | Event id, received model version, supported versions    |
| `payload_validation_failed`                 | Command type, canonical payload path, violated rule     |
| `precondition_validation_failed`            | Missing/wrong-kind reference or invalid target          |
| Existing invariant/state failure categories | Affected project structure                              |

Model payload paths use canonical paths such as
`payload.data.dialogue.content`. The codec can additionally report a raw stored
path; consumers should not have to understand `commandPayload` to repair an
ordinary authoring request. Replay errors also include event identity and
batch index where available.

New input failures produce visible feedback and no accepted write. API errors
must be structured; UI toasts use stable localized messages rather than
unfiltered exception text. Diagnostics must not dump whole private projects
unnecessarily.

For historical load failures:

- Preserve the original event/draft.
- Preserve the existing reader's legacy normalization, skip/recovery rules,
  and resulting availability; do not add new legacy load failures.
- Treat malformed envelope-2 records and unsupported versions as explicit
  compatibility/corruption failures.
- Do not publish a partial project as fully loaded and editable after one of
  those strict/future-version failures. This does not replace existing legacy
  recovery with a stricter completeness gate.
- Prevent the existing invalid-draft skip loop from swallowing strict errors.
- Audit obsolete-scene-event and duplicate-resource/file replay recovery too;
  their skip paths cannot hide strict-record validation failures.
- Retain the existing legacy draft-recovery policy only for historical legacy
  records; it must not become an escape hatch for strict versioned records.

The new client must check both envelope compatibility and model compatibility.
Current compatibility code must not overwrite a remote record's version with
the locally supported version before checking it.

An older binary may not understand envelope 2, and existing released loaders
can skip non-bootstrap invalid drafts. Increasing the envelope version alone
does not prove safe downgrade behavior. Reader-first rollout and tests against
supported prior clients are required before enabling writes. Opening upgraded
history in an arbitrary old binary is not a supported editing guarantee.
This feature must not claim it can retroactively change already released
readers or protect against direct external database edits.

If configured sync writes raw records before delivering the current
`onCommittedCommand` callback, that callback is too late to serve as the
authoring/acceptance gate. Move validation to the application ingestion
boundary or a supported upstream hook. Invalid received bytes may be retained
for diagnostics/recovery, but must not be presented as accepted current
project history.

## 15. Worked example

The following values illustrate decoded payload bytes, not a change to table
definitions. Versions use the illustrative first strict model `15`.

### 15.1 Existing history

Project One already contains an envelope-1 bootstrap and this envelope-1
`line.update_actions` event:

```json
{
  "lineId": "line-a",
  "data": {
    "dialogue": {
      "content": "Hello"
    },
    "unrecognizedLegacyAction": {
      "oldValue": true
    }
  }
}
```

It is replayed with existing validation. This example deliberately includes
content that the current object-only action check accepts; it is not a claim
that the strict model will support that action or that it is safe to delete.

### 15.2 A new edit in the same project

The user edits Line B. The stored row has `schema_version = 2` and payload:

```json
{
  "mv": 15,
  "commandPayload": {
    "lineId": "line-b",
    "data": {
      "dialogue": {
        "content": [{ "text": "Hello again" }]
      }
    }
  }
}
```

The new dialogue action and its preconditions must pass strict validation.
Line A remains untouched. The project is now a mixed history, not a migrated
version-15 project.

### 15.3 Full reload

```text
Envelope-1 bootstrap and old events
  -> compatible replay
Envelope-2 edit with model version 15
  -> strict command/precondition/effective-result checks
Final mixed project
  -> compatible state/invariant checks
```

A checkpoint can accelerate this computation. Deleting it and replaying the
same source records must produce an equivalent state without modifying rows.

### 15.4 Invalid new input

An API request with `data.dialogue = 42` fails strict validation and creates no
row. Omitting a version cannot change this; the app supplies the current model
version for every new request. Supplying envelope 1 is not an authoring API
feature.

A stored envelope-2 record with `mv` missing also fails. It is
not reclassified as historical.

### 15.5 A future model release

After model version 16 is released, new writes can use envelope 2 with
`mv = 16`; envelope 3 is unnecessary unless the wrapper format
itself changes. Replaying a version-15 command still uses its supported
contract. A client supporting only version 15 refuses version 16 explicitly.

Future model evolution must preserve accepted earlier-version replay
semantics or define a separate explicit compatibility change. Never blindly
apply the newest strict rules to every recorded version.

## 16. Implementation ownership and file map

Paths identify current integration points, not a requirement to create a
generic framework or duplicate validators.

| Area                              | Current files / responsibility                                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model                             | `../routevn-creator-model/src/model.js`, `helpers.js`, `errors.js`, `index.js`; validators, version dispatch, preconditions, reducers, result scope                                                                                     |
| Model compatibility               | `../routevn-creator-model/docs/schema-compatibility.md`, fixtures and generator; retain unversioned fixtures and add strict-version fixtures                                                                                            |
| Client envelope constants         | [projectCompatibility.js](../src/internal/projectCompatibility.js), [commands.js](../src/internal/project/commands.js)                                                                                                                  |
| Shared codec                      | [commandEnvelope.js](../src/deps/services/shared/collab/commandEnvelope.js), [mappers.js](../src/deps/services/shared/collab/mappers.js)                                                                                                |
| Model invocation                  | [creatorModelAdapter.js](../src/internal/creatorModelAdapter.js), [projectRepository.js](../src/deps/services/shared/projectRepository.js)                                                                                              |
| Authoring command composition     | [commandApi/shared.js](../src/deps/services/shared/commandApi/shared.js) and family-specific command APIs                                                                                                                               |
| Direct command/session submission | [projectCollabCore.js](../src/deps/services/shared/projectCollabCore.js), [createProjectCollabService.js](../src/deps/services/shared/collab/createProjectCollabService.js)                                                             |
| Native local sessions/bootstrap   | `src/deps/services/{tauri,android,ios}/projectServiceAdapters.js`; cover `submitCommand`, `submitCommands`, `submitEvent`, and direct bootstrap writes                                                                                  |
| Web bootstrap/storage adapter     | [webRepositoryAdapter.js](../src/deps/clients/web/webRepositoryAdapter.js)                                                                                                                                                              |
| Historical loading                | [clientStoreHistory.js](../src/deps/services/shared/collab/clientStoreHistory.js); both normal and snapshot-archive draft modes                                                                                                         |
| Projection/cache integration      | [projectRepositoryService.js](../src/deps/services/shared/projectRepositoryService.js), [projectRepositoryRuntime.js](../src/deps/services/shared/projectRepositoryRuntime.js), `projectRepositoryViews/*`                              |
| Compatibility checks              | [compatibility.js](../src/deps/services/shared/collab/compatibility.js), projection-gap handling and platform callbacks                                                                                                                 |
| Import                            | [resourcePackageImportService.js](../src/deps/services/shared/resourcePackageImportService.js), [resources/importPackage.js](../src/deps/services/shared/commandApi/resources/importPackage.js), platform whole-project import adapters |
| Export/backup                     | [projectExportService.js](../src/deps/services/shared/projectExportService.js), asset package and platform project-folder export paths                                                                                                  |
| Storage assertions                | [insiemeStorageScenario.js](../tests/puty/insiemeStorageScenario.js), `tests/puty/`; add real native draft round trips, not only sync-store rows                                                                                        |

Engine action schemas and the client action emitters are reference material
for the field catalog, not an invitation to import runtime-specific behavior
into persistence adapters. Model rules must be released from the model repo
and consumed through a normal dependency version. The literal object-write
contract additionally needs the owning engine release and updated exported player
artifacts; the [rollout](./validation-preparation/upstream-and-rollout.md#31-engine-implementation-pr)
specifies that dependency without changing unmarked legacy runtime behavior.

## 17. Implementation sequence

### Phase 1: contract inventory and fixtures

- Capture existing schema/replay behavior before changing validation.
- Complete the action/context/field matrix and measured limit proposal from
  section 9, including all currently shipped client outputs and templates.
- Freeze representative legacy histories, including draft-only projects and
  known free-form action fixtures.
- Document strict affected-result scope for each mutating command family.
- Confirm raw-record versus decoded-command ownership at every mapped path.
- Inventory adapter-only domain extensions, including character spritesheets,
  and specify their model-owned contracts without changing legacy replay.
- Specify historical dependency reconstruction and reference-impact rules for
  ownership moves, deletion, and variable type/permission edits.
- Name the shared acceptance owner and each platform's coordination/recovery
  mechanism; cover incoming batches and acknowledgment promotion separately.
- Define explicit validation-version metadata for new compatibility fixtures
  and identify the required Insieme parser release.

Exit: storage and validation fixtures exist; all supported authored branches
have a concrete contract; replay and acceptance integration decisions above
are documented and reviewable; no strict-write flag is enabled.

### Phase 1b: executable old-project baseline

Complete T0 in the [old-project test plan](./validation-preparation/legacy-project-test-plan.md)
before changing validator behavior. Freeze old-writer project packs and expected
previous-reader results, then exercise them through real model, client SQLite,
and browser IndexedDB paths. Prove the runner detects version loss, data changes,
and recovery-source loss. Existing documentary scenarios are starting inputs,
not evidence that this baseline suite is complete.

Exit: old-reader A/A and pre-strict candidate parity pass for the required
corpus/variants; fixture/source identities are pinned and cannot be regenerated
from the candidate. Strict assertions follow during implementation.

### Phase 2: creator-model support

- Add explicit strict model-version dispatch to the existing pure entry
  points, preserving omitted-version compatibility.
- Implement strict action, interaction, reference, and effective-result checks.
- Bring shipped adapter-only strict domain behavior into the model so every
  strict command and referenced domain shape reaches the same authority.
- Keep compatible whole-state checks distinct from explicit full strict-state
  checks.
- Bump the model minor/schema version, add its compatibility archive, and
  update model documentation.
- Release through the normal upstream package workflow.

Exit: old fixtures retain behavior, strict cases pass/fail as specified, and
mixed-state command sequences are covered.

### Phase 2b: engine literal-value support

- Implement the catalog's explicit `valueMode: "literal"` object-set contract
  in the engine before recursive template resolution.
- Preserve unmarked historical operations, mixed execution, callbacks, and
  save/load/rollback behavior; release through the owning engine repository.
- Carry the field through client projection without exposing storage wrappers.
  Verify Creator preview and browser/native exported players all use the release.

Exit: literal values stay literal end to end, legacy interpolation is unchanged,
and supported R/W player artifacts recognize the marker.

### Phase 3: client readers and codec

- Implement envelope-2 encode/decode and in-memory version preservation.
- Wire decoding before all domain inspections, including bootstrap and lazy
  scene paths.
- Add version-aware replay and explicit invalid envelope-2/future-version
  handling while retaining existing legacy normalization and recovery.
- Rebuild affected old caches using updated existing view-version contracts.
- Verify the installed Insieme adapters round-trip the wrapper unchanged.
- Consume a raw-preserving storage read path from the owning upstream release;
  prove legacy reads remain compatible and strict versions are checked before
  lossy conversion.
- Make partitioned state-aware replay use dependencies at the command's
  historical position; verify equivalence with chronological replay.

Exit: supported readers handle envelope 1, envelope 2, and mixed histories;
they do not silently skip strict-version failures. No existing row is changed.
An old project opening successfully in the previous reader must still open
with the same recovered state and preview/export availability. Do not ship a
new read-only restriction or repair prerequisite because of legacy data.

### Phase 4: authoring gate and platform coverage

- Route UI, API-facing, direct-session, raw-event, and bootstrap authoring
  through the current strict contract.
- Attach model version internally; write envelope 2 after successful checks.
- Cover batch validation, stable retries, and local draft persistence on web,
  desktop, Android, and iOS.
- Update UI emitters/templates only where they need to produce the agreed
  valid current contract; do not silently strip unsupported model fields.
- Prevent submissions from an unloaded, incompatible, or stale projection.
- Keep persistence and authoritative accepted-state advancement under the
  shared acceptance owner, including recovery before subsequent writes.
- Gate both sync ingestion methods when configured; promotion retains the
  recorded contract and cannot bypass validation or erase a failed draft.

Exit: no application authoring path can create a new envelope-1 record or an
invalid envelope-2 command after enforcement is enabled.

### Phase 5: reader-first rollout and verification

- Ship/verify reading support before enabling envelope-2 authoring in the
  supported deployment sequence.
- Run the complete old-project/new-edit/reload matrix on actual platform
  storage adapters.
- Verify downgrade behavior against supported older releases and record the
  unsupported-old-binary limitation explicitly.
- Enable current strict authoring only after every action-bearing branch and
  authoring entry point is covered.
- Update current platform/engineering docs when behavior actually ships.

Rollback must use a reader capable of interpreting already written envelope-2
records. Do not relabel stored versioned events as legacy or rewrite payloads
to hide an unsupported reader.

## 18. Required verification matrix

| Test group              | Required cases                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrapper                 | Exact round trip; missing/extra fields; null/array payload; noninteger/string/unknown versions; envelope-1 keys that resemble a wrapper; no double wrapping             |
| Model dispatch          | Omitted historical version preserves behavior; explicit supported strict version enforces it; invalid version never falls back                                          |
| Action coverage         | Positive minimal/full variants for every action/context; unknown fields and actions; nested callback failures; invalid expressions, ranges, and bindings                |
| Direct JS input         | Non-JSON values, cycles, nonfinite numbers, unsafe binding/property paths, nesting/size limits                                                                          |
| New project             | Strict complete template/bootstrap; wrapper present in direct initial writes; invalid initial state never activated                                                     |
| Mixed project           | Legacy Line A survives a strict edit to Line B; rename/move unaffected legacy content; strict create/copy does not inherit a free-form allowance                        |
| Update semantics        | Shallow action merge, replace, preserved dialogue, explicit clears/deletions, invalid retained content, interactions with known retained sibling actions                |
| References              | Missing and wrong-type targets, section/scene ownership, variable constraints, resource deletion consequences, unloaded dependencies                                    |
| Batches                 | Later command depends on earlier one; invalid command N produces zero new rows; invalid intermediate content cannot be hidden by later deletion                         |
| Persistence             | SQLite `local_drafts` and `committed_events`, all native adapters, IndexedDB; same payload/model version before close and after reopen                                  |
| Identity                | Exact retry deduplicates; altered version/payload with the same id is not silently treated as the original; existing legacy retries remain unchanged                    |
| Historical replay       | Legacy-only, strict-only, mixed, draft-only bootstrap, committed plus drafts, snapshot-archive mode, varied replay batch boundaries                                     |
| Failure recovery        | Existing legacy skip/recovery and missing-scene behavior unchanged; strict/future-version failures preserve rows and cannot publish a partially replayed editable state |
| Caches                  | Cold rebuild equals warm checkpoint state; old cache invalidation; scene/overview/stat reload; unsupported versions cannot hide behind a cache                          |
| Imports/exports         | Strict resource import; historical project restore; backup retains wrapper/version; engine export receives domain actions only                                          |
| Version spoofing        | New request omits version or supplies legacy version; raw `submitEvent` attempt; incoming live unversioned event cannot select history mode                             |
| Platform concurrency    | Revalidate within the write serialization boundary; stale tab/project changes cannot publish commands checked against the wrong state                                   |
| Compatibility           | Existing archives unchanged; new-version archives; future-version explicit error; supported old-reader behavior verified                                                |
| Historical dependencies | Create/use/clear/delete a resource; later type/ownership changes; lazy replay equals chronological replay with the same history prefix                                  |
| Adapter extensions      | Strict spritesheet commands reach model dispatch; valid sprite references resolve; full new state cannot hide fields through projection/normalization                   |
| Dependency mutations    | Cross-scene section move with inbound transition; variable type/permission change; newly invalid reference rejected; unrelated legacy failure tolerated                 |
| Raw storage versions    | Existing historical legacy representations retain read behavior; malformed strict versions reject before conversion; new callers cannot select legacy mode              |
| Acceptance ordering     | Concurrent creates with the same id; next command sees the last accepted state; partial/unknown writes reconciled before another submission                             |
| Sync promotion          | Acknowledgment before broadcast; duplicate delivery; malformed/unsupported draft; changed ordering with missing history; original wrapper/identity preserved            |

Model checks must include `bun run test:compat` and the model API and targeted
command/state tests. Client checks use appropriate smoke, integration,
convergence, collab-adapter, and Puty tests. Puty remains the preferred home for
SQLite row assertions; adapt its helper as needed to verify the actual draft
and committed storage contracts.

Run focused UI/VT coverage when implementation changes a user-visible emitter
or failure flow. Routine implementation verification should not invoke
`build:web` unless its repository-documented conditions apply.

### 18.1 Compatibility fixtures must exercise version dispatch

The current compatibility runner invokes payload/state validators without a
model version. Adding a new `schema-M` directory alone would still exercise
legacy validation. Archive `schemaVersion` identifies the fixture archive;
it is not a replacement for an explicit command validation version.

New strict payload/state fixtures must carry explicit `modelSchemaVersion`
metadata which the runner passes to the corresponding model API. Stream
commands record their versions individually, including deliberately unversioned
legacy commands in mixed streams. Preserve old fixture files and their omitted
versions. Do not infer strictness for an entire state or stream from its folder
name, final event, or archive version.

Add a dispatch regression where legacy validation accepts a known historical
shape but explicit strict validation rejects it. Compare sequential
`processCommand` with `replayCommands` for the same mixed history and multiple
batch boundaries. These checks must fail if the harness drops command versions.

## 19. Acceptance criteria

The feature is ready only when:

1. Every newly authored command is strictly validated and persisted as envelope
   2 with an explicit supported model version inside its payload wrapper.
2. Every legacy project that opens in the previous reader still opens with
   its existing recovered state and availability. Cover legacy normalization,
   draft skip/recovery, missing scene sources, imports/restores, and reloads
   after strict edits; preserve original stored bytes. Any regression blocks
   release rather than requiring the user to repair or migrate the project.
3. No SQL table/column migration or automatic project-history rewrite occurs.
4. Invalid new input cannot enter through direct sessions, raw events,
   templates, imports, or other alternate authoring paths.
5. Malformed envelope-2 records and unsupported future versions never invoke legacy fallback
   or disappear through the draft-skip recovery loop.
6. Command preconditions and effective results are checked without invalidating
   unrelated historical action content.
7. Full replay, draft reload, and checkpoint-assisted loading agree on state
   under the existing legacy recovery semantics and preserve model versions
   across every platform adapter; no new legacy completeness gate is added.
8. Action catalogs, concrete limits, and regression fixtures are complete;
   strict validation contains no free-form action placeholders.
9. Historical sanitization, old-binary limitations, and nontransactional I/O
   behavior are not misrepresented as solved by adding a version wrapper.
10. Adapter-only domain branches, historical dependency state, raw storage
    parsing, acceptance ordering, and acknowledgment promotion satisfy their
    reviewed contracts; compatibility tests demonstrably exercise strict dispatch.

## 20. Related documents

- [Product principles](./product.md)
- [Engineering boundaries](./engineering.md)
- [Model compatibility and upgrades](./platform/10-model-compatibility-and-upgrades.md)
- [Storage](./platform/05-storage.md)
- [Partitioning and write contract](./platform/09-partitioning-and-write-contract.md)
- [Import packages](./import-packages.md)
- [Project content patches](./platform/14-project-content-patches.md)

This proposal supersedes earlier discussion of per-command SQLite columns,
automatic whole-project sanitization, and replacement history generations for
this feature. Existing shipped behavior and platform documents remain current
until implementation changes land; this document is the proposed contract.

## 21. Review outcome and implementation readiness

Three independent subagent reviews covered compatibility/storage, entry points,
and model semantics. The primary review checked their source evidence and the
compatibility test harness. The chosen envelope-2 `{ mv, commandPayload }`
format remains suitable; no finding requires a SQLite migration or historical
payload rewrite.

The following requirements were made explicit after review:

| Finding                                                         | Evidence in current code                                                                                                                                               | Required resolution                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Historical actions can be replayed against today's resources    | [Scene replay composes latest main state](../src/deps/services/shared/projectRepositoryViews/sceneStateView.js)                                                        | Section 8.6: dependencies at the preceding history position            |
| Client spritesheet branches bypass and hide data from the model | [Creator model adapter](../src/internal/creatorModelAdapter.js)                                                                                                        | Section 6.1: upstream strict domain support before enforcement         |
| Ownership moves can break unchanged action targets              | `../routevn-creator-model/src/model.js`, `section.move`; [transition emitter](../src/components/commandLineSectionTransition/commandLineSectionTransition.handlers.js) | Section 8.3: before/after reference-impact checks                      |
| Insertion queues alone do not advance authoritative state       | [Command submission](../src/deps/services/shared/commandApi/shared.js), [direct sessions](../src/deps/services/shared/projectCollabCore.js)                            | Section 8.5: one acceptance owner through publication and recovery     |
| Acknowledgments also create committed history and delete drafts | Installed Insieme `sync-client.js` and client stores, `applySubmitResult`                                                                                              | Section 10: gate promotion as well as incoming batches                 |
| Storage readers truncate malformed envelope versions            | Installed Insieme `libsql-driver.js`, SQLite/LibSQL and IndexedDB row readers                                                                                          | Section 11.1: raw values, preserved legacy reads, exact strict parsing |
| Current archive tests omit explicit model versions              | [Model compatibility runner](../../routevn-creator-model/tests/compatibility-fixtures.test.js)                                                                         | Section 18.1: explicit fixture versions and dispatch regression        |

Review probes used temporary in-memory state/storage and confirmed malformed
version coercion, client-only spritesheet acceptance, and a section move that
leaves an unchanged transition pointing to the former scene. These demonstrate
current integration behavior; they do not test an implemented strict feature.

The subsequent [preparation package](./validation-preparation/README.md)
provides the Phase 1 action/field catalog, measured limits, captured fixtures,
adapter contracts, platform acceptance/replay decisions, and upstream release
sequence. It additionally covers same-identity moves whose current emitter
recreates lines and the existing checkpoint-backed recovery exception.
Implementation and release of strict enforcement remain gated on the actual
model/client changes and verification matrix. Preparation changed documentation
and fixture data only; it does not mark the feature implemented or release-ready.
