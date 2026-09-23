# Strict validation implementation and release status

Updated September 21, 2026. Implementation branch: `feat/strict-schema-validation`.

The strict model and client acceptance path are implemented. Production activation
is **pending**. The client pins creator-model `1.15.0`, Insieme `2.1.2`, and
route-engine-js `1.46.1`. Insieme is now a normal published dependency; the strict
model release is still pending. No dependency patches or development pins are
committed, and no application release or deployment has been performed.

**Compatibility blocker:** Insieme 2.1.2 rejects malformed historical schema
versions that its previous reader accepted. Frozen P08 projects containing `1.5`
and `"1junk"` fail candidate opening with `invalid_schema_version`. Their original
rows and previous-reader expectations remain unchanged. This conflicts with the
approved old-project compatibility policy and must be resolved before merging.

## Owning changes

| Repository     | Change                                                                                                                                                                | Review                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Creator model  | Schema 16 dispatch; bounded JSON, closed payloads, action contracts, expressions, references and affected-state validation; historical contracts retained             | [PR 80](https://github.com/RouteVN/routevn-creator-model/pull/80) |
| Insieme        | Published 2.1.2: exact numeric schema versions on writes and storage reads, configurable command-session batch limits                                                 | [Merged PR 42](https://github.com/yuusoft-org/insieme/pull/42)    |
| Creator client | Versioned codec, complete accepted state, serialized validation/persistence/reconciliation, sync ingestion, recovery/cache policy, platform ownership and UI outcomes | This branch                                                       |

The proposed literal-object feature is removed from this work. Object assignments
retain the existing representation and interpolation. Re-saving an action does
not add `valueMode`; strict validation rejects that unknown operation field. The
engine stays at `1.46.1`; [engine PR 351](https://github.com/RouteVN/route-engine/pull/351)
is deferred and is not a release prerequisite.

Model domain fixtures remain in the model repository. The client's frozen old
project archive and previous-reader oracles are unchanged. The earlier
legacy-domain adoption is in merged
[model PR 79](https://github.com/RouteVN/routevn-creator-model/pull/79).

## Implemented client behavior

New commands receive envelope version 2 and model version 16 inside the acceptance
service. Callers cannot select a legacy version or storage envelope. Raw values
are checked before cloning; a complete logical batch is checked against complete
project state, including inactive scenes, before writing.

Browser Web Locks serialize operations across tabs. Native OS locks reserve editing
for one window/process, and the local queue covers refresh, validation, persistence
and publication. Network waits remain outside that queue.

Committed batches and submit acknowledgements validate the resulting ordered
history before changing it. Exact retries preserve identity. Failed writes are
reconciled against actual storage: full persistence succeeds once, a contiguous
prefix reports `partial_write`, and unreadable or inconsistent outcomes pause
writes. Failed saves retain original retry IDs and payloads; there is no automatic
retry with new identities.

Accepted-state caches use a separate policy namespace, preserve legacy
own-undefined values, and require content fingerprints plus provenance outside
exported project storage. Checkpoint recovery sources are preserved. Cache failure
after a successful save reports a rebuild notice, not a lost save. Partial and
uncertain saves have separate localized notices.

Insieme 2.1.2 validates driver schema versions itself. Its released API has no
raw-version option or reader-capability flag; the client uses its exact numeric
versions. This removes the obsolete development-only API checks, but does not
resolve the historical P08 incompatibility described above.

## Executed verification

September 21 checks use published Insieme `2.1.2` and engine `1.46.1`. Strict client
tests use the model owner checkout through a normal `file:` dependency in an
isolated development checkout. No custom model import resolver is required.

| Check                         | Result                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Model complete suite          | 4,669 passing tests, including 143 strict cases                                                                                                  |
| Client strict suites          | 75 passing tests: codec, acceptance, authority, caches, SQLite recovery/bootstrap/sync and object re-save/runtime behavior                       |
| Existing engine behavior      | Nested object/array templates and whole-object bindings retain their results through editor re-save and envelope round trips using engine 1.46.1 |
| Strict browser acceptance     | Chromium and WebKit pass: two tabs, actual IndexedDB/Web Locks, invalid-batch zero writes, exact retry and reload                                |
| Frozen P07 recovery cases     | All three projects pass previous/candidate cold, warm and cache-cleared comparisons with source preservation                                     |
| Frozen P09 cached projects    | Committed, draft and mixed histories pass previous/candidate cold, warm and cache-cleared comparisons                                            |
| Frozen P08 malformed versions | FAIL: previous reader opens; candidate throws `invalid_schema_version`                                                                           |
| Existing client suites        | Smoke, integration, convergence, collaboration adapters, five Puty storage cases and client lint/format pass                                     |

The earlier September 19 verification included a passing full frozen native/browser
corpus and native Rust/Java ownership tests, plus Tauri library checking. Those
runs used the earlier Insieme development API and **do not establish compatibility
for 2.1.2**. Native/device code did not change in this follow-up.

Run after consuming the published strict model, or in a separate development
checkout with only the model dependency pointing to its owner checkout:

```bash
bun run test:strict-validation
bun run test:strict-browser
bun run test:strict-browser --webkit
bun run test:project-compatibility
bun run test:smoke
bun run test:collab-adapters
bun run lint
```

The strict suite deliberately fails with model 1.15.0; it must not claim schema-16
coverage through historical validation. Keep the client PR in draft until a normal
published model version is pinned and the required CI gates pass. Do not commit
local `file:` pins, edit `node_modules`, or rewrite frozen fixtures/oracles.

## Remaining release gates

1. Resolve the Insieme 2.1.2 old-project compatibility failure without weakening
   the frozen P08 expectations. No silent repair or legacy data migration is part
   of this validation change.
2. Merge/publish the model change and consume its normal package release. Follow
   the [reader-first rollout](./upstream-and-rollout.md#5-reader-first-delivery)
   before activating strict authoring. No engine release is required.
3. Exercise the Android/iOS native bridges on devices, including competing opens
   and renderer reload. Earlier Java/Rust tests are not device verification; this
   Linux environment has no Xcode/iOS toolchain.
4. Complete the wider UI, import/export/backup, runtime and large-project release
   matrix. The named checks above do not imply all platform paths were exercised.

Intended user impact after activation: invalid new edits are rejected before
history changes, existing game behavior is preserved, competing writes are
coordinated, and save failures report what actually persisted. Old-project
availability remains a release requirement, currently blocked by the P08 failure.
