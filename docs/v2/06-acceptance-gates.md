# 06 Acceptance Gates (V2)

## Must Pass Before Release

1. Protocol conformance tests pass.
2. Command schema + precondition validation tests pass.
3. Reducer determinism tests pass.
4. Invariant checks pass after every committed event in integration tests.
5. Multi-client convergence tests pass.
6. Reconnect/catch-up idempotency tests pass.
7. Crash-recovery tests pass.
8. SQLite integrity checks pass.
9. Append-event command bridge coverage passes (`bun run test:v2-append-bridge`).

## Non-Functional Gates

- No unbounded event replay latency for normal project sizes.
- Server logs include `connection_id`, `msg_id`, `id`, `committed_id`.
- Backups and restore drills validated.

## Rollout Policy

- V2-only runtime.
- V1 project open/import is rejected with explicit message.
- Feature flags for staged deployment cohorts.
