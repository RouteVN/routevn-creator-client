# RouteVN Platform Spec

This folder defines the current platform for RouteVN Creator.

Date baseline: April 9, 2026.

## Scope

- The current platform is the only supported project and protocol format.
- Projects are opened only when their stored project format version matches the
  client-supported project format version.
- Projects are opened only when their local `insieme` client-store layout
  matches the current hard-cutover storage contract.
- Older local store layouts are rejected explicitly and are not repaired in the
  normal open path.
- Local/offline project writes persist to `local_drafts` first.
- `committed_events` are reserved for authoritative server-approved history.
- A local-only project may therefore have zero committed rows and a bootstrap
  `project.create` event in `local_drafts`.
- The domain model and command schemas are owned by the model repo:
  `https://github.com/RouteVN/routevn-creator-model`

## Version Contract

- `project_format_version = 1`
- `command_envelope_version = 1`
- `model_schema_version = 1`
- `bundle_format_version = 2`
- `protocol_version = "1.0"`
- `command_version = 1`
- entity ids are base58 strings

For current ID-generation length and prefix rules, see `08-id-generation.md`.

Notes:

- project format version is derived from app semver major
- a future app major release is therefore also a project-format boundary
- the command envelope version is a client-owned collab wire version and is
  intentionally separate from the model schema version
- the bundle format version is the `package.bin` binary format version used by
  exported runtime bundles and is intentionally separate from sync protocol and
  collab command envelope version

Bundle implementation points:

- reader/runtime: [scripts/main.js](/home/tk/Code/yuusoft-org/routevn-creator-client/scripts/main.js)
- writer/shared export service:
  [projectExportService.js](/home/tk/Code/yuusoft-org/routevn-creator-client/src/deps/services/shared/projectExportService.js)
- tauri streamed zip export:
  [export_zip.rs](/home/tk/Code/yuusoft-org/routevn-creator-client/src-tauri/src/export_zip.rs)

## Spec Index

1. model repo: `https://github.com/RouteVN/routevn-creator-model`
2. `04-sync-protocol.md`
3. `05-storage.md`
4. `06-project-identity-and-metadata.md`
5. `07-persisted-key-catalog.md`
6. `08-id-generation.md`
7. `09-partitioning-and-write-contract.md`
8. `10-model-compatibility-and-upgrades.md`

## Implementation Mapping

- Domain runtime: `src/domain/*`
- Client collaboration runtime: `src/collab/*`
- Server bootstrap scripts: `scripts/collab/*`
