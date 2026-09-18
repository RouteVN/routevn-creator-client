# Frozen project compatibility

Run `bun run test:project-compatibility` with Node 24+, Bun, and Playwright's
Chromium/WebKit dependencies. It runs comparator negative controls and real
SQLite/IndexedDB cold, warm, and cache-cleared opens against an independent
previous reader and the candidate. Missing captures or browsers fail the run.

`--prepare` reconstructs pinned client revisions using `git archive`, verifies
their source and lockfile, and gives each its own frozen dependency installation
under `/tmp/routevn-validation-baselines` (override `ROUTEVN_BASELINE_DIRECTORY`).
It needs those Git objects; CI checks out full history. Neither previous reader
imports the candidate's application modules or resolves its dependencies.

For a focused SQLite run:

```sh
node scripts/test-project-compatibility.js --fixture=P07
```

For a focused browser run:

```sh
node tests/projectCompatibility/browserRunner.mjs --engine=webkit --fixture=P01
```

The native harness replaces only the Tauri path/SQL driver boundary with Node's
SQLite driver. SQL, Insieme codecs, persistence, project compatibility checks,
model reducers, checkpoint loading, and scene projections are production code
from the selected checkout. This does not certify Tauri IPC or device binaries.
Browser tests use real IndexedDB in isolated contexts. Their in-process sync
server receives a UTF-8 byte-count API; the browser payload codec still runs its
normal Uint8Array path. No dependency source is modified.

The corpus contains 27 SQLite packs and 23 applicable browser packs. Browser
lanes use isolated persistent profiles: WebKit's private contexts reject Blob
storage even in a minimal reproduction. The dump self-test checks binary views
and offsets, Blob/File metadata, sparse arrays, dates, compound keys, ordered
objects and advanced auto-increment generators before trusting any comparison.

The authoring protocol uses actual old command sessions. Committed/mixed packs
receive an old sender's committed prefix through sync, then author any draft
suffix offline. The acknowledged-local-draft pack separately preserves the
observed old SQLite acknowledgment failure. Checkpoint and malformed-version
variants are explicitly fault-injected after old-writer capture.
Separate duplicate-committed-draft and obsolete-line-edit variants preserve
the previous reader's recovery results and original event bytes.

The oversized pack uses the old native initializer's direct-store bootstrap
conversion because the old live command session discards drafts above its
transport limit. Its browser counterpart tests reading that same supported
draft representation; it does not claim to exercise the web template initializer.

The portable IndexedDB dump records databases, stores, indexes, typed keys,
ordered properties, absent/undefined/null distinctions, binary/Blob values and
auto-increment generators. Restore bypasses command submission, then invokes the
normal project repository loader. Native comparisons check original raw payload
BLOB bytes and SQLite storage types. Recovery-source values are checked as well;
disposable caches and SQLite file bookkeeping are not source history.

One baseline-only equivalence is deliberately narrow: opening
`P07-recovery-no-meta-draft` in the previous reader adds exactly the recorded
`historyStats` metadata to its main checkpoint. No change to the embedded state
is permitted. Strict upgrade tests must also assert that their new policy caches
leave the original source value untouched.

Runtime oracles exercise the real export projection and Route Engine's logical
initial dialogue/next-line behavior. They preserve the old availability/error
outcome, including unsupported legacy content. They do not certify graphics,
asset decoding, packaged players or native platform execution. The media packs
contain a generated PNG, generated PCM audio, and an OFL font; the remaining
model-derived resource fixtures intentionally retain their old placeholder
metadata and do not claim complete playable asset packages.

Reports include fixture identity, first mismatch, raw-row differences, phases,
and cold/warm time and memory measurements. Set
`ROUTEVN_COMPATIBILITY_ARTIFACTS` to retain them in a chosen directory. Failed
native runs retain disposable databases; successful native runs retain their
report only. Failed browser runs retain the actual database dump and persistent
profile. CI uploads reports, executable browser bundles, and failure artifacts.

## Capturing or extending the corpus

Expected results are written only by the pinned previous reader. Regular tests
never update fixtures. `--capture` adds missing packs and refuses to overwrite
existing captures. `--capture-runtime` adds old-runtime observations only after
checking that the existing state oracle and source records still match.

```sh
node scripts/test-project-compatibility.js --prepare --capture --capture-runtime
node tests/projectCompatibility/browserRunner.mjs --capture --engine=chromium
node tests/projectCompatibility/packFixtures.mjs
```

Lossless gzip packaging retains original uncompressed hashes in each manifest.
Never bless candidate output or edit frozen historical data to satisfy a new
validator. Add a new variant with its provenance instead.

This suite is a pre-validation baseline. It does **not** implement or certify
strict schema dispatch, new-write rejection, upgrade edits, backup/restore,
acceptance concurrency, or reader/writer release gates. Those remain separate
requirements in `docs/validation-preparation/legacy-project-test-plan.md`.
