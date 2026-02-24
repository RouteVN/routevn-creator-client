# 07 Implementation Path (Big-Bang V2)

Date baseline: February 24, 2026.

This is the executable path to ship V2-only collaboration with durable data guarantees.
No V1 backward compatibility is included.

## Release Strategy

- Single cutover to V2 runtime and V2 project format.
- Hard fail on `model_version !== 2`.
- All writes are command-based and server-authoritative.

## Immediate Actions (Start Now)

1. Freeze V2 spec as source of truth.
2. Keep domain mutations exclusive to `src/domain/v2/*`.
3. Route collaboration calls through `src/collab/v2/*`.
4. Enforce model gate in both services:
   - `src/deps/services/projectService.js`
   - `src/deps/services/web/projectService.js`
5. Initialize every new project with `model_version: 2`:
   - `src/deps/infra/tauri/tauriRepositoryAdapter.js`
   - `src/deps/infra/web/webRepositoryAdapter.js`

## Implementation Phases

## Phase 1: Runtime Foundation (1-2 days)

- Keep current app build green while introducing V2 domain/collab modules.
- Complete deterministic reducer + invariant enforcement.
- Add command-envelope helpers for all write operations.

Done criteria:
- `bun run lint` passes.
- `bun run build:web` passes.
- `bun run build:tauri` passes.

## Phase 2: Insieme Upgrade + Sync Server (2-3 days)

- Upgrade dependency from `insieme@0.0.8` to current 1.x release.
- Stand up sync server using `scripts/collab-v2/start-sync-server.mjs`.
- Replace demo auth/authz with production auth provider.
- Implement validation pipeline:
  - command schema validation
  - precondition checks
  - reducer apply
  - invariant checks

Done criteria:
- Server rejects invalid command/event payloads.
- Client reconnect and catch-up work on real websocket transport.

## Phase 3: UI Write Path Rewrite (5-10 days)

- Remove direct `appendEvent` usage from UI handlers.
- Replace every mutation with `submitCommand(createCommandEnvelope(...))`.
- Keep local projection via `processCommand` for optimistic UI.

Done criteria:
- No UI write path bypasses command pipeline.
- `rg \"appendEvent\\(\" src` returns only legacy-dead code slated for removal.

## Phase 4: Remove Legacy Repository API (2-4 days)

- Remove reliance on old `createRepository` event log patterns.
- Store/project state derives from committed command events.
- Delete unused V1 helpers and adapters.

Done criteria:
- No runtime imports from legacy Insieme APIs.
- V2 project open/create/export paths are fully command/event based.

## Phase 5: Hardening and Release Gates (3-5 days)

- Add deterministic replay tests.
- Add multi-client convergence tests.
- Add crash recovery + db integrity checks.
- Add load test for high-frequency edits.

Done criteria:
- All gates in `06-acceptance-gates.md` pass.
- Production rollout flag enabled.

## Non-Negotiable Data Guarantees

- Reducer determinism: same event stream => same state.
- Invariant enforcement after every commit.
- Idempotent command IDs.
- Append-only committed event history.
- `model_version` locked to 2 at runtime.

## Required Refactors Before GA

- Replace all UUID fallback IDs with UUIDv7 where available.
- Add server-side canonical serialization for command dedupe.
- Replace `Date.now()` in mutable reducers with event timestamp metadata.
- Add domain-level migration blocker that rejects malformed in-memory state early.

