# RouteVN V2 Platform Spec

This folder defines the non-legacy, big-bang V2 platform for RouteVN Creator.

Date baseline: February 24, 2026.

## Scope

- V2 is a breaking format and protocol migration.
- V1 projects are not opened by V2 runtime.
- All write operations must go through authoritative collaboration server validation.

## Version Contract

- `model_version = 2`
- `protocol_version = "1.0"`
- `command_version = 1`

## Spec Index

1. `01-domain-model.md`
2. `02-command-catalog.md`
3. `03-event-model.md`
4. `04-sync-protocol.md`
5. `05-storage.md`
6. `06-acceptance-gates.md`
7. `07-implementation-path.md`
8. `08-write-path-backlog.md`
9. `09-partitioning-and-write-contract.md`

## Implementation Mapping

- Domain runtime: `src/domain/v2/*`
- Client collaboration runtime: `src/collab/v2/*`
- Server bootstrap scripts: `scripts/collab-v2/*`
