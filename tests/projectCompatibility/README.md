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

Baseline-only metadata equivalences are deliberately narrow: opening
`P07-recovery-no-meta-draft` in the previous reader adds exactly the recorded
`historyStats` metadata to its main checkpoint. Hydrating existing P07 scene
checkpoints refreshes only `historyStats.draftCount` from 2 to 1; the other
counts remain exactly `committedCount: 0`, `latestCommittedId: 0`, and
`latestDraftClock: 2`. No change to embedded state or other metadata is permitted.
Negative controls reject both lost content and any different count update.
Strict upgrade tests must assert that their new policy caches leave the original
source value untouched.

Native observations compare the opened repository's resolved `getState()`
projection, hydrating each scene found there through `setActiveSceneId()` and
combining those scene snapshots before preview/export. `loadState()` remains a
separate history-only observation: it returns an empty project for P07 even
though checkpoint recovery restores two scenes. The complete recovery cases
freeze the restored "First"/"Second" dialogue; the missing-scene variant freezes
its partial recovery. Negative controls detect missing scenes, missing/reordered
lines, and changed runtime dialogue even with unchanged history and source bytes.

Each pack's supplemental `opened-repository.manifest.json` binds the new resolved
state/runtime oracle to the pinned previous reader and original source manifest.
Cold, warm, and cache-cleared observations are captured separately: the old
checkpoint JSON round trip can omit undefined fields (for example P09 layout
`isFragment`). Those differences are frozen per phase, never normalized away.
The original history-only state/runtime oracles remain unchanged and checked.

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

## Archive format and automatic extraction

Commit `tests/fixtures/legacy-projects.zip` and
`tests/fixtures/legacy-projects.manifest.json` in ordinary Git. The ZIP is marked
binary in `.gitattributes`; Git LFS is not required. The initial archive is
about 1.63 MiB and contains all 319 previously expanded files without changing
any bytes. The recovery-observation extension adds 54 supplemental files (373
total); all 319 originals remain byte-identical. Existing gzip members and
license/source files remain intact.

The readable manifest lists fixture IDs, origin/fault labels, writer and
previous-reader identities, platform coverage, and every file's SHA-256 and
size. Review this manifest alongside recipe/harness changes; an opaque binary
diff alone is not evidence that a baseline update is correct.

All regular entry points—including focused browser runs and comparator unit
tests—automatically verify and extract the ZIP. Extraction goes to
`<system temporary directory>/routevn-fixture-cache/<archive-sha256>`; override
its parent with `ROUTEVN_FIXTURE_CACHE`. The cache is outside the working tree
and is disposable. The archive hash, inventory, and every extracted file are
verified on every invocation, including cache hits. Missing/corrupt files fail
instead of being silently trusted. Delete a damaged cache directory and rerun
to extract it again. Test lanes make their own disposable copies.

Packing sorts paths, fixes ZIP timestamps and permissions/platform metadata,
and uses the installed JSZip compression implementation. Packing the same file
bytes with the pinned dependencies produces identical archive bytes regardless
of filesystem timestamps. No custom unzip program or download is needed in CI.
The tests cover deterministic output, exact extraction, simultaneous readers,
corrupt archives/caches, unsafe paths, and frozen-file preservation.

## Capturing or extending the corpus

Expected results are written only by the pinned previous reader. Regular tests
never update the ZIP or manifest. Capture commands require an explicit staging
location, separate from the verified cache:

```sh
node tests/projectCompatibility/unpackFixtures.mjs /tmp/routevn-fixture-staging
export ROUTEVN_FIXTURE_DIRECTORY=/tmp/routevn-fixture-staging
node scripts/test-project-compatibility.js --prepare --capture --capture-runtime --capture-opened
node tests/projectCompatibility/browserRunner.mjs --capture --engine=chromium
node tests/projectCompatibility/packFixtures.mjs /tmp/routevn-fixture-staging
bun run test:project-compatibility
```

Use a new staging directory each time. The unpack command refuses to overwrite
an existing directory. Add the new recipe in `recipes.mjs` before capture;
`--capture` adds missing packs without overwriting old ones. `--capture-runtime`
adds old-runtime observations only after checking state and source preservation.
`--capture-opened` adds missing resolved-state/runtime supplements from the
pinned previous reader for all three open phases. It first verifies the existing
history-only oracles and source preservation, and never overwrites a supplement.

Future updates **replace the ZIP and update the text manifest together**. The
packer verifies captured manifests and refuses to change or remove any file
listed in the previous archive manifest. Add a new labelled variant when a
case needs correction or extension; do not bless candidate output or rewrite
historical expectations to satisfy a new validator. Before committing, inspect
the text manifest diff and rerun the suite from the newly packed archive.
Staging files are not committed; `tests/fixtures/legacy-projects/` is ignored
if that old expanded location is used for local inspection.

This packaging removes roughly 78,000 fixture lines from the PR while retaining
the same compatibility coverage. Earlier commits in this branch still contain
the expanded files; packaging changes the final tree, not existing Git history.

This suite is a pre-validation baseline. It does **not** implement or certify
strict schema dispatch, new-write rejection, upgrade edits, backup/restore,
acceptance concurrency, or reader/writer release gates. Those remain separate
requirements in `docs/validation-preparation/legacy-project-test-plan.md`.
