# Validation fixture catalog

This catalog records the September 13 preparation fixtures and their historical
baseline observations. The legacy section-move scenario is now owned and tested
in the model repository; whole-project compatibility coverage lives in the
client harness linked below. Strict validation remains separate implementation
work.

The [manifest](./fixtures/manifest.json) records exact source revisions, source
and artifact SHA-256 hashes, and the model-version binding. `M` means the first
released strict model schema; `15` is its illustrative fixture value. The
observed model is `@routevn/creator-model` **1.14.0**, schema **14**. An omitted
model-version argument was used for every current-model observation.

## September 18 additions

The implementation baseline is client main `4d1fe31f` with installed model
`1.15.0` / schema 15 and engine `1.46.1`. M must be greater than 15. Bind the old
symbolic `15` examples when adopting them; do not relabel the original captures.

[Contract refresh](./fixtures/scenarios/september-18-contract-refresh.json)
adds independent authoring/runtime cases for avatar previews, default avatar
transforms, and marked literal object writes. Its setup requirements describe
neutral resources to construct through model commands in the future harness;
they are not replacement project snapshots or persisted event fields. It also
records the actually reproduced engine-1.46.1 unmarked interpolation result.
Marked expectations remain unexecuted until the engine feature exists.

## Whole-project compatibility coverage

The [old-project test plan](./legacy-project-test-plan.md) defines the
whole-project layer: immutable native folders and lossless IndexedDB captures,
pinned old-reader oracles, exact row preservation, and the open/edit/reopen
matrix. The P01–P10 packs are now implemented in
[the client compatibility harness](../../tests/projectCompatibility/README.md).
The preparation domain fixtures below record earlier observations.

## Model-owned section-move fixture

[Merged model PR #79](https://github.com/RouteVN/routevn-creator-model/pull/79) adopted
[the legacy section-move fixture](https://github.com/RouteVN/routevn-creator-model/tree/7569f0ff927f3b9a4cafe9246af622c3cf6fe83e/tests/compat/section-move-legacy-preserved)
and its executable model test. The seed and expected state retain their original
bytes; the two commands contain only model types and domain payloads. Sequential
processing and batch replay must preserve the complete state, line IDs/order,
unknown actions and dialogue fields, and input immutability.

The duplicated client scenario and observed state have been removed. This
catalog and `manifest.json` retain a pinned owner reference and the original
artifact hashes. The historical baseline summary remains unchanged. The shared
client seed stays because other client integration recipes use it; model tests
have their own frozen copy and never read a sibling client checkout.

## Provenance and reuse

Six YAML fixtures were copied byte-for-byte from model commit
`4dc3cdaa7805905c98547743b91cf74d3ea8fef2`:

| Copied source                                                                              | Purpose                                                      | Current observation                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------ |
| [Minimal state](./fixtures/legacy/schema-14/states/minimal-project.yaml)                   | Small complete starting state                                | `validateState` accepts                    |
| [Cross-referenced state](./fixtures/legacy/schema-14/states/cross-referenced-project.yaml) | Resources, references, and historical free-form line actions | `validateState` accepts                    |
| [Minimal line.create](./fixtures/legacy/schema-14/payloads/line.create/minimal.yaml)       | Historical `say: new` action                                 | `validatePayload` accepts                  |
| [Full line.create](./fixtures/legacy/schema-14/payloads/line.create/full.yaml)             | Rich dialogue/background plus historical `say: next`         | `validatePayload` accepts                  |
| [Story stream](./fixtures/legacy/schema-14/streams/story-crud.yaml)                        | 14 commands spanning story, scenes, sections, and lines      | Sequential application equals batch replay |
| [Media stream](./fixtures/legacy/schema-14/streams/media-crud.yaml)                        | 30 commands covering media resource lifecycles               | Sequential application equals batch replay |

The YAML `schemaVersion: 14` is the **model archive label**, not the stored
command envelope version. Do not put that value into SQLite `schema_version`.
When exercising these as historical events, use envelope 1 and preserve their
domain payloads. Payload fixtures require only payload validation unless a
runner supplies their referenced state. They are not standalone command logs.

The source streams contain no archived expected final state. Their complete
final snapshots were captured from the current model and stored under
`fixtures/observed/source-*.state.json`; these new snapshots are observations,
not previously published archive assertions. No source YAML was regenerated,
reformatted, sanitized, or edited.

Synthetic scenarios share [Project One setup](./fixtures/seeds/project-one.setup.json)
and its [observed state](./fixtures/seeds/project-one.state.json). Nine current
model commands create two scenes, three sections, two dialogue lines, an image
file/resource, and a character. The extra source-scene section is deliberate:
the current model rejects moving the last section out of a scene. IDs and
content are neutral; none of these files contains an actual user's project.

## Scenario inventory

`observedCurrentModel`/`observedCurrent` describes measurements or explicitly
states that a future test was not run. `expectedFuture` specifies intended
behavior. An observed snapshot for a negative future case must never become
the expected accepted state of the strict implementation.

| Scenario                                                                                  | Required future assertion                                                                                                                                    | Baseline available                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [Mixed history](./fixtures/scenarios/mixed-history.json)                                  | Strict edit to Line Two preserves unrelated legacy fields/actions on Line One; draft-only, mixed draft/committed, and fully committed reloads agree          | Full state; two current-model commands                                          |
| [Merge and replace](./fixtures/scenarios/merge-and-replace.json)                          | Merge replaces a supplied action as a whole and preserves untouched sibling actions; `replace: true` replaces the complete action map                        | Full state; three commands                                                      |
| [Valid preserve](./fixtures/scenarios/preserve-valid.json)                                | Retained dialogue content is included in effective-result validation                                                                                         | Full state; one command                                                         |
| [Invalid preserve](./fixtures/scenarios/preserve-invalid.json)                            | An existing `content: 42` cannot pass a new strict preserve edit; reject the new write without dropping retained content                                     | Current permissive full state; two commands                                     |
| [Resource use, clear, delete](./fixtures/scenarios/resource-use-clear-delete.json)        | Validate a historical image reference at its event prefix; later valid deletion must not break reload. A new use after deletion rejects                      | Full state; three commands                                                      |
| [Direct section move](./fixtures/scenarios/section-move-direct.json)                      | Replay original ownership before and after cross-scene movement; preserve lines and chronological dependencies                                               | Full state; three commands                                                      |
| [Current section-move emitter](./fixtures/scenarios/section-move-emitter.json)            | Preserve stored envelope-1 delete/move/recreate sequences; change future authoring to the existing direct model move                                         | Full state; three commands; clean result equals one direct move                 |
| [Move unchanged legacy lines][legacy-section-move]                                        | A new direct move retains legacy action data and line identities; copy/duplicate remains strict new-content creation                                         | Model-owned test; original full state and two domain commands                   |
| [Character spritesheet adapter](./fixtures/scenarios/character-spritesheet-adapter.json)  | Keep historical spritesheet data during replay and ordinary updates; strict authoring requires model-owned support                                           | Raw model rejects; current client adapter accepts create then rename            |
| [Envelope/version failures](./fixtures/scenarios/envelope-and-version-errors.json)        | Preserve existing historical legacy version reads; reject malformed strict versions/wrappers and future `mv` without legacy fallback                         | Existing storage coercion documented; future decoder cases are unexecuted       |
| [Persistence round trip](./fixtures/scenarios/persistence-roundtrip.json)                 | Both draft and committed tables retain the same wrapper; stable retries, promotion, backup, and engine-facing decoding preserve the correct identity/version | Declarative platform test cases                                                 |
| [Acceptance ordering](./fixtures/scenarios/acceptance-ordering.json)                      | Whole-batch validation before insertion; honest partial/unknown I/O outcomes; revalidate after concurrent edits, project changes, and draft promotion        | Declarative fault/concurrency schedules                                         |
| [New input boundaries](./fixtures/scenarios/new-input-boundaries.json)                    | Stamp current versions internally; reject caller version spoofing, unknown/scalar action data, and invalid full-state bootstrap                              | Declarative authoring cases for each listed entry point                         |
| [Checkpoint-backed recovery](./fixtures/scenarios/checkpoint-backed-legacy-recovery.json) | Preserve existing recovered state and availability, including missing-scene behavior; retain source rows and strictly validate subsequent commands           | Current history helpers and scene-loader probes; original row values and hashes |

The [ordered-domain identity fixture](./fixtures/scenarios/ordered-identity.json)
adds an exact-retry case: swapping atlas frame keys changes the image selected
by clip index zero. The same command id with that reordered domain payload
must conflict before insertion, committed ingestion, or promotion. The fixture
includes both frame-key orders, frame-zero rectangles, and order-preserving
payload hashes. Wrapper-only key reordering remains an identical retry.

The spritesheet distinction is observed behavior, not a proposed permanent
client-side strict validator. The model currently rejects `type: spritesheet`
for `character.sprite.create`; the client adapter accepts and retains it. The
first strict release must resolve model ownership before enabling this authoring
path. A generic model-only legacy replay would lose this compatibility.

The captured legacy spritesheet has clip indexes but no atlas frames. Strictly
creating that same incomplete atlas must reject; model ownership alone does
not make it valid. A separate proposed strict-positive variant supplies two
16 × 16 frames in the 32 × 16 sheet and retains clip indexes `[0, 1]`. Run it
independently from the shared seed. Name-only edits of an already existing
legacy spritesheet preserve its untouched atlas; newly supplied/replaced atlas
or clip data is strictly validated.

For movement, the current UI emits `line.delete` → `section.move` → `line.create`
across scenes. Strictly validating the recreation would reject unchanged
legacy content. The proposed authoring path uses the existing model's direct
`section.move` against complete authoritative state. The fixture retains the
old emitted sequence as historical evidence. New supported inbound references
that would become invalid must be rejected or explicitly repaired before the
move; this is not permission to rewrite action targets silently.

## Recovery source exception

The recovery fixture represents an already-supported Tauri history with no
`project.create`, one legacy draft, and original main/scene checkpoint rows.
The [source rows](./fixtures/seeds/recovery-source-rows.json) contain actual
current-format `materialized_view_state` column values, synthesized from the
neutral seed. They are JSON test data, not a database migration or a new
production baseline.

Current helper probes establish that:

- Bootstrap inspection alone reports `missing_bootstrap_event`.
- A matching main checkpoint qualifies for the existing recovery path, both
  with `meta.historyStats` and with the supported revision/count fallback.
- The main projection has no line data. Combining the preserved per-scene
  source rows restores the original two lines and exact cutoff state.
- Removing Scene One's source row makes the existing scene loader return zero
  lines without throwing. A successful main-checkpoint check therefore does
  not prove complete project recovery.

Future cache invalidation must retain these original rows byte-for-byte in
place. New disposable caches use distinct view names. Rebuild from the original
legacy source at its cutoff, then apply only the recorded suffix. Never insert
a replacement bootstrap, treat the legacy baseline as fully strict, or discard
the recovery source rows during database import. The missing-scene variant
must retain the previous reader's zero-line result and opening/editing/export
availability. Do not add a blocking recovery-completeness error in this feature.
The observation does not prove the original story was empty; original sources
must remain untouched. New integrity checks and repair UX are separate work.

Add an old/new reader comparison for both variants. A valid new edit against
the resolved state is strictly validated and survives reload as envelope 2;
an invalid new edit adds no rows and leaves the project usable. Neither edit
may turn legacy recovery into a new project-open failure. Verify cache reset
and restore preserve this behavior as well as source bytes.

This fixture exercises existing pure helpers and the current scene loader
with an in-memory store interface. It does not claim a native device open or a
completed new recovery implementation. This recovery path remains local-only.

## Adopting these fixtures into implementation tests

1. Verify the manifest hashes before adopting the data. Preserve copied YAML
   bytes. Bind illustrative `15` to released `M` only when adding the future
   tests, and define the explicit supported registry in each version scenario.
2. Parse setup references relative to their containing scenario/setup file.
   `bootstrap.stateRef` supplies the state for a synthesized historical
   `project.create` payload: `{ "state": <referenced state> }`. Remove `stateRef`
   from the actual event. Fixture metadata, expectations, and reference fields
   must never enter persisted payloads. Manifest paths and baseline-summary
   source observation paths are relative to the fixtures root.
3. For baseline model tests, start with the referenced state and apply the
   listed unwrapped domain commands **without** a model-version argument. Run
   both sequential `processCommand` and batch `replayCommands`; compare to the
   observed state using the manifest's existing structural state hash, plus
   explicit ordered-key assertions wherever order carries meaning. The temporary
   preparation probe manually unwrapped these fixture records; it did not
   implement or test the future production codec.
4. For strict tests, use the implemented production decoder/authoring gate
   and actual model version dispatcher. Persist a listed raw record unchanged
   for historical ingestion. Submit only its domain request through new
   authoring. Negative cases assert an error, no new accepted rows, and no
   publication of the proposed invalid state. Do not substitute current
   unversioned observations for expected strict behavior.
5. For storage tests, use fresh disposable SQLite databases and IndexedDB
   stores, then read actual rows and reopen them. Puty is the client home for
   SQLite assertions; cover real native drafts as well as committed rows.
   Assign deterministic draft clocks or committed IDs in fixture order. Run
   mixed-history layouts independently rather than persisting duplicate
   bootstrap records in one database.
6. For malformed versions, insert the raw malformed row below normal
   authoring validation, then exercise normal storage reads. Insieme 2.1.1
   currently turns SQL `REAL 1.5`/`TEXT "1junk"` into envelope 1 and
   `REAL 2.9`/`TEXT "2junk"` into envelope 2. An in-memory SQLite probe confirmed
   this behavior. Preserve the former historical legacy interpretation and
   test rejection of the latter before lossy conversion. New authoring cannot
   submit either raw representation to select legacy validation. SQLite can
   convert a canonical numeric string to an integer through column affinity;
   the numeric-string case is consequently scoped to JSON/IndexedDB rather
   than claiming the original bound SQL string remains observable.
7. For altered-version identity tests, configure a reader supporting both
   versions when asserting an identity conflict specifically. With only `M`
   supported, `M+1` may correctly fail compatibility first; neither outcome
   may accept the changed record as the original. Exact retries preserve the
   originally persisted `mv` across an authoring-version upgrade.
   The ordered-identity fixture additionally compares `Object.keys` of the
   atlas frame dictionary and the rectangle selected by clip index zero.
   Preserve the existing sorted-key baseline hashes as structural observations;
   they are insufficient for this ordering check. The implementation's Creator
   identity/frontier/cache digest uses order-preserving domain JSON and a
   fixed-order metadata tuple before Insieme compares identities. Even a
   reordered domain field without rendering impact is an identity conflict
   under this conservative exact-retry policy for envelope-2 records. Retain
   existing legacy-only duplicate/recovery behavior. Only wrapper key order is
   normalized for fingerprinting; original stored rows are never rewritten.
8. Drive the acceptance schedules with controllable storage acknowledgements,
   revision changes, and independent clients. These data files do not provide
   a concurrency runner or assert that sequential native inserts are a single
   transaction. For recovery, compare original source row values and hashes
   before/after strict suffix writes and deletion of only new disposable caches.

## Measurements and limits

The [baseline summary](./fixtures/observed/baseline-summary.json) records six
accepted copied fixtures, **44** commands in the two archived streams,
**nine** setup commands, and **19** commands across eight synthetic sequences.
Sequential processing and batch replay produced identical results for all
those streams/sequences. The spritesheet create/rename and recovery-source
checks were additional focused probes. No active test suite or application
build was changed or run for this preparation.

This set freezes representative behavior and the reviewed compatibility
failure modes. It does not claim exhaustive positive/negative fixtures for
every action field, runtime limit, UI emitter, or platform fault. Those cases
must be derived from the separate action contract inventory when the model
tests are implemented. Shipped templates and actual project distributions
have not been measured by these synthetic fixtures.

[legacy-section-move]: https://github.com/RouteVN/routevn-creator-model/tree/7569f0ff927f3b9a4cafe9246af622c3cf6fe83e/tests/compat/section-move-legacy-preserved
