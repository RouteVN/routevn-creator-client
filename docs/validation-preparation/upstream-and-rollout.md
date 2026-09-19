# Upstream work and rollout sequence

Status: implementation has resumed with the executable old-project baseline
and isolated owner work. No package release, client dependency upgrade, strict
write enablement, application release, or deployment has been performed.

The storage contract remains envelope 2 with `{ mv, commandPayload }` inside
the existing payload value. There is no SQLite schema migration or application
server work.

## 1. Baseline and owners

| Component      | Inspected baseline                                                                | Owner and work                                                                                                                |
| -------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Creator client | Main `4d1fe31f` (September 18 implementation refresh)                             | This repository: composition, codec, coordination, authoritative replay, projections, platform integration, UI errors         |
| Creator model  | Installed package `1.15.0`, schema `15`; original schema-14 observations retained | `../routevn-creator-model`: all strict domain schemas, version dispatch, transition/reference rules, shipped model extensions |
| Insieme        | Installed package `2.1.1`                                                         | Repository recorded by that package: `yuusoft-org/insieme`; exact event-version parsing across its client stores              |
| Route Engine   | Installed `route-engine-js@1.46.1`                                                | `../route-engine`: explicit literal object-write mode, legacy runtime compatibility, packaged-player delivery                 |

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

## 3. Insieme implementation PR

Proposed scope: **Expose original event versions for strict decoding while
preserving existing legacy storage reads.**

The installed readers can turn raw `1.5` or `"1junk"` into version `1`, and
`2.9` or `"2junk"` into `2`. The application codec cannot detect the discarded
information. Correct this in the owner, without changing its SQLite schema or
unconditionally rejecting historical representations the old reader accepted.

Required contract:

- Provide a supported raw-preserving read path alongside existing legacy
  behavior. Keep malformed versions distinguishable from absence and from a
  valid integer so the Creator boundary can apply the appropriate policy.
  Do not force every historical row through a new strict parser. Insieme
  need not hard-code Creator envelope 1 or 2.
- Newly authored writes and the Creator envelope-2 path validate positive safe integers
  exactly. JSON input uses numbers; driver integer representations require
  lossless conversion. `2.9` / `"2junk"` must never become envelope 2.
  Unsupported versions remain the Creator codec's decision.
- The existing historical-load/import/retry path retains only the old
  reader's legacy interpretation, including historical `1.5` / `"1junk"`
  where it already yielded envelope 1. Preserve stored bytes and old payload
  validation. This is not a fallback after strict failure, a caller-selected
  authoring mode, or proof that an imported database is strictly valid.
  Existing legacy retransmission/promotion preserves its recorded values;
  it is not newly authored data.
- Cover synchronous SQLite, LibSQL, asynchronous SQLite, IndexedDB, and their
  relevant draft and committed record readers. Verify writes before adapter
  conversion as well as raw-preserving reads of existing malformed rows.
- Preserve exact valid envelope/payload values through insertion, load,
  acknowledgment promotion, committed batches, and identity comparison.
- Do not alter unrelated timestamp parsing or database `PRAGMA user_version`
  as a side effect of this correction.

Required evidence: actual raw-row tests for fractions, numeric prefixes,
unsupported integer ranges, driver integer representations, and both draft
and committed tables/stores. Compare old/new legacy reader outcomes and
separately assert exact strict rejection and absence of an authoring bypass.
Also exercise a wrapped payload with `mv` through
promotion and reload, retaining payload compression behavior.

Publish the normal compatible package release chosen by that repository's
maintainers. This task does not prescribe a new transport protocol or a server
upgrade. App-owned ingestion interception can use the existing injected store
interface for both `applyCommittedBatch` and `applySubmitResult`; no new hook
is assumed necessary for that interception.

## 3.1 Engine implementation PR

Proposed scope: **Preserve literal values in explicitly marked object-variable
writes without changing unmarked historical actions.** Model and engine support
must agree on `VariableOperation.valueMode: "literal"` before client integration.

- Validate the marker and `set` object/array shape before action template
  traversal. Copy the marked value as inert JSON without evaluating templates
  or event selectors, including nested arrays and operator/action-like keys.
- Retain existing template resolution for unmarked operations and type,
  computed/read-only, scope, and runtime validation for all operations.
- Preserve the marker through nested immediate/deferred actions and runtime
  save/load/rollback. Do not infer behavior from a project's newest `mv`, because
  mixed projects contain both representations and runtime receives domain data.
- Prove marked/unmarked behavior side by side against engine `1.46.1`, including
  `${variables.source}`, `_event.value`, missing event context, and prototype-like
  own data keys. Unknown markers and marked non-object writes must reject.

Publish the normal engine package release. Both reader R and writer W must use
it in Creator preview, browser exports, and every packaged native player before
handling marked actions. Pin/verify player template artifacts as well as the
client package; upgrading only Creator is insufficient. If an artifact is still
on the old engine, that release gate remains blocked, not silently downgraded.

## 4. Client implementation slices

Model, Insieme, and engine work can proceed independently after agreeing on
the literal-operation field contract. Client implementation may
be developed against their source checkouts through the repository's normal
local validation workflow, but the final client dependency change waits for
published versions. No dependency patch, copied fork, install rewrite, or
edited cached bundle is acceptable.

| Slice                               | Concrete work                                                                                                                                                                   | Exit evidence                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| C1: reader and codec                | Preserved legacy reads, exact strict envelope branching, `mv` mapping, identities, raw-before-domain boundaries, compatibility errors                                           | Previous-reader parity for legacy values; strict/future-version errors; actual SQLite/IndexedDB round trips               |
| C2: authority and recovery          | Existing legacy loading/skip/recovery behavior, chronological strict suffix validation, coherent projections, retained recovery sources                                         | Old-reader state and availability preserved, including missing-scene recovery; valid edit/reload; original rows unchanged |
| C3: acceptance ownership            | Shared coordinator, platform locks, refresh/preflight/write/state advancement, partial/unknown-write recovery, both sync ingestion methods                                      | Competing tabs/processes, exact retry, failure injection, acknowledgment-before-broadcast                                 |
| C4: current authoring               | Current versions stamped internally; template/emitter composition covers avatar previews, the default-transform command, and literal object markers; direct same-identity moves | Every inventoried writer covered; no alternate new envelope-1 route after enforcement                                     |
| C5: error/UI and release validation | Stable localized errors, preserved unsaved drafts, backups/imports, platform compatibility and performance checks                                                               | Appropriate client script/Puty/UI/platform tests; device tests when native behavior is implemented                        |

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

1. **Reader release R:** consume the published model, Insieme, and engine dependencies; support both
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

Final publication requires actual model/Insieme/engine releases, engine/player and model/client/platform
tests, supported R/W compatibility checks, and measured loading/editing behavior.
These are implementation/release validations, not additional pre-implementation
design tasks or permission requests.
