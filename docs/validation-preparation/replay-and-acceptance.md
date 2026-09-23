# Replay and acceptance contract

Status: implementation specification only. No locks, readers, reducers, or
submission paths described here have been implemented by this preparation.

This resolves the integration decisions in sections 8, 10, and 12 of the
[main specification](../command-schema-validation-spec.md). It applies to the
local app; the sync section applies only if its existing transport is configured.

Compatibility requirement: a legacy project that opens with the previous
reader must still open with the same recovered state and availability. The
new authority, caches, and checks below must preserve its existing legacy
normalization and recovery behavior. New strict validation gates new commands
and recorded envelope-2 history. Additional blocking legacy integrity checks
are outside this feature; see section 1.1 of the main specification.

## 1. One owner of accepted project state

The shared project repository service owns one acceptance coordinator per
canonical storage reference. Extend the existing
[projectRepositoryService](../../src/deps/services/shared/projectRepositoryService.js)
and [projectRepositoryRuntime](../../src/deps/services/shared/projectRepositoryRuntime.js)
responsibilities. Keep platform lock and database operations in clients; keep
model rules in the creator-model package. Do not create a second domain reducer.

The coordinator owns the materialized domain state, its source frontier, supported
validation policy, and its submission queue. This state includes all scenes
and referenced resources. UI projections remain separate views of that state.
A partially loaded scene projection never authorizes a command.
For an existing recovery project, materialize the state returned by the
existing legacy loader; this is not a new requirement to prove all original
source data exists. Missing-source cases retain section 9's compatibility
behavior. A failed new edit does not make that legacy project unloadable.

Every UI command, draft flush, direct session submission, bootstrap, import
command plan, and configured sync mutation enters this coordinator. The raw
store is private to its storage adapter and ingestion adapter. Existing
command APIs compose requests and deliver results; they stop independently
applying commands after a session has accepted them.

Trusted UI composition extracts domain fields before entering this boundary.
For example, editor-only display metadata and absent optional values do not
belong in a domain request. This is explicit composition in each emitter,
not a generic sanitizer which discards unknown external input.

## 2. Canonical history and historical dependencies

The canonical order remains:

1. Committed records ordered by increasing `committedId`.
2. Remaining local drafts ordered by increasing `draftClock`, with id as the
   existing deterministic tie breaker.

No timestamp order is introduced. Acknowledgment/promotion can change the
committed/draft boundary; it must therefore recompute the affected suffix.
Exact duplicates refer to one event identity, not two applications.

A history frontier records project/storage identity, committed count and final
id, draft count and final clock, plus an ordered record digest. The digest
covers the event identity, ordering identity, partition, type, envelope version,
and complete payload with its semantically significant object enumeration
order. Build a fixed-order tuple of outer identity/order/partition/type/envelope
and decoded model-version fields, followed by order-preserving JSON of the
domain payload. Use deterministic `JSON.stringify` semantics for parsed JSON
values, including its standard integer-key enumeration; do not sort payload
dictionaries. Hash UTF-8 length-delimited records with SHA-256, never ambiguous
concatenations. Count/max statistics are a quick freshness check, not a
substitute for an exact source-prefix check on reopening/import.

Insieme's existing identity comparison sorts object keys, which is insufficient
for Creator data such as indexed clips using `Object.keys(atlas.frames)`.
Creator must additionally enforce the order-preserving comparison before a
same-id submission, incoming batch, or acknowledgment involving envelope 2
reaches the raw store. Legacy-only duplicate/recovery decisions retain the
existing behavior and must not acquire a new project-open failure.
Outer wrapper property order can be ignored because its two metadata fields
are reconstructed into the fixed fingerprint tuple; domain payload order is
preserved. This deliberately rejects a reordered same-id domain payload even
where a particular field set is otherwise order-insensitive. Exact retries use
the original stored payload rather than rebuilding it in another key order.
No existing payload is reordered, and no Insieme protocol/canonicalizer change
is required for this application-level guard.

For an ordinary complete history, decode each record once, then replay in this
order from the original bootstrap. For each strict command, use the complete
state immediately before it. Legacy commands retain their existing compatible
model/recovery rules. A strict failure ends authoritative loading; it cannot
be treated as an obsolete scene event or a duplicate resource to skip.

The initial implementation uses this complete chronological replay as its
authority. It does not construct historical scene state on top of current
resource state. UI scene, main, overview, and text-stat views project from an
already accepted authority state. A later optimization must demonstrate the
same historical dependencies and results using the fixture corpus.
This refactoring must reproduce the previous reader's legacy recovery and
skip decisions. A strict chronological reducer alone is not sufficient if it
rejects legacy history that the existing reader recovered. Preserve that
compatibility before introducing strict suffix checks; a strict failure can
never select the legacy recovery path.

The resource lifecycle regression is exact: create Image X, assign X to a
line, clear the assignment, delete X. The historical assignment sees X; the
final state does not contain X. The same principle covers changed variable
types and scene/section ownership.

## 3. Same-identity moves and reference impact

Future cross-scene section moves use the existing model `section.move`
command against complete state. That reducer moves the section subtree and
its existing lines with their identities and content. Replace the current
[delete/move/recreate emitter](../../src/deps/services/shared/commandApi/story.js)
for new moves; keep its historical commands replayable exactly as recorded.

This is relocation, so unchanged historical line actions are not new line
creation. Actual copy/duplicate operations introduce new content and must
validate it strictly. Do not disguise a copy as a move to avoid validation.

For moves, resource deletion, and variable type/permission changes, inspect
supported references whose target or context changes. If a previously valid
reference would become invalid, reject the command with its referring path.
An already invalid unrelated legacy reference does not block the operation.

The first strict contract does not automatically rewrite referencing actions.
An explicit repair sequence can clear the affected reference, move/change its
target, and author a valid replacement. Each intermediate command must satisfy
its own transition rules. This avoids undocumented cleanup of legacy fields.

## 4. Acceptance operation

Use the following order for every new submission, including a batch:

1. Check request shape and outer input limits; capture the canonical project
   reference. Allocate stable command identities once, or resolve an exact
   retry against the original stored identity. External callers cannot select
   envelope/model versions or submit storage wrappers.
2. Enter the project queue and acquire per-operation coordination described
   below, under the native session owner where applicable. Do not hold the
   operation queue or Web Lock while awaiting a file picker, user input, or a
   network response. The native ownership lock remains held for the editable
   session. Required local domain data must be loaded
   before final validation; a new import's necessary resource creation is
   represented in its command plan.
3. Read the current stored frontier while coordinated. Refresh/rebuild the
   complete authority if another writer or ingestion changed it. A stale UI
   preflight is discarded. A switched project reference returns a stale-context
   error rather than redirecting the write to the new project.
4. Attach the current model version internally. On a working state, process
   the whole batch in order through the versioned model: payload, preconditions,
   affected result, and compatible state checks. Any validation failure means
   no inserted rows for this request.
5. Encode each accepted descriptor once as envelope 2 with `{ mv,
commandPayload }`. Persist using the existing draft destination and actual
   adapter semantics. Verify duplicate identities against the complete original
   comparison content; an id collision with different content is an error.
6. Advance the coordinator's accepted state to the state represented by the
   rows actually persisted. Publish that revision to repository subscribers
   before releasing the project queue. No caller applies it a second time.
7. Save disposable checkpoints after acceptance. A checkpoint write failure
   cannot undo an accepted command; it marks caches stale and is reported as
   such. Release per-operation coordination in all completed/error paths;
   retain native session ownership until its orderly teardown.

A renderer may show an unsaved draft while this runs. It must not report that
draft as accepted/persisted until step 6 succeeds. Network delivery follows
local acceptance and does not hold the local write lock.

## 5. Platform coordination decisions

There are two levels of coordination: the project operation queue (and the
Web Lock covering that operation), and native session ownership. Ending or
deferring an operation releases the former. It does not release the native
OS lock, including while the app waits for a network gap, is suspended, or
reconciles an uncertain write. Native ownership ends only after outstanding
operations are settled/reconciled and the editable session is torn down, or
the owning process exits.

All coordinating keys use canonical storage identity, not a mutable display
name or merely a potentially duplicated project id. Locks do not store model
versions or introduce SQLite tables/columns.

| Platform      | Chosen coordination                                                                                                                                                     | Lifetime and contention                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Web/IndexedDB | Exclusive Web Lock named `routevn:accept:` plus the actual IndexedDB database name                                                                                      | Hold across refresh, preflight, insertion, and accepted-state advancement; release when the asynchronous operation settles |
| Tauri desktop | A native owner holds an exclusive OS lock on `project.acceptance.lock` beside the canonical project database; a shared project queue serializes that owner's operations | Hold for the editable project session; a second process opens the project read-only until the owner closes it              |
| Android       | The native project owner holds the same per-project lock-file contract using `FileChannel.tryLock`; the native bridge routes that owner's operations through one queue  | Hold for the editable project session; close/release on project teardown, with OS cleanup on process exit                  |
| iOS           | The native project owner holds the lock-file contract using `flock(LOCK_EX \| LOCK_NB)`; scene/webview requests share the same owner                                    | Hold for the editable project session; another native owner cannot write concurrently                                      |

Web Locks coordinate participating contexts in the same storage bucket and
hold the lock until the returned promise settles. This covers the app's tabs
and workers sharing that IndexedDB store. Capability detection happens when
opening the editor; if unavailable, retain read/export access and report that
safe editing is unavailable instead of substituting an in-memory-only mutex.
See the [Web Locks specification](https://www.w3.org/TR/web-locks/).

Desktop can use `std::fs::File::try_lock` in the repository's Rust toolchain;
the standard library supplies the platform-specific locking operation. Android
and iOS use the platform methods named above. These mechanisms are native
implementation work, not capabilities already provided by today's adapter.
See [Rust File locking](https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock),
[Android FileChannel](<https://developer.android.com/reference/java/nio/channels/FileChannel#tryLock()>),
and [Apple flock](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/flock.2.html).

The native lock file contains no project data. Keep its inode/file identity
stable; never unlink it while another owner could hold it. Exclude it from
project backups. Its mere existence does not indicate ownership; the OS lock
does. Native handles/tokens are bound to their owning project session and
cannot be reused after teardown. Serialize same-process callers as well,
because native file locks alone are not a JavaScript execution queue.

Do not steal a lock using a timeout. A suspended writer has not surrendered
ownership. On renderer loss, finish or reconcile outstanding native writes
before making the project writable through a new renderer. Mobile background
sync, if later configured, must use the same native owner.

Every supported writer must participate. This feature does not retrofit locking
into already released old binaries or coordinate independent copies of a
database on different devices. Tests must use actual competing tabs/processes,
not two promises sharing one in-memory mutex.

## 6. Partial and unknown storage failures

Validation atomicity is mandatory. Native disk transaction atomicity is not
assumed: current native batch insertion can consist of individual writes.

| Observation after an insertion error                | Required result                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| None of the requested identities exists             | Reject the write; keep the previous accepted state                                                                       |
| Every identity exists with exactly matching content | Recover acceptance once; do not insert/reapply duplicates                                                                |
| Only a contiguous prefix exists and matches         | Advance authority to that prefix; return `partial_write` with persisted and unpersisted ids                              |
| Any identity exists with different content          | Return `command_identity_conflict`; do not overwrite it or continue the batch                                            |
| Storage cannot determine what persisted             | Return `write_outcome_unknown`; pause further acceptance until reopening/reconciliation establishes the frontier         |
| Unexpected non-prefix subset exists                 | Reconstruct from actual history and report an explicit integrity/reconciliation failure; never assume the planned prefix |

Reconciliation occurs under the same coordinator before another request can
validate. Preserve the caller's original identities for any retry. A failed
request must not trigger an automatic retry with new ids. On process restart,
stored history is the source of truth; an in-memory promise outcome is not.

Read the actual attempted identities across committed records and local drafts
in canonical history order, comparing recorded versions and complete payloads
with the applicable identity policy. The last row or latest timestamp alone
does not establish the outcome. For A → B → C, matching A/B means acceptance
through B with C unsaved; matching A/B/C means success even if acknowledgment
failed; no matching records means the previous accepted state remains. A gap,
conflict, or unreadable outcome pauses new writes until reconciliation can
establish the accepted history. Retry remaining commands with their original
IDs against the refreshed state; do not replay the saved prefix twice.

UI/API results must distinguish validation failure from partial or unknown
persistence. The first can truthfully say nothing was saved. The latter must
identify the persisted/uncertain commands and retain the unsaved draft for
recovery. Stable localized UI messages wrap these structured service outcomes.

## 7. Configured sync ingestion and acknowledgments

The same coordinator wraps both `applyCommittedBatch` and `applySubmitResult`
before passing data to Insieme's raw store. `onCommittedCommand` is a
notification after this gate, not an independent validation path.

For an incoming batch, verify record shape/version/identity and construct the
candidate committed order plus remaining local drafts. Evaluate any changed
suffix from its correct preceding state. Only then allow the underlying store
to insert rows, advance its cursor, and remove matching drafts. Do not advance
the cursor past an unvalidated or missing dependency range.

For acknowledgment promotion, load the exact stored draft and preserve its
envelope version and complete payload. Validate the response identity/status,
construct the proposed committed record, and evaluate its effect on history
ordering. An acknowledgment arriving before its broadcast is handled exactly
once. If prior history is missing, obtain it before completing acceptance;
keep the draft and current cursor while waiting. Do not wait for that network
fetch while holding the operation queue or Web Lock. Native session ownership
remains held; resume through a fresh coordinated operation after the fetch.

An exact known legacy retransmission/promotion retains envelope 1. Unseen
live envelope-1 input cannot claim historical provenance merely by supplying
that version. An explicit supported history transfer may introduce historical
records under its declared compatibility operation; arbitrary authoring cannot.

A protocol rejection that would remove a draft must also reconcile the
remaining overlay before publishing a result. If dependent strict drafts fail,
surface that conflict and preserve recovery data; do not feed it into a
skip-invalid-drafts loop. Invalid/unsupported response data must never delete
the original draft. No new quarantine table or server is prescribed.

## 8. Disposable checkpoints for complete histories

Use new validation-policy view names for the new main/scene/overview/text-stat
caches, stored through the existing checkpoint table/store. Distinct names
prevent new writers from overwriting retained legacy recovery sources described
below. View names and policy version must be centralized with the existing
view constants; they are unrelated to `mv`.

The new main checkpoint records the validated source frontier/policy and a
manifest of scene checkpoints, including each scene's source revision and
order-preserving content digest, using the same JSON enumeration policy above.
A scene unchanged by later accepted commands may retain its
earlier value; the authority's manifest certifies its relevance at the current
frontier. Resource/ownership changes invalidate all affected projections, not
only the partition named by the command.

Write changed scene caches before the main manifest. Verify the complete
manifest when composing a warm authority. A crash between cache writes causes
a mismatch and chronological rebuild, never a mixture presented as accepted
state. Imported ordinary-project caches are discarded even if their metadata
claims the current policy. On app reopen, verify the ordered source digest and
all represented envelope/model versions before reusing cached validation.

Cold rebuilding reads records in bounded pages and yields between model replay
chunks for UI responsiveness. It holds complete domain state, not binary media
assets or all historical state versions. Checkpoint failure/deletion changes
loading cost, not the result. Benchmarks during implementation must cover the
captured templates/corpus and a generated long history; do not claim performance
measurements from this documentation work.

These cache proofs cannot become new integrity gates on original legacy
sources. If a legacy-only project currently opens through its existing cache
or recovery path, preserve that result. Discarding a new-policy cache does
not authorize discarding an original source or requiring a stricter legacy
rebuild before opening the project.

## 9. Existing checkpoint-backed recovery projects

There is an existing exception to the claim that every checkpoint is disposable.
The [Tauri store](../../src/deps/services/tauri/collabClientStore.js) accepts a
draft-only project missing `project.create` when its main checkpoint matches
current history. That checkpoint can contain state absent from command history.
Deleting it as part of a blanket cache-version bump would lose existing recovery
capability.

For this already supported case, preserve the original legacy main and scene
checkpoint rows in place, with their original bytes and metadata. Do not write
a replacement bootstrap, rewrite historical commands, or construct a cleaned
starting state. New policy caches use different view names, so these original
recovery sources are not overwritten.

The original main checkpoint's matching history statistics establish the legacy
draft cutoff. Existing recovery also accepts a checkpoint without those metadata
when `lastCommittedId` equals the draft-only history length. Preserve that case:
the first N original ordered drafts, where N is that revision/count, establish
the baseline prefix. Capture its actual ids/clocks and digest in new policy
metadata without modifying the original checkpoint. Require envelope 1 for
this pre-feature prefix; a strict record cannot be hidden inside an unvalidated
legacy baseline.

After strict suffix writes, compare the original checkpoint with that retained
ordered prefix, not the current total history length. If all new policy caches
and their metadata are deleted, derive the same cutoff again from the original
checkpoint's statistics or N-record revision and the original rows. The
current compatibility helper's whole-history comparison cannot be reused
unchanged for this suffix case. For example, an original cutoff of one legacy
draft remains one after a second strict draft is added.

Verify the strict suffix boundary and reconstruct the baseline using the
existing legacy recovery logic and available original scene checkpoints.
Materialize the state that the existing reader resolves, without adding a
complete-source proof requirement. Then replay the suffix after that cutoff
using each command's recorded contract. The baseline stays legacy-compatible;
every new suffix command is strict.

The raw legacy prefix and recovery-source checkpoints must remain intact in
backup/import. For these projects, deleting **new disposable caches** remains
safe; deleting the original recovery sources is not a supported cache reset.
The whole-project import compatibility path retains this exception and must
not mistake the retained recovery data for strict-validation proof.

Recognize this path using the existing missing-bootstrap, draft-only recovery
conditions. It is not an API for injecting a new unversioned full state. Do
not add a new completeness gate: when the previous reader opens despite a
missing scene checkpoint, this feature must preserve that same state and
opening/editing/preview/export availability. In particular, the captured
legacy loader's zero-line result remains a compatibility observation; it must
not be changed into a blocking `recovery_data_incomplete` error by this work.

That result does not certify that the original story was empty or complete.
Retain every available source row in place; never replace the sources with
the recovered projection or a cleaned bootstrap. New blocking completeness
checks, warnings, and repair UX are separate work. Existing failures stay
failures; no additional legacy acceptance or automatic repair is introduced.

Validate each new edit against the resolved legacy-compatible state and its
affected dependencies. An invalid edit is rejected before persistence while
the recovered project remains open and usable. A valid edit is envelope 2;
on reload, resolve the legacy baseline with the same historical rules and
replay that strict suffix at its original position. Missing or invalid strict
suffix data must still fail explicitly; it cannot be skipped as legacy recovery.
Such projects remain local-only, matching the current native session behavior;
syncing a history without its bootstrap requires a separate explicit repair
design. This exception adds no history generation or SQL schema change.

## 10. Required integration proofs

- Two simultaneous creates for the same resource id produce one accepted
  create; the second checks the first's accepted state and fails normally.
- A line created by one request is immediately available to the next queued
  edit, including a direct-session caller.
- Full chronological, warm-cache, draft-only, and lazy UI loading agree for
  resource use/clear/delete and section ownership changes.
- A same-identity section move retains legacy actions without creating new
  lines; a duplicate with the same legacy content is strictly checked.
- Failure after native insert N publishes exactly the persisted prefix and
  reconciles before accepting N+1 from another request.
- A crash after insertion but before notification produces no duplicate after
  reload/retry with the original ids.
- Reversing two `atlas.frames` property entries with the same envelope-2 command id is an
  identity conflict even though Insieme's sorted-key comparison would match;
  cold/warm state checks retain the selected frame order as well.
- Acknowledgment-before-broadcast, duplicate acknowledgment, and a gap in
  received history neither double-apply commands nor erase unvalidated drafts.
- Two browser tabs and two native processes demonstrate actual coordination;
  project switch, background/suspension, and process death preserve ownership.
- A checkpoint-backed legacy recovery fixture remains readable/editable under
  the preserved-baseline rule; reset of new caches retains its original sources.
- The missing-scene variant retains the previous reader's resolved state and
  availability, with no new completeness error. Valid new edits persist as
  envelope 2 and survive reload; invalid new edits add no rows and leave the
  project usable. Original source rows remain unchanged in both cases.
- Existing legacy draft-skip, duplicate/resource recovery, and supported raw
  legacy version representations retain their previous reader outcomes.
  Equivalent strict failures remain blocking and preserve their stored rows.

These are implementation tests to add using the captured fixture specifications,
not tests claimed to pass against code that has not been written.
