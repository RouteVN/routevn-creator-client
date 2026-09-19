# Strict validation implementation and release status

Updated September 19, 2026. Implementation branch: `feat/strict-schema-validation`.

The domain validator and client acceptance path are implemented. Production
activation is **pending**, not delivered: the client still pins creator-model
`1.15.0`, Insieme `2.1.1`, and route-engine-js `1.46.1`. No package publication,
application release, deployment, or dependency patch was performed.

## Owning changes

| Repository     | Change                                                                                                                                                                                                                             | Review                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Creator model  | Schema 16 version dispatch; raw JSON, size/work limits, closed payloads, action contracts, expressions, references and affected-state transition validation; historical contracts retained                                         | [PR 80](https://github.com/RouteVN/routevn-creator-model/pull/80) |
| Insieme        | Opt-in original driver schema versions and reader capability across SQLite/libSQL/async SQLite/IndexedDB; exact new-version writes; configurable command-session batch limits                                                      | [PR 42](https://github.com/yuusoft-org/insieme/pull/42)           |
| Route Engine   | Explicit literal object/array variable values, preserving existing expression behavior                                                                                                                                             | [PR 351](https://github.com/RouteVN/route-engine/pull/351)        |
| Creator client | Versioned codec, complete accepted project state, serialized validation/persistence/reconciliation, guarded public store APIs, sync ingestion, recovery/cache policy, native and browser ownership, UI outcomes, integration tests | This branch                                                       |

Model domain fixtures remain in the model repository. The client's frozen old
project archive and previous-reader oracles were not regenerated or modified.
The earlier legacy-domain adoption remains in merged
[model PR 79](https://github.com/RouteVN/routevn-creator-model/pull/79); its original
seed and expected bytes remain unchanged.

## Implemented client behavior

New commands receive envelope version 2 and model version 16 inside the acceptance
service. Callers cannot supply a legacy version or storage envelope. Raw values are
validated before cloning; a complete logical batch is checked before writing.
The complete project state includes inactive scenes. Browser Web Locks serialize
operations across tabs; native OS locks reserve editing for one application
window/process and the local queue covers refresh, validation, persistence and
publication. Network waits are outside that queue.

Both committed batches and submit acknowledgements validate the resulting ordered
history before changing it. Exact retries preserve identity; missing committed
ranges trigger resynchronization. Failed writes are reconciled against actual
storage: full persistence succeeds once, a contiguous prefix returns
`partial_write`, and unreadable or inconsistent outcomes pause writes. Failed save
results retain `retryRequests` with original IDs and payloads, also retained by the
collaboration session's last error. Callers must use those requests for retry;
there is no automatic retry with new identities.

Historical rows keep their recorded contracts. Checkpoint-backed projects retain
the previous reader's resolved state and original recovery sources. First strict
edits are preflighted against replayable history. Disposable accepted-state caches
use a separate policy namespace, preserve legacy own-undefined values, and require
content fingerprints plus provenance held outside exported project storage.
Cache failure after a successful save shows a rebuild notice; it does not report
the save as lost. Partial and uncertain saves use separate localized notices.

## Executed verification

These results used the owner feature branches through ordinary local `file:`
dependencies in an isolated client checkout. Published pins in the main working
tree remain unchanged. No installed dependency sources were edited.

| Check                     | Result                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Model complete suite      | 4,652 passing tests, including 126 strict cases and metadata-downgrade negative controls                                   |
| Insieme complete suite    | 335 passing tests across 36 files; type checking and lint pass                                                             |
| Engine complete suite     | 2,182 passing tests, including 20 literal-value cases; lint and build pass                                                 |
| Client strict suites      | Codec, acceptance, authority, cache integrity, actual SQLite recovery/bootstrap/sync and public authoring integration pass |
| Strict browser acceptance | Chromium and WebKit pass: two competing tabs, actual IndexedDB/Web Locks, invalid-batch zero writes, exact retry, reload   |
| Frozen native corpus      | 162 previous/candidate cold/warm/cache-cleared checks pass                                                                 |
| Frozen browser corpus     | WebKit corpus passes; Chromium cases pass across the full run and a successful P10 rerun after an environment interruption |
| Existing client checks    | Smoke, collaboration adapters, lint/format pass                                                                            |
| Native ownership          | Rust and Java ownership tests pass, including actual competing child processes; Tauri `cargo check --lib --offline` passes |

Run the client checks after consuming the owner packages:

```bash
bun run test:strict-validation
bun run test:strict-browser
bun run test:strict-browser --webkit
bun run test:project-compatibility
bun run test:smoke
bun run test:collab-adapters
bun run lint
```

CI now requires strict tests as well as the frozen compatibility gate. The strict
suite deliberately fails with the old production dependency pins; it cannot
silently claim schema-16 coverage using schema 15. Keep the client PR in draft
until normal published dependencies can be pinned and this job passes.

For local validation, use a separate checkout and normal `file:` dependencies
pointing to the three owner checkouts; install with Bun and build the engine.
Do not commit these development pins, edit `node_modules`, rewrite historical
fixtures, or replace frozen expected results to make the gate pass.

## Remaining release gates

1. Review/merge and publish the model, Insieme and engine packages, then update the
   client package pins and lockfile through the package manager. Verify all runtime
   bundles and export/player targets consume the new engine.
2. Complete the reader-first release/rollback sequence in
   [upstream and rollout](./upstream-and-rollout.md#5-reader-first-delivery).
   Model availability activates this branch's strict authoring path; do not ship
   its dependency upgrade ahead of the supported reader rollout.
3. Build and exercise Android and iOS native bridges on devices, including opening
   the same project twice and renderer reload. Java process-lock tests are not an
   Android application build. This Linux environment has no Xcode/iOS toolchain;
   no device refresh or iPhone verification was completed.
4. Complete the broader release acceptance matrix for UI authoring surfaces,
   import/export/backup, runtime targets and large-project performance. The tests
   above substantiate their named paths; they do not imply every platform or UI
   branch has been exercised.

Expected user impact after activation: invalid new edits are rejected before they
reach project history, old projects remain readable through their original
contracts, competing writes are coordinated, and storage failures report what
actually persisted. This is not a migration or a cleanup of old content. Before
activation, the published dependency pins keep existing authoring behavior.
