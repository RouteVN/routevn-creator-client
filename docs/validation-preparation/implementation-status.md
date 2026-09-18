# Implementation status

The old-project compatibility baseline is implemented. Strict schema validation
and the reader/writer rollout remain incomplete. No client production behavior
or dependency version has changed in this slice.

## Implemented and verified

- 27 immutable SQLite project packs and 23 applicable portable IndexedDB packs,
  authored using independently installed schema-14/schema-15 clients. They are
  stored in a deterministic ZIP with a readable provenance/hash manifest; tests
  verify and extract it automatically. All 319 original files are byte-identical.
- Pinned previous-reader comparisons against the candidate through production
  repository loading, storage codecs, projections and model reducers.
- Cold, warm and cache-cleared opens; exact original row bytes and storage types;
  preserved unknown legacy data, ordered atlas keys, metadata and recovery sources.
- Real PNG/audio/font assets, old draft-skip/duplicate/obsolete-event behavior,
  checkpoint-only recovery, malformed legacy version values, avatar data,
  10,000-edit history and an oversized historical bootstrap.
- Logical preview/export comparisons in native-bridge and browser lanes.
  Graphics output and packaged-player delivery are separate checks.
- Seven comparator negative controls and real-browser dump self-tests covering
  typed binary data, Blob/File metadata, sparse arrays, compound keys, property
  order and advanced key generators.
- A separate CI job, executable browser artifacts, machine-readable
  reports, and retained failure databases/profiles.

The model owner has four adopted, independently captured domain streams with
source provenance and exact sequential/batch comparisons. Original schema
archives 1–15 are unchanged. The engine owner has an unreleased literal-object
operation implementation with tests for legacy interpolation, inert JSON,
callbacks, permissions, save/load and rollback. Both are isolated owner work;
the client continues to consume its published dependencies.

Local owner branches now retain the tested commits:

- `routevn-creator-model`: `feat/versioned-command-validation`, `0d03c97`.
- `route-engine`: `feat/literal-object-variable-values`, `75f99e5`.

Their existing working checkouts and untracked files were preserved. No owner
branch was pushed and no package was published.

## Verification from this implementation run

| Check                                                          | Result                                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Combined compatibility command                                 | Passed: 162 SQLite open phases, 276 browser open phases, both browser dump checks, seven negative controls |
| Client smoke, integration, convergence, collaboration adapters | Passed                                                                                                     |
| Client Puty storage suite                                      | 5 passed                                                                                                   |
| Client lint and new harness formatting                         | Passed                                                                                                     |
| Model full suite                                               | 4,258 passed, including 3,462 archived cases and 8 adopted-project tests                                   |
| Engine full suite                                              | 2,182 passed, including 20 literal-value tests                                                             |
| Engine lint, disabled-test checks and package build            | Passed                                                                                                     |

The archive packaging rerun used only the committed ZIP with a fresh extraction
cache. All 319 extracted files matched their original hashes, and repacking
produced identical ZIP and manifest bytes. Six additional archive tests cover
determinism, concurrent extraction, corrupt archives/caches, unsafe paths and
preservation of frozen files. The readable manifest and update workflow are
linked from the harness README.

The combined command was run in the existing Playwright Linux container with
read-only source/dependency mounts and writable temporary test caches. Chromium
and WebKit used separate persistent profiles; WebKit private contexts reject
Blob storage. The native lane uses actual SQLite with production Tauri store
logic and a driver bridge. This is not a desktop/mobile binary certification.

Run the client gate with `bun run test:project-compatibility`. See
[the harness README](../../tests/projectCompatibility/README.md) for prerequisites,
focused runs, immutable capture rules and report locations.

## Remaining work

1. Complete model version dispatch, strict action/context contracts, affected
   results, supported extensions and reference-impact validation.
2. Implement Insieme's raw-preserving version path and strict authoring checks.
3. Finish/release the engine prerequisite and verify exported/native players.
4. Implement the client codec, authoritative replay, acceptance coordinator,
   platform locks, authoring composition and user-facing validation errors.
5. Add the strict edit/rejection, failed-write, upgrade backup/restore,
   concurrency and future-version tests against that implementation.
6. Publish owner dependencies and complete device, performance and R/W release
   checks before enabling strict writes.

The fixture gate deliberately reports `strictWritesTested: false`; these future
checks are not represented by skipped or falsely passing tests. The known old
SQLite acknowledgment failure and exact no-metadata checkpoint addition remain
explicit baseline outcomes, rather than being silently repaired by the harness.
