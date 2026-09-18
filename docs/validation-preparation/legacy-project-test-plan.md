# Old-project compatibility test plan

Status: the executable T0 baseline has been implemented, with frozen old-writer
project packs and previous-reader/candidate comparisons. Strict upgrade tests
(T1–T3) remain outstanding; passing the baseline does not certify strict writes.

## 1. What we need to prove

An old project that opens today must still open with the candidate reader,
produce the same recovered story and resource data, and retain the same editor,
preview, and export availability. A valid new edit must survive save/reopen.
An invalid new edit must add no command rows and leave the old project usable.

Use frozen synthetic projects created with the old writer, plus narrowly
identified fault-injected variants for recovery cases. Use names such as
`Project One`, `Scene One`, and `Character One`. User projects are optional
additional regressions, not a prerequisite or an implied source of test data.

Do not create an alleged old project with the candidate writer and merely set
its version to 1. Do not use a mocked `getState()` result as evidence that an old
database can be loaded. The old writer/reader and actual storage representation
are part of the test input.

## 2. Ownership: both repositories, with different responsibilities

| Owner                           | Fixture and test responsibility                                                                                                                | What passing proves                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `../routevn-creator-model`      | Extend `tests/compat/schema-<n>/` and `tests/compatibility-fixtures.test.js`; adopt domain states/streams and add strict affected-result cases | Historical domain commands, normalization, references, and reducers retain their contract; strict commands validate their affected content |
| Creator client, this repository | Frozen project folders/databases and browser-store captures; real repository load/edit/reopen tests; error and preview/export checks           | The app preserves metadata, versions, history ordering, recovery, and usable project behavior across the upgrade                           |
| Insieme owner                   | Raw SQLite/IndexedDB version and payload fixtures, promotion and duplicate tests                                                               | Storage retains the information the client needs before decoding; no lossy strict-version coercion                                         |
| Route Engine owner              | Old unmarked and new marked object-operation fixtures; runtime round trips                                                                     | Legacy interpolation and explicit literal execution retain their distinct behavior                                                         |

Model tests must not import the client or depend on SQLite/browser APIs. Client
tests use the published or explicitly linked development model and the actual
client codec/repository path; they must not implement a second validator.

Client-only legacy spritesheet adapters and checkpoint recovery remain client
fixtures even if their domain-only counterparts are copied into model tests.
The raw model's rejection of an old adapter-supported sprite is not proof that
the old app rejected it. Use the old client as the oracle for that case.

Copied domain fixtures carry source paths and byte hashes. Preserve the original
archive files and their loader compatibility rules. No cross-repository symlink
or a sibling checkout silently supplies the expected result in CI.

## 3. Pin the old writers and readers

Record three independent identities for each capture:

- **Writer:** the exact client/model/engine versions and source revisions that
  created the fixture, plus its lockfile/artifact hashes and capture platform.
- **Previous reader:** client main `4d1fe31f` with model `1.15.0`, before strict
  validation. This is the compatibility oracle for the candidate upgrade.
- **Candidate:** the tested revision and dependency versions, including the
  actual first strict schema M, which must be greater than 15.

Use the original client preparation revision `0844141f` and model `1.14.0`
for a schema-14 writer capture, after verifying its exact dependency lockfile.
Use `4d1fe31f` for the latest pre-strict writer, including schema-15 avatar
features. These are source baselines; do not invent an app release number from
the model version. Record release tags/artifact checksums when actual packaged
releases are used.

Retain older model archives 1–15 as domain coverage. An archive number does not
prove that a complete app project from that release was captured, or that an
obsolete database format is supported. The project corpus targets the previous
reader's supported storage formats; failures it already has remain failures.

Build the old reader in a separate pinned checkout with its own frozen
installation. It must not resolve `node_modules` from the candidate or consume
candidate-generated expected state. Archive the runnable test artifact and
runner protocol version so CI does not depend on a moving branch. Missing
baseline artifacts fail the required job rather than skipping comparisons.

Before trusting any candidate comparison, rerun the previous reader on the
frozen capture and require it to match its recorded expected output. If that
fails, diagnose the fixture/environment; do not refresh its expected output
using the candidate.

## 4. Frozen project pack format

Canonical committed client files are `tests/fixtures/legacy-projects.zip` and
`tests/fixtures/legacy-projects.manifest.json`. The text manifest records cases,
provenance and every archived file hash. Tests verify and automatically extract
the archive into a disposable cache outside the working tree. See the
[harness packaging workflow](../../tests/projectCompatibility/README.md#archive-format-and-automatic-extraction).

Logical layout inside the ZIP (no expanded files are committed):

```text
<fixture-id>/
  manifest.json
  authoring-recipe.json
  source/                         # platform-specific immutable capture
  expected/previous-reader.json
  expected/source-records.json
  expected/asset-hashes.json
```

The manifest records the identities above, fixture origin (`old-writer` or
`fault-injected`), source platform and storage schema, storage names and key
paths, fixture file hashes, and explicitly supported test variants. A
fault-injected variant records its parent hash and exact altered/deleted row;
it is not presented as an untouched project exported by a user.

The authoring recipe is reproducibility evidence. Tests read the frozen source;
they do not regenerate it with the latest writer at test time. Clock and ID
injection belong to test setup, not production ID generation changes.

### Native project capture

Capture the complete supported project directory: `project.db`, app-owned
project metadata, assets under `files/`, and recovery-source checkpoints where
present. Use the old app's supported close/backup path to make a consistent
SQLite snapshot. Do not copy only the main DB file while committed writes
remain in its WAL. Record any platform-specific sidecar required by the old
import/open path. Exclude acceptance lock files and machine-local caches only
where the actual backup contract excludes them.

Freeze the database bytes once captured and verify their file hash before
making a disposable test copy. After opening/editing, compare original history
row identities, types, ordering fields, SQLite storage classes, version values,
and **raw payload BLOB bytes**. Also compare original recovery-source checkpoint
values byte-for-byte. Do not compare the whole DB file hash after a normal open:
SQLite pages, WAL/checkpoint bookkeeping, and disposable caches can change
without rewriting project history. New strict rows are permitted only in the
edit phase and must have the expected identities and wrappers.

### Browser project capture

Record the actual IndexedDB schema and every project-owned store used by the
old app, including metadata, assets, drafts, committed events, and checkpoints.
Use a lossless fixture dump: distinguish absent/undefined from null where the
store can represent them; preserve key types, auto-increment generators,
Blob/ArrayBuffer data, and object enumeration order. Assets can live in separate
hashed files with explicit dump references. Plain `JSON.stringify` of the
whole database is not an adequate capture format.

Restore the dump through a fixture-only importer at the raw IndexedDB layer in
a real browser, then invoke the normal app open path. It must not reconstruct
history through candidate `submitCommand`. Browser profile snapshots may be
kept as supplementary evidence; they are not the only portable fixture format.
Use isolated origins/profiles for the old reader and candidate.

### Expected outputs

Capture the old reader's full resolved project state, each scene's ordered
section/line data, relevant projectInfo/platform metadata, recovery outcomes,
and preview/export availability. Preserve unknown legacy fields and atlas frame
key order. Record stable structured error categories for known-invalid controls.

Read the opened repository's resolved projection (`getState()`), enumerate its
scenes, and hydrate each scene before capturing its sections/lines and runtime
output. History-only `loadState()` replay is a separate observation: P07 can
recover two scenes from checkpoints while history replay is empty. Freeze each
open phase independently when the previous reader has a phase-specific outcome;
never substitute history replay for checkpoint-recovered content. Negative
controls must detect lost recovered scenes/lines with unchanged checkpoint bytes.

Also record representative runtime observations: a dialogue line with its
speaker/avatar, a navigation result, and indexed-sprite frame zero where used.
For cases containing historically unsupported action names, compare whatever
preview/export outcome the old app actually has; do not assume playable success.
Raw historical payloads and expected domain projections are separate artifacts.

Compare exact domain values, array order, and semantically significant dictionary
order. Do not mask all unknown fields or use only the model suite's existing
subset assertion. Any new default fields need a narrow, documented equivalence
rule plus an assertion that they do not change observable behavior. Mask only
named environmental fields such as temporary asset URL prefixes; do not remove
saved IDs, versions, timestamps, content, or source-history order from checks.

## 5. Minimum project corpus

All names below are planned pack IDs, not claims of existing captured databases.
The existing [preparation fixtures](./fixture-catalog.md) supply some domain
inputs and observed outcomes; capture them through the old platform readers
before counting them as whole-project coverage.

| ID  | Old project content / variant                                                                                                           | Failure it must catch                                                                         | Existing starting material                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P01 | Small project created by the schema-14 writer: two scenes, three sections, dialogue and branching                                       | Ordinary old open/edit/reopen regression                                                      | `seeds/project-one.*`, legacy story stream                          |
| P02 | Cross-referenced project with images, fonts, audio, variables, layouts, controls, callbacks, and valid preview data                     | A strict catalog or projection loses a shipped old shape                                      | Legacy cross-referenced state, shipped template, action catalog     |
| P03 | Old line with unknown action/field and invalid preserved dialogue, plus a separate valid line                                           | Unrelated edit retroactively rejects old content, or preserve/copy bypasses strict validation | Mixed-history and preserve scenarios                                |
| P04 | Create resource, reference it, clear it, then delete it; cross-scene move history                                                       | Replay uses today's resources/ownership instead of the correct history prefix                 | Resource-use and both section-move scenarios                        |
| P05 | Client-supported legacy character spritesheet, including indexed frame order and the incomplete-atlas rename case                       | Raw-model replay drops client extension data, or rename validates unrelated old atlas data    | Spritesheet adapter and ordered-identity scenarios                  |
| P06 | Old reader's tolerated draft-skip and duplicate/obsolete-event recovery cases, each a separate labelled variant                         | Candidate turns existing recovery into an open failure or changes recovered state             | Existing client history/repository tests; capture missing artifacts |
| P07 | No bootstrap, draft-only history, original main/scene source checkpoints; variants with missing scene source and absent metadata        | Cache invalidation destroys source data or adds a new completeness gate                       | Checkpoint-backed recovery scenario and source rows                 |
| P08 | Raw legacy envelope representations actually accepted by the old adapter, including SQLite `REAL 1.5` and `TEXT 1junk` where reproduced | Insieme/parser upgrade tightens legacy reads or mutates original row bytes                    | Envelope/version scenarios; fault-injected raw rows                 |
| P09 | Schema-15 project with default avatar transform and persisted preview avatar from a different character                                 | Closed schemas reject current shipped data or default-transform references disappear          | September 18 refresh; existing avatar tests and Puty scenario       |
| P10 | Deterministic old-writer project with 10,000 small edits across multiple scenes; separate oversized legacy-row variant                  | Paging, cooperative replay, or new-input limits reject/load a different old project           | New capture required; versioned deterministic recipe                |

For P01 and P09, capture actual draft-only, committed-only, and
committed-plus-draft states through the old storage/session paths. Do not alter
an event's storage destination to claim that acknowledgments were tested.
For P02–P05, require at least one draft-only and one mixed-history capture.
P07 stays local-only, matching the current supported recovery behavior.

P06/P08 variants must record the old reader's observed acceptance or failure per
adapter. A SQLite coercion case need not have the same result in IndexedDB;
store both expectations rather than imposing SQLite behavior on every platform.
For P10's oversized row, exceed a planned new-input bound only where the old
reader demonstrably opens it; record its size and platform result. It is a
historical-compatibility case, not permission to accept oversized new input.

Tiny distributable assets must satisfy the referenced dimensions/types and
carry hashes/license provenance. Avoid network asset URLs in required tests.
Optional anonymized user-project reproductions can extend this corpus later,
but must not replace the deterministic synthetic cases.

## 6. Required upgrade procedure for each applicable pack

Each phase starts from an independent disposable copy; failures in one branch
must not contaminate later comparisons.

1. **Baseline A/A:** open with the pinned previous reader; compare to its frozen
   oracle. Repeat with a fresh process/profile to prove no hidden in-memory state.
2. **Candidate open:** open the identical source with the candidate. Compare
   resolved state, ordered content, metadata, recovery, and availability; assert
   original event payloads/versions and recovery sources were not rewritten.
3. **Warm and cold reopen:** reopen normally, then clear only documented
   disposable caches and reopen. Keep recovery-source checkpoints in P07. Compare
   results; closing/reopening must recreate the repository/model instance.
4. **Valid edit:** change a known-good line or rename a section using the actual
   project service. Require an envelope-2 row with the current M, exact intended
   state change, unchanged unrelated legacy content, and success after restart.
5. **Invalid edit:** against a fresh copy, edit an existing target with a known
   strict violation. Assert the specific stage/path, zero added command rows,
   unchanged accepted state, visible feedback, and preserved unsaved draft where
   applicable. A missing-target error is not evidence of action-schema validation.
6. **Affected-scope cases:** P03 edits the bad action itself, preserves bad content,
   and attempts a copy (reject); its unrelated valid edit succeeds. P04/P05 move
   without recreating legacy actions, while newly broken supported refs reject.
7. **Backup/restore:** after the valid edit, use the normal supported backup and
   restore path into an empty destination, preserving original history/versions
   and recovery sources. Reopen and compare the expected mixed state.
8. **Strict-version failures:** on separate copies, inject malformed envelope 2,
   unsupported M, and unknown envelope versions. Require explicit failure without
   deleting/skipping their rows or publishing an editable partial state. This is
   deliberately different from P06/P08 legacy recovery.

Old binaries are never used to edit the newly upgraded copy. Supported rollback
uses reader release R; arbitrary old binaries cannot be retroactively protected.

Every run emits a machine-readable report with fixture hashes, old/candidate
versions, phase, platform, expected/actual structured result, first differing
path, ordered-key differences, row-byte differences, and preserved recovery
sources. Failure artifacts retain disposable databases, not private user data.

## 7. Mock boundaries and platform coverage

Mocks are useful for clocks, IDs, network timing, and injected failures. They
must not replace the decoder, reducer, persistence read/write, or repository
open path in tests that claim backward compatibility.

| Layer              | Required implementation                                                                                                         | Cadence                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Model              | Frozen domain fixtures through real old-compatible and strict model APIs, explicit version-dispatch assertions                  | Every model PR                            |
| Client SQLite      | Real disposable SQLite DB and production Tauri/client-store logic; actual drafts, committed rows, app metadata, and checkpoints | Every client compatibility PR             |
| Client browser     | Real IndexedDB in Chromium and WebKit, normal repository load/edit/reopen; no fake-indexeddb-only signoff                       | Every client compatibility PR             |
| Insieme            | Real raw-row/store round trips for exact versions, bytes, and draft promotion                                                   | Every upstream storage PR                 |
| Native application | Same fixture packs through actual desktop, Android, and iOS adapters and app open flows                                         | Before enabling strict writes and release |
| Runtime/player     | Representative legacy and marked actions through Creator preview, browser export, and packaged native player                    | Engine changes and release                |

Puty remains the home for declarative SQLite row assertions. Extend
`tests/puty/insiemeStorageScenario.js` only where its existing committed-store
purpose fits; add a focused client-store helper for native draft/recovery packs.
The existing helper's sync-server committed-row assertions alone do not test
an old native project opening. Keep non-Puty orchestration in a planned
`scripts/test-project-compatibility.js`, with browser runners under
`tests/projectCompatibility/` and no page-handler test hooks.

Run a separate old/candidate process or browser context for each lane. For
true concurrency use independent browser tabs/native processes with real locks;
controlled promises in one mocked store are supplementary fault tests only.
Apply the existing acceptance schedules for partial writes, acknowledgment
promotion, duplicate retry, and gaps to the captured corpus after basic parity.

Record cold/warm loading time and memory on the same machine against the old
reader, including P10. Set reviewed regression budgets from these measurements
before release; do not claim performance from small schema fixtures or use
wall-clock time to decide whether a historical command is valid.

## 8. Prevent false confidence

- The current model archive runner checks unversioned APIs and permits extra
  object fields in expected-state comparisons. Retain that historical contract,
  but add explicit strict dispatch cases and exact targeted preservation checks.
- Never regenerate expected state with the candidate to make a test pass.
  Baseline updates require a documented behavior decision, not snapshot approval.
- Deliberately prove the harness catches a dropped model version, a removed
  unknown legacy field, reversed atlas frame order, a changed payload byte, and
  a missing recovery checkpoint. These are test-only negative controls, not
  dependency patches or production mutations.
- Assert the expected failure category/path for invalid edits; any thrown error
  is not sufficient. Verify accepted state and raw rows after the error.
- Unknown strict versions must fail even with warm checkpoints. Removing all
  new caches must not be necessary to discover incompatible history.
- Keep archived source hashes unchanged. A decoded snapshot that looks right
  does not prove the original bytes survived normalization or compression.
- Report planned, captured, executable, and platform-verified coverage
  separately. Missing platform jobs or skipped fixture variants block the
  corresponding gate instead of counting as passing coverage.

## 9. Delivery order and exit criteria

**T0 — Freeze the baseline, before validator implementation.** Capture P01–P09
and their required variants using old writers/readers, add the immutable packs,
and make baseline A/A plus current candidate parity executable in model, real
SQLite, and browser tests. Add P10 measurements. Pin baseline artifacts and
verify negative controls. At this point both lanes use old behavior; this
proves the comparison harness, not strict validation.

**T1 — Model and runtime contracts.** Adopt relevant domain fixtures upstream;
add executable failing strict cases with explicit M and the literal-marker
runtime matrix. Implement their owners against these cases. Keep old archives
and baseline outputs intact.

**T2 — Client integration.** Run the full upgrade procedure through the actual
new codec/coordinator, including cache loss, failed writes, backups, and strict
suffix replay. Use published dependencies for final integration. During source
validation use only the documented development linkage, never dependency patches.

**T3 — Platform and release gates.** Run the native/device and exported-player
lanes, validate reader R before writer W, and review measured regressions. Every
required pack/variant must have a recorded passing result on its applicable
platform; an unsupported fixture is documented with the old-reader evidence,
not silently omitted.

The executable baseline is now in
[`tests/projectCompatibility`](../../tests/projectCompatibility/README.md), with
27 captured SQLite variants and 23 applicable portable browser captures.
It covers old/candidate cold, warm, and cache-cleared opens, exact history
preservation, logical runtime observations, real Blob assets in the media packs,
and comparator negative controls. It still does not certify the strict-upgrade
phases, native binaries, graphics/player delivery, or backup/restore.

The real captures also found prior-reader behaviors that mocked tests did
not expose:

- Locally acknowledged SQLite drafts can become committed rows with missing
  `projectId`, making reopen fail with `validation_failed`. The dedicated
  `P06-acknowledged-committed` case records that failure; working committed packs
  receive their prefix through an actual sync receiver.
- The no-metadata recovery case adds exactly `meta.historyStats` to its main
  checkpoint when the old reader flushes. Baseline comparison allows only that
  captured addition, while preserving its embedded state and all history bytes.
  The strict upgrade phase must preserve the original source and write its new
  cache separately.
- Hydrating P07 scene checkpoints refreshes `meta.historyStats.draftCount`
  from 2 to 1, with `committedCount: 0`, `latestCommittedId: 0`, and
  `latestDraftClock: 2` unchanged. The baseline permits only that exact metadata
  change, never embedded state loss. Resolved project/runtime supplements are
  captured from the pinned previous reader without rewriting original oracles.
- Warm checkpoint JSON round trips omit some undefined fields (P09 layout
  `isFragment`). Resolved expectations preserve the old reader's exact result
  for each phase instead of masking the difference.

Do not count passing these baseline checks as implemented strict validation.
The model owner also has four adopted domain streams with source hashes and
exact sequential/batch comparisons; its original schema archives remain intact.
The browser runner uses isolated persistent profiles and verifies dump fidelity
for Blob/File values, typed buffers, sparse arrays, compound keys, ordered
properties, and advanced auto-increment generators before comparing projects.
Do not reconstruct old expectations from candidate output during later stages.
