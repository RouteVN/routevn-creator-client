# Model Compatibility And Upgrades

Date baseline: April 9, 2026.

This document describes how RouteVN Creator currently behaves when
`@routevn/creator-model` changes, what is and is not backward compatible today,
and the issues that need to be resolved if model updates should be smooth for
single-user projects and collaboration sessions.

## Desired Contract

Single-user:

1. An older client may fail to open a project created by a newer client.
2. A newer client should be able to open all projects created by older clients.

Collaboration:

1. Different client versions may connect to the same project.
2. Older clients should not silently corrupt the project.
3. Ideally, older clients keep working.
4. If they cannot keep working safely, they should degrade explicitly instead of
   editing against stale state.

## Current Verdict

### Single-user

1. Older client opening newer project:
   effectively not supported.
2. Newer client opening older project:
   partially supported only when the stored project format version still
   matches and the latest model can still replay the older command/state data.

### Collaboration

1. Mixed client versions:
   partially tolerated, but not fully compatible.
2. Older client behavior after newer commands appear:
   degraded and potentially stale.

## Current Mechanism

Project state is not loaded from a trusted persisted snapshot. The client
rebuilds repository state by replaying stored events through the current
`@routevn/creator-model` reducer and validators.

Important implementation points:

1. Repository state is validated with the current creator model:
   [projectRepository.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/projectRepository.js#L55)
2. Repository events are replayed by converting them back into commands and
   applying the current model reducer:
   [projectRepository.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/projectRepository.js#L527)
3. The creator model adapter directly calls `processCommand()` from the current
   installed `@routevn/creator-model` package:
   [creatorModelAdapter.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/internal/creatorModelAdapter.js#L75)

This means compatibility depends on whether old state and old commands still
validate under the new model.

## Issue 1: Version Numbers Are Split Across Multiple Concepts

Current version-like fields:

1. Project format version (`creatorVersion` in project app-store metadata)
2. Command envelope `schemaVersion`
3. Model package version
4. Model package `SCHEMA_VERSION`

Current values in this repo:

1. Project format version `creatorVersion = 1` when new projects are created:
   [webRepositoryAdapter.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/clients/web/webRepositoryAdapter.js#L94)
   [projectServiceAdapters.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/tauri/projectServiceAdapters.js#L254)
2. Command envelope `schemaVersion = 1`:
   [commands.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/internal/project/commands.js#L1)
3. Installed creator model package version `1.1.12`:
   [package.json](/home/tk/Code/yuusoft-org/routevn-creator-client/package.json#L22)
4. Creator model `SCHEMA_VERSION = 1`:
   [model.js](/home/tk/Code/yuusoft-org/routevn-creator-model/src/model.js#L148)

Problem:

1. There is no single authoritative compatibility version because these values
   answer different compatibility questions.
2. The project format version, command envelope version, and model schema
   version must remain intentionally separate.
3. It is still easy to confuse them unless the distinction is documented
   explicitly.

Impact:

1. Project-open safety is governed by project format version.
2. Mixed-version collab safety is governed first by command envelope version.
3. Replay safety still depends on current model behavior and backward-compatible
   validation.

## Issue 2: Project Open Is Intentionally Coupled To App Major / Project Format

The repository service currently requires the stored `creatorVersion` to equal
the runtime supported project format version.

References:

1. Current project format gate:
   [projectRepositoryService.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/projectRepositoryService.js#L13)
2. Equality check:
   [projectRepositoryService.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/projectRepositoryService.js#L186)

Status update:

1. This is intentionally derived from app semver major.
2. A normal app `2.x` release is therefore also a project format break and will
   reject projects stamped with `creatorVersion = 1`.

Remaining limitation:

1. Cross-project-format opening is unsupported by design.
2. Migration between project format generations must happen outside the app.

Impact:

1. Project format generations remain a hard compatibility boundary.
2. One-way compatibility inside the same project format still depends on model
   replay compatibility.

## Issue 3: Replay Uses The Current Model, So Validation Tightening Can Break Old Projects

The current system replays old commands with the latest installed model.

Problem:

1. Tightening payload validation can invalidate older events.
2. Tightening state validation can invalidate older project snapshots.
3. Tightening invariants can make old event histories unreplayable.

This is not theoretical. The model repo intentionally prefers strict failure:

1. Unknown fields must be rejected:
   [GUIDELINES.md](/home/tk/Code/yuusoft-org/routevn-creator-model/GUIDELINES.md#L35)
2. Compatibility shims are discouraged:
   [GUIDELINES.md](/home/tk/Code/yuusoft-org/routevn-creator-model/GUIDELINES.md#L43)

There is already a mixed pattern in the model repo:

1. One legacy shape is accepted:
   missing `controls`
   [model.js](/home/tk/Code/yuusoft-org/routevn-creator-model/src/model.js#L42)
   [model-api.test.js](/home/tk/Code/yuusoft-org/routevn-creator-model/tests/model-api.test.js#L762)
2. Another legacy shape is rejected:
   old layout style overrides
   [model-api.test.js](/home/tk/Code/yuusoft-org/routevn-creator-model/tests/model-api.test.js#L1769)

Impact:

1. Newer client opening older projects is only safe if every old persisted
   command and state shape still passes current validation.
2. Without a migration strategy, replay compatibility is accidental.

## Issue 4: There Is No General Migration Or Upcaster Layer

There is no formal API that says:

1. detect project format
2. migrate old project state
3. upcast old commands before replay

Current behavior is ad hoc:

1. small compatibility normalizations may be embedded inside the model
2. everything else fails during validation or replay

Problem:

1. The model package has no migration public surface.
2. The project repo has no explicit pre-replay migration phase.
3. The system cannot reliably guarantee one-way compatibility across model
   evolution.

Impact:

1. Compatibility work scales poorly.
2. Each schema change becomes a manual judgment call.

## Issue 5: Command Envelope Version And Model Schema Version Are Separate On Purpose

Command transport uses the app repo command envelope schema version, not the
creator model schema version.

References:

1. command envelope version source:
   [commands.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/internal/project/commands.js#L113)
2. collab mapper uses command envelope schema version:
   [mappers.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/collab/mappers.js#L26)
3. compatibility checks compare remote `schemaVersion` against the app repo
   supported schema version:
   [compatibility.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/collab/compatibility.js#L20)

Status update:

1. This is intentional now.
2. The command envelope version is a client-owned collab wire compatibility
   version and must stay stable unless the envelope itself changes.
3. The model schema version is a model-owned persisted replay compatibility
   version and should not be used directly for mixed-version collab gating.

Impact:

1. Mixed-version collab avoids unnecessary projection gaps when the wire
   envelope is still unchanged.
2. Envelope compatibility and replay compatibility remain separate concerns.
3. A command marked collab-compatible can still fail at replay/model level if
   the current model no longer accepts the older persisted shape.

## Issue 6: Mixed-Version Collaboration Uses Projection Gaps, Not True Compatibility

When a remote command is newer or invalid for the current client, the collab
runtime does not fully fail. It creates a projection gap and stops applying
future remote commands locally.

References:

1. remote compatibility evaluation:
   [compatibility.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/collab/compatibility.js#L30)
2. projection gap handling during live collaboration:
   [createProjectCollabService.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/collab/createProjectCollabService.js#L282)
3. projection gap persistence during cache rebuild:
   [projectorCache.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/collab/projectorCache.js#L122)

Problem:

1. Older clients can stop applying remote commands after the first gap.
2. Local projected state can become stale.
3. The client can still attempt local submissions using stale state.

Impact:

1. Mixed-version collaboration is not smooth.
2. Older clients are protected from blindly applying unknown commands, but they
   are not guaranteed to remain safely editable.

## Issue 7: The Platform Docs Already State A Narrower Support Policy

The platform spec currently says:

1. the current platform is the only supported format
2. older projects are not opened by the current runtime

Reference:

1. [platform/README.md](/home/tk/Code/yuusoft-org/routevn-creator-client/docs/platform/README.md#L7)

Problem:

1. This is narrower than the desired single-user compatibility goal.
2. The current written platform policy already assumes breaking upgrades are
   acceptable.

Impact:

1. The product and platform contract need a conscious policy decision.

## What Is Safe To Change Freely Today

Relatively safe:

1. purely internal reducer refactors that do not change accepted payloads,
   state shape, or replayed results
2. additive validations that only affect commands not yet persisted by shipped
   clients
3. additive fields only when old states and old commands continue to validate
   and replay

Not safe to change freely:

1. removing fields from persisted state or payloads
2. rejecting fields that older shipped clients have already written
3. changing command meaning in ways that make old replay produce a different
   required shape
4. changing invariants without migration or replay-compat coverage

## Recommended Decision Order

These decisions should be made in order.

1. Define the actual product contract.
   Do we want one-way compatibility for single-user projects?
   Do we want mixed-version collaboration to be editable, or only readable?
2. Separate the version concepts.
   Add a dedicated project format version and stop using app major equality as
   the main compatibility gate.
3. Choose the migration strategy.
   Either:
   - strict major-version breaks with explicit migrations before open
   - replay-compatible evolution with command/state upcasters
4. Define collaboration downgrade behavior.
   Recommended baseline:
   - if projection gap exists, older client becomes read-only
   - show explicit upgrade-required UI
5. Add compatibility test coverage.
   At minimum:
   - old project fixtures opened by new client
   - old command logs replayed by new model
   - mixed-version collab scenarios that verify read-only or safe degradation

## Recommended Next Step

Do not start by changing validators.

Start by writing and agreeing on a compatibility policy document that answers:

1. What is the supported single-user upgrade contract?
2. What is the supported mixed-version collaboration contract?
3. Which version field is authoritative for project-open decisions?
4. Should incompatible collaborative clients become read-only or be refused
   entirely?

Once those answers are fixed, implementation work can be planned safely.
