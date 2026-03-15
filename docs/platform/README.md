# RouteVN Platform Spec

This folder defines the current platform for RouteVN Creator.

Date baseline: February 24, 2026.

## Scope

- The current platform is the only supported project and protocol format.
- Older projects are not opened by the current runtime.
- All write operations must go through authoritative collaboration server validation.

## Version Contract

- `model_version = 2`
- `protocol_version = "1.0"`
- `command_version = 1`

## Spec Index

1. `01-domain-model.md`
2. `02-command-and-event-model.md`
3. `03-command-catalog.md`
4. `04-sync-protocol.md`
5. `05-storage.md`
6. `09-partitioning-and-write-contract.md`

## Implementation Mapping

- Domain runtime: `src/domain/*`
- Client collaboration runtime: `src/collab/*`
- Server bootstrap scripts: `scripts/collab/*`
