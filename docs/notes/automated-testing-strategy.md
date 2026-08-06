# Automated Testing Strategy

Goal: `bun run test` is green ⇒ you can ship with confidence.

This document is grounded in a measured audit of the repo at `10e15c52`, not general advice.
Every number below was produced by running the thing.

---

## 1. Where you actually stand

### The headline

**Your 2,317-test suite is not run by anything, and it has been failing on `main` for a while.**

| Fact | Evidence |
| --- | --- |
| CI runs **zero** tests | `.github/workflows/ci.yaml` = `bun run lint` + `bun run build:web`, nothing else |
| `bun run test` does **not** run vitest | `scripts/test.js` spawns 5 node scripts; no vitest anywhere in it |
| Only `test:puty` touches vitest | `"test:puty": "vitest run tests/puty"` — 3 files out of 326 |
| `bunx vitest run` is invoked by **no script and no hook** | 326 test files / 2,317 tests are orphaned |
| The orphaned suite is **red on committed main** | 29 files / 88 tests fail at `10e15c52` (verified in a clean worktree — not your WIP) |
| `bun run check:contracts` is **also red** | 3,779 errors |

### Why the suite is red (this is the important part)

Failure causes on clean `main`:

| Count | Cause | Real bug? |
| --- | --- | --- |
| 63 | `Error: resourcePages i18n catalog is required` | No — tests hand-build **partial i18n literals** instead of importing `EN_I18N` from `tests/support/i18n.js` |
| ~19 | `TypeError: store.selectXxx is not a function` | No — tests hand-build **partial fake stores** (`store: { selectFoo: vi.fn() }`); a handler started calling a new selector and the fake didn't have it |
| ~6 | Assertion mismatches | Maybe — needs triage |

**~93% of failures are fake-object drift, not product defects.** The suite isn't broken because
the product is broken. It's broken because 62 `*.handlers.test.js` files each construct a bespoke
partial mock of `store`, `i18n`, `appService`, and `projectService` by hand. Every time a handler
reaches for one more selector, N test files break with a `TypeError` that tells you nothing about
correctness.

That is the root cause of the whole situation: the suite is expensive to keep green and produces
no signal when it is green, so it was rationally abandoned. Wiring it into CI as-is would just
train everyone to ignore a red build.

### The good news — you own more than you think

Three assets in this repo are genuinely strong and under-used:

**1. `vt/` is already a real browser E2E harness.** Not a screenshot toy.

- 26 specs, 163 committed reference `.webp` baselines
- Real Playwright 1.57 inside a pinned Docker image (`han4wluc/rtgl:playwright-v1.57.0-rtgl-v1.0.12`),
  `--isolation strict`, IndexedDB reset between specs — i.e. deterministic by construction
- It drives the actual UI: **350** `select`, **228** `click`, **88** `write`, **81** `keypress`,
  **6** `upload`, **13** `customEvent`, **54** `assert`, **147** `screenshot`
- Every spec creates a project from scratch through the real UI, then exercises a page
- Actively maintained: 56 of the last 400 commits touch `vt/`; most recent was 4 days ago
  (`fix(vt): stabilize workflows and refresh baselines (#1008)`)

**Measured full run** (`bun run build:web` + `run-vt-docker.sh vt screenshot`, working tree):
**5 min 24 s**, 26 specs, 147 screenshots, at `--concurrency 1` — which is the default in
`scripts/run-vt-docker.sh` (`RTGL_VT_CONCURRENCY:-1`). Raising concurrency is the obvious CI lever.
Result: **exit 1, 2 failures + 1 flaky retry.**

- `project/scenes.yaml` — timed out at 30 s, **passed on retry**. Flake.
- `project/fonts.yaml` — `assert text failed: expected "Noto Sans 400" to includes "Noto Sans SC"`.
  A genuine assertion failure; needs triage.
- `project/variables.yaml` — timed out waiting for `#addVariableDialog` to be visible.
  **This one is the whole argument for VT.** `#addVariableDialog` exists at `HEAD` but is gone in the
  working tree: the in-flight computed-variables refactor renamed it to `variableDialog` /
  `computedDialog`. VT caught that a real user flow — opening the add-variable dialog — no longer
  works as specified. Meanwhile `tests/variables/groupVariablesView.view.test.js` **passes**, because
  it was updated to assert `expect(view).not.toContain("addVariableDialog")`. The unit test was
  taught the new spelling; only the browser test noticed the flow.

**2. `tests/puty/` is the best test pattern in the repo — and you've used it 3 times.**
Declarative YAML `in` (commands) → `out` (committed rows), driving the *real* pipeline:
command envelope → collab service → insieme → **real SQLite via better-sqlite3** → committed
events → repository state. Runs in **736 ms**. This is a true integration test with zero mocks.

**3. `scripts/test-smoke.js` is a dense, honest domain integration test.** 839 lines that build a
repository, apply commands, verify rejection of invalid commands, check projections, layout render
elements, file-id extraction, and export usage. `bun run test` (all 5 scripts) passes in **2.3 s**.

### What nothing tests today

- **That an exported game actually plays.** `scripts/test-export-bundle-pipeline.js` verifies ZIP
  structure and the asset manifest, but stubs the runtime
  (`return new Response("console.log('bundle runtime');")`). It proves the bundle *packages*,
  never that it *renders a first frame*. This is the product's core promise.
- **i18n parity.** `en`/`ja`/`zh-hans` each have exactly 2,083 keys today — by luck, not by a test.
- **The 39 `*.view.test.js` files are coverage theater.** They `readFileSync` the `.view.yaml` and
  assert `expect(view).toContain("rtgl-dialog#variableDialog")`. That asserts a file contains its
  own text. Zero behavioural value, and they fail on every harmless refactor.
- **Contract checks are drowned in noise.** Of 3,779 `rtgl check` errors, 3,520 are
  `RTGL-CHECK-YAHTML-001 unknown custom element` (the checker doesn't know `rtgl-*`/`rvn-*`).
  Hiding under that noise are ~259 plausibly-real errors: 82 `COMPONENT-001`, 125 `YAHTML-003`,
  20 `HANDLER-002`, 15 `LIFECYCLE-*`, 9 `LISTENER-008`, 8 `JEMPL-003`.

### Bug hotspots (churn over last 400 commits)

`src/deps/services` (523) · `src/internal/ui` (247) · `layoutEditPanel` (171) · `layoutEditor` (148)
· `src/internal/project` (116) · `images` (108) · `systemActions` (107) · `layouts` (101) ·
`scenes` (98) · `characterSprites` (96). 154 of 400 commits are fixes.

---

## 2. Playwright now, or LLM testers?

**Playwright — now. But you do not adopt Playwright; you promote `vt` to a gate.**

Standing up a second browser stack next to `rtgl vt` would be a mistake. VT already has the two
hard parts solved: deterministic containerised Chromium, and shadow-DOM-aware selectors for
Rettangoli custom elements. What it lacks is (a) a CI job, (b) behavioural assertions, and
(c) fast fixture seeding. All three are incremental work on an asset you already maintain.

**LLM/AI testers — yes, but never in the pass/fail path.** Use them in exactly two roles:

- **Test author (offline).** Point an agent at a VT spec and a hotspot page; it emits a new
  `vt/specs/**.yaml` or Puty scenario. You review it, commit it, and from then on it runs as an
  ordinary deterministic test. This is where the leverage is — your bottleneck is *writing* the
  40 Puty scenarios and 15 VT specs you need, not running them.
- **Exploratory bug-hunter (nightly, non-blocking).** An agent drives a real build hunting for
  crashes, console errors, and stuck states, and files issues. It never blocks a merge.

An LLM as a **pass/fail oracle** is the thing to avoid. It is non-deterministic, costs money per
run, and the failure mode — a flaky judge that fails a correct build — is precisely the thing that
got your current suite abandoned. The gate must be deterministic. Screenshot diffing already
answers "did the UI change" better and cheaper than a model can.

---

## 3. Recommended architecture

| Layer | What | Tool | Catches | Runtime | Runs where |
| --- | --- | --- | --- | --- | --- |
| **L0** Static | lint, format, contract checks | `oxlint`, `prettier`, `rtgl check` (baselined) | Typos, dead bindings, view/handler contract breaks | ~10 s | pre-commit + CI |
| **L1** Unit/domain | the existing vitest suite, made green | `vitest` | Store reducers, selectors, pure domain logic | **11 s** | pre-commit + CI |
| **L2** Storage integration | Puty YAML scenarios, 3 → ~40 | `puty` + real SQLite | Command→insieme→SQLite→projection; the #1 churn area | ~10 s | CI |
| **L3** Wiring integration | real store + real handlers + fake *services* | `vitest` | The `selectX is not a function` class, permanently | ~30 s | CI |
| **L4** Browser E2E + visual | `vt`, promoted to a gate | `rtgl vt` (Playwright/Docker) | Render, custom-element wiring, drag/drop, canvas, routing, regressions | minutes | CI on PR |
| **L5** Artifact smoke | load the *exported* bundle and assert first frame | `rtgl vt` on export output | "The exported game is broken" | ~1 min | CI nightly + pre-release |
| **L6** Exploratory | AI agent hunting crashes | Claude agent | Unknown-unknowns | — | nightly, **non-blocking** |

The gate is L0–L4. L5 is a release gate. L6 never gates.

---

## 4. Roadmap

### Phase 0 — under one day, and it changes everything

The single highest-value change in this repo is nearly free:

1. **Run the tests you already have.** In `scripts/test.js`, add a vitest invocation to the
   `scripts` array (or run `vitest run` alongside it).
2. **Fix the 63 i18n failures** — replace hand-built partial i18n literals with
   `import { EN_I18N } from "../support/i18n.js"` in the failing files
   (`tests/systemActions/*`, `tests/layouts/*`, and the rest). Mechanical.
3. **Fix the ~19 mock-drift failures** — add the missing selectors to the fake stores as a stopgap.
   Phase 2 removes the need for this permanently.
4. **Triage the ~6 real assertion failures.** These may be actual bugs. Treat them as such.
5. **Add tests to CI.** In `.github/workflows/ci.yaml`, after `Lint`:
   ```yaml
   - name: Test
     run: bun run test
   ```
6. **Add an i18n parity test** — assert `en`/`ja`/`zh-hans` have identical key sets. ~15 lines,
   permanently closes a whole bug class.
7. **Housekeeping** — add `.playwright-cli/`, `tmp/`, `test-results/` to `.gitignore`
   (159 stray console logs are currently untracked in your working tree).

**Exit criteria:** `bun run test` is green, runs in under 30 s, and a red PR blocks merge.

### Phase 1 — week 1–2: make VT a gate

1. Mirror `han4wluc/rtgl:playwright-v1.57.0-rtgl-v1.0.12` to GHCR and cache it in Actions
   (it's 3.81 GB / ~1.01 GB compressed — pulling from Docker Hub on every run will hurt).
2. Add a `visual` job to `ci.yaml`: `bun run build:web` → `run-vt-docker.sh vt screenshot` →
   `vt report`, uploading the diff report as an artifact.
3. **Raise `RTGL_VT_CONCURRENCY`.** It defaults to `1` in `scripts/run-vt-docker.sh`; the measured
   5 min 24 s run is almost entirely serial. At concurrency 4 on a standard runner this should land
   near 2 min. Validate that `--isolation strict` holds up under parallelism before committing to it.
4. **Fix the three live failures first** (`variables.yaml` stale selector, `fonts.yaml` font
   assertion, `scenes.yaml` 30 s flake) — a gate cannot be turned on while it is red.
5. Replace hardcoded sleeps with `waitFor`. There are currently **102.6 seconds** of hardcoded
   `action: wait` across the specs — that is both the suite's runtime floor and its main flake source.
   `scenes.yaml` timing out at 30 s and passing on retry is this problem already biting.
6. Extract the shadow-DOM `deepQuery` helper. Today every `assert type: js` inlines a ~300-char
   one-liner re-declaring `deepQuery`. Factor it into the VT runtime so behavioural assertions
   become one-liners — then *add* them. VT currently has 147 screenshots to only 54 asserts;
   invert that ratio.

**Exit criteria:** VT runs on every PR, fails the build on unreviewed visual diff, under 15 min.

> **Process note.** The `variables.yaml` failure shows the discipline this requires: when a refactor
> renames a selector, the VT spec must be updated *in the same PR*. Today VT is run manually and
> occasionally, so specs drift silently. Making it a gate is what forces spec and code to move
> together — that is the point, and it is also the cost.

### Phase 2 — week 2–4: kill the mock-drift class

Build **one** shared harness — `tests/support/createComponentHarness.js` — that mounts a component
with its **real** store and **real** handlers, injecting fakes only at the *service* boundary
(`appService`, `projectService`) plus the real `EN_I18N`. Then migrate the 62 `*.handlers.test.js`
files onto it.

This is the structural fix. A test can no longer fail because a fake store lacks a selector — the
store is real. And these tests start catching store↔handler contract breaks, which is the bug class
your churn data says you actually have.

While migrating, **delete the 39 `*.view.test.js` string-matching tests.** They cost maintenance and
return nothing; `rtgl check` and VT cover that ground properly.

### Phase 3 — week 3–5: scale Puty and close the export gap

1. Grow `tests/puty/` from 3 → ~40 scenarios, prioritised by churn: variables & computed variables,
   layout commands, scene/section operations, character sprites, resource file lifecycle,
   collab convergence, undo/redo. This is the ideal target for LLM-authored tests — the YAML format
   is declarative and easy to review.
2. **Make the exported bundle prove itself.** Extend `scripts/test-export-bundle-pipeline.js` (or add
   a VT spec) that takes a real exported ZIP, serves it, loads it in the VT Docker browser, and
   asserts the first frame renders and the first dialogue line displays. Stop stubbing the runtime.
3. Fix `rtgl check` config so `rtgl-*`/`rvn-*` elements are known, then triage the ~259 real errors
   and make `check:contracts` a blocking gate with a ratchet.

### Phase 4 — ongoing: AI in its proper place

- **Nightly exploratory agent** against a fresh build: create a project, exercise random flows,
  flag console errors / crashes / stuck states, open issues. Non-blocking.
- **LLM test authoring** as a standing workflow: when a PR touches a hotspot with no VT/Puty
  coverage, an agent proposes a spec for human review.

---

## 5. Definition of green

```bash
bun run test        # L0-L3: lint, contracts, vitest, puty, node integration — target < 60s
bun run test:vt     # L4: browser E2E + visual regression in Docker — target < 15min
```

**A green run proves:** domain commands produce the right state and the right SQLite rows;
projections and layout rendering are correct; every page renders, routes, and responds to real
clicks/typing/uploads without crashing; the UI has not visually regressed; view↔handler↔store
contracts hold; i18n is complete across all three locales.

**A green run still does not prove:** that it works on Tauri desktop, Android, or iOS (VT is web-only);
that native file pickers, the updater, or Tauri IPC work; that Steam builds are valid; that
performance is acceptable; that a *human* would call the UX correct — screenshot diffs catch change,
not wrongness, so an accepted-but-wrong baseline stays wrong. After Phase 3, it does prove an
exported game boots and renders.

---

## 6. Critical journeys, ranked for E2E

Ranked by churn × blast radius. ✅ = has some VT coverage today.

1. Create project → opens → reload → still there ✅
2. Scene editor: add lines, dialogue, choices, conditionals → persists ✅ *(partial)*
3. Layout editor: place/move/resize/nest elements → persists ✅ *(highest churn: 171+148 commits)*
4. Variables + computed variables: create, edit, reference in a scene *(partial, active WIP)*
5. Import an image/sprite → appears in resources → referenced in a layout ✅
6. **Export a playable bundle → it actually runs** ❌ **← the biggest gap**
7. Character + sprite groups → used in a scene ✅
8. Preview/play the VN inside the editor ❌
9. Undo/redo across the above ❌
10. Collab: two clients converge *(covered headlessly by `test-integration.js`, not via UI)*
11. Fonts/text styles render correctly ✅
12. Reopen an existing project with all resources intact *(partial)*
13. Spritesheets & animations editor ✅
14. Delete/rename/move in the file explorer, incl. drag-drop ✅ *(partial)*
15. Platform details / release config ✅

Items 6, 8, and 9 are the ones to add first.

---

## 7. Cost

| Item | Cost |
| --- | --- |
| Phase 0 | < 1 engineer-day |
| Phase 1 (VT in CI) | ~1 engineer-week + CI minutes |
| Phase 2 (harness + migrate 62 files) | ~2 engineer-weeks (good LLM-assist target) |
| Phase 3 (Puty ×40, export smoke, contracts) | ~2 engineer-weeks |
| CI minutes | L0–L3 ≈ 2 min/PR. VT ≈ 10–15 min/PR — the dominant cost; mitigate with GHCR cache + sharding + running VT only when `src/` or `static/` changes |
| LLM cost | Authoring: negligible (human-reviewed, one-off). Nightly explorer: a few dollars/night. **Zero in the gate.** |

---

## 8. Do not do these

1. **Do not add a second Playwright setup.** You have one inside `rtgl vt`, it is maintained, it is
   deterministic, and duplicating it splits maintenance for no gain.
2. **Do not put an LLM in the pass/fail path.** Non-deterministic gates get ignored, and an ignored
   gate is how you got here.
3. **Do not wire the current vitest suite into CI before fixing it.** 88 pre-existing failures on day
   one teaches the team the build is meaninglessly red.
4. **Do not write more `*.view.test.js` string-match tests.** Delete the 39 that exist.
5. **Do not chase a coverage percentage.** Your bugs are in wiring and rendering — exactly what line
   coverage rewards you for faking. Track *journeys covered*, not lines.
6. **Do not fix the 3,520 `YAHTML-001` contract errors one by one.** Fix the checker's element
   registry; the count should collapse to ~259 real issues.
