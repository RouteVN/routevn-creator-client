# Upstream work and rollout sequence

Status: implementation is available on the client and owner feature branches.
See [implementation status](./implementation-status.md) for changes and test evidence. Insieme 2.1.2 is now pinned. Model publication, compatibility resolution and
reader/writer delivery remain pending; no application release or deployment
has been performed.

The storage contract remains envelope 2 with `{ mv, commandPayload }` inside
the existing payload value. There is no SQLite schema migration or application
server work.

## 1. Baseline and owners

| Component      | Inspected baseline                                                                | Owner and work                                                                                                                |
| -------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Creator client | Main `4d1fe31f` (September 18 implementation refresh)                             | This repository: composition, codec, coordination, authoritative replay, projections, platform integration, UI errors         |
| Creator model  | Installed package `1.15.0`, schema `15`; original schema-14 observations retained | `../routevn-creator-model`: all strict domain schemas, version dispatch, transition/reference rules, shipped model extensions |
| Insieme        | Installed package `2.1.2`                                                         | Repository recorded by that package: `yuusoft-org/insieme`; exact event-version parsing across its client stores              |
| Route Engine   | Installed `route-engine-js@1.46.1`                                                | Existing runtime contract; no engine change or release prerequisite                                                           |

The package version numbers here identify inspected dependencies, not a claim
about the latest published versions. An Insieme sibling checkout was not present
at `../insieme` during preparation. Obtain its owning checkout when its
implementation task starts; do not edit installed dependency files.

Use M for the first strict model release. Schema `15` is already released
without this feature, so M must be later than 15; select the actual version
through the model repository's release workflow. Existing fixture `15` values
remain symbolic examples, never registry entries to enable verbatim. Bind both
supported and future-version cases consistently when adopting them. Preserve
the original schema-14 corpus and measurements as historical evidence; the
September 18 refresh records added contracts separately. The sibling model
checkout at `4dc3cdaa` is older than the installed package and must be updated
to the published schema-15 baseline before implementing upstream work.

## 1.1 Executable compatibility baseline gate

Complete T0 in the [old-project test plan](./legacy-project-test-plan.md) before
changing validator behavior: freeze the old project packs, pin previous readers,
and prove baseline parity through real model, SQLite, and browser paths. This
is test preparation, not a new architecture decision. The current documentary
fixtures and in-memory probes are insufficient to pass this gate.

## 2. Model implementation PR

Proposed scope: **Version strict command contracts while preserving legacy
replay and supporting shipped Creator domain shapes.**

The PR must implement the completed [action contracts](./action-contracts.md)
and [limits](./limits-and-inputs.md), rather than only checking that actions
are objects. Required work is:

1. Dispatch the existing model APIs on explicit `modelSchemaVersion`.
   Omitted remains legacy-compatible; invalid or unsupported is an explicit
   failure. Keep supported strict versions enumerated. Model code does not
   read application storage wrappers or decide who may author legacy commands.
2. Validate command-aware payload patches, preconditions, effective affected
   results, references/context, and compatible whole-state invariants.
   Explicit strict `validateState` checks an entire supplied new state.
3. Represent shipped character spritesheets and other inventoried domain
   extensions directly in the model. The strict adapter path cannot strip
   these fields, validate an incomplete state, and restore them afterward.
4. Apply reference-impact rules to moves/deletions/type changes, without
   rejecting unrelated pre-existing invalid legacy references or silently
   sanitizing them. Same-identity section moves retain old line content.
5. Reject unknown action/structural fields and unsupported JSON values under
   strict input, while preserving explicitly documented literal-data fields,
   supported clear forms, bindings, template forms, and generated filters.
6. Update the fixture generator and harness so explicit versions reach every
   relevant model call. Preserve old archived bytes and their existing loader
   compatibility rules. Add strict negative cases and mixed sequential/batch
   replay equivalence.

Required evidence before release:

- Model package minor and `SCHEMA_VERSION` agree; new archive exists and all
  public commands retain minimum/full coverage.
- `bun run test:compat`, model API tests, compatibility fixture tests, and
  targeted action/reference/state tests pass.
- Each action/context and each affected mutation has positive and negative
  coverage, including the prepared fixtures and shipped template shapes.
- A regression demonstrates that dropping explicit version metadata causes
  the test to fail; passing only legacy fixtures is insufficient.
- No historical fixture is rewritten to satisfy a new stricter rule.

Release through the normal model publishing workflow. A local `file:` link may
be used for development validation later, but is not a published client fix.

## 3. Published Insieme dependency

The client now pins Insieme `2.1.2`, released from
[PR 42](https://github.com/yuusoft-org/insieme/pull/42). The released API validates
positive safe integer schema versions before writes and normalizes exact driver
integer representations on reads. It has no raw-version metadata or opt-in
reader capability. The client uses its numeric `schemaVersion` directly.

This release differs from the original raw-preserving reader proposal below:
it rejects malformed historical versions too. The frozen P08 fixtures contain
`1.5` and `"1junk"`, which the previous reader opened as envelope 1. Their
candidate opens now fail with `invalid_schema_version`. This is an unresolved
compatibility blocker under the approved old-project policy, not an expected
baseline change. Do not rewrite those rows, regenerate their expected output,
or patch the dependency to make the test pass. Resolve the owning API/recovery
policy before merging the client upgrade.

Verify valid versions and wrapped payloads through insertion, promotion, reload
and sync using actual storage adapters. Future strict malformed versions must
still fail closed. The upgrade requires no SQLite schema migration or server
protocol change.

## 3.1 Existing engine contract

Strict validation uses `route-engine-js@1.46.1` without an engine change. Object
assignments remain unmarked and retain recursive template/event interpolation.
The validator checks the existing data format; the editor does not add an
operation marker when re-saving old actions.

The literal-object feature from
[engine PR 351](https://github.com/RouteVN/route-engine/pull/351) is deferred and
is not a release prerequisite. Regression tests exercise existing interpolation
through strict authoring and persistence using the current published package.

## 4. Client implementation slices

Client implementation may be developed against the model source checkout through the repository's normal
local validation workflow, but the final client dependency change waits for
published versions. No dependency patch, copied fork, install rewrite, or
edited cached bundle is acceptable.

| Slice                               | Concrete work                                                                                                                                                                                | Exit evidence                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| C1: reader and codec                | Preserved legacy reads, exact strict envelope branching, `mv` mapping, identities, raw-before-domain boundaries, compatibility errors                                                        | Previous-reader parity for legacy values; strict/future-version errors; actual SQLite/IndexedDB round trips               |
| C2: authority and recovery          | Existing legacy loading/skip/recovery behavior, chronological strict suffix validation, coherent projections, retained recovery sources                                                      | Old-reader state and availability preserved, including missing-scene recovery; valid edit/reload; original rows unchanged |
| C3: acceptance ownership            | Shared coordinator, platform locks, refresh/preflight/write/state advancement, partial/unknown-write recovery, both sync ingestion methods                                                   | Competing tabs/processes, exact retry, failure injection, acknowledgment-before-broadcast                                 |
| C4: current authoring               | Current versions stamped internally; template/emitter composition covers avatar previews and the default-transform command; existing object values are preserved; direct same-identity moves | Every inventoried writer covered; no alternate new envelope-1 route after enforcement                                     |
| C5: error/UI and release validation | Stable localized errors, preserved unsaved drafts, backups/imports, platform compatibility and performance checks                                                                            | Appropriate client script/Puty/UI/platform tests; device tests when native behavior is implemented                        |

The [replay and acceptance contract](./replay-and-acceptance.md) selects concrete
ownership, lock lifetimes, cache handling, and failure semantics. Implementers
should not reopen those as unspecified options or substitute a queue that only
serializes database insertion.

The client also guards same-id ingestion using order-preserving domain payload
comparison. Indexed spritesheet frames make dictionary order significant;
Insieme's existing sorted-key comparison alone is insufficient. Apply the same
policy to source and cache digests, without reordering stored history or
changing Insieme's generic protocol identity contract. New conflict rejection
applies where envelope 2 is involved; legacy-only duplicate/recovery behavior
must not acquire a new load failure.

## 5. Reader-first delivery

Use two application release stages; this is a build/release decision, not a
user-selectable per-command validation setting:

1. **Reader release R:** consume the published model and Insieme dependencies; support both
   envelope versions, chronological strict replay, safe recovery sources,
   coordination, and errors. Before cutover, projects authored entirely under
   the old format can continue their existing authoring contract. On encountering
   envelope-2 history, R must either implement its supported strict authoring
   contract or make that project read/export-only. It must never append legacy
   commands as a fallback to an upgraded history.
2. **Writer release W:** enable current strict validation and envelope-2
   persistence for every new project and input, including edits to existing
   projects. All action-bearing branches, platform gates, and required tests
   must be complete before this switch.

For this plan, R uses **read/export-only for envelope-2 projects** unless the
strict writer is already present and verified. This makes rollback behavior
explicit. Roll back W only to a reader that understands its recorded versions;
preserve the original commands and recovery sources. Never relabel an event
as envelope 1 to make a downgrade open it.

Already released clients cannot be made safe retroactively. Reader-first
delivery defines the supported rollout/rollback pair; it does not guarantee
editing an upgraded database with arbitrary old binaries. In-place old-project
opening under W must preserve previous-reader behavior, including existing
recovery. The fixture corpus supplies baseline evidence; actual old/new reader
and platform comparisons are required before claiming this requirement is met.

## 6. Implementation start and release gates

The preparation deliverables are the action/context/field catalog, measured
limits, captured/proposed fixture corpus, replay/acceptance decisions, and this
sequencing document. Documentary cross-checks allow test-harness preparation
to start. Validator changes additionally require the executable T0 baseline in
section 1.1; passing documentation checks does not satisfy that gate or mean
future strict feature tests have passed.

During implementation, stop the affected release slice if any of these proofs
fails: a supported template/action is missing from the contract, an old project
that previously opened gains a new load/read-only restriction, legacy recovery
changes output or preview/export availability, a writer bypasses strict dispatch,
raw version information is lost before checking, or a platform cannot provide
the selected coordination. Fix the source of that failure; do not add a legacy
fallback for new input.

Compare the same captured databases in the previous reader and the candidate
on each supported storage path. Cover ordinary and draft-only histories,
legacy skip/recovery, complete and missing-scene recovery sources, no-metadata
checkpoints, previously tolerated legacy version values, and project restore.
Then submit one valid strict edit, reject one invalid strict edit without new
rows, and reopen after clearing only new disposable caches. Legacy state and
availability must be preserved; strict suffixes must retain their recorded
contracts. Any regression blocks this release, rather than requiring users
to repair legacy data. Additional legacy integrity hardening is separate work.

Final publication requires the published model release, compatible Insieme behavior, runtime and model/client/platform
tests, supported R/W compatibility checks, and measured loading/editing behavior.
These are implementation/release validations, not additional pre-implementation
design tasks or permission requests.
