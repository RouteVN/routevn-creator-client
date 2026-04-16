# 06 Project Identity And Metadata

Date baseline: April 16, 2026.

This document defines the current ownership and behavior of project identity,
project metadata, and exported runtime save identity.

## Summary

There are three separate concepts that are easy to confuse:

1. app project entry id
2. committed repository event `project_id`
3. bundled runtime save namespace

For new projects, the first and third now come from `projectInfo` in the
project-specific DB.

## Project Metadata

Project metadata lives in the project-specific DB `app` store under the key
`projectInfo`.

Current fields:

- `id`
- `namespace`
- `name`
- `description`
- `iconFileId`

Important details:

- this metadata is not owned by repository state
- `projectInfo.id` is the canonical project/folder id for new projects
- `projectInfo.namespace` is the canonical exported runtime save namespace for
  new projects
- `iconFileId` is stored in `projectInfo`, but the actual icon binary lives in
  the project `files/` folder

## App Project Entry Id

The app keeps a separate `projectEntries` listing for discovery, routing, and
current-project context.

Current behavior:

- the route payload `?p=` and current `appService.getCurrentProjectId()` use the
  app project entry id
- projected editor state `state.project.id` is injected from that current app
  project context
- `state.project.id` is therefore not a repository-state field and not a
  `projectInfo` field

Current rule for new projects:

- app project entry id should match `projectInfo.id`
- the global app DB caches that id for routing and listing
- the project-specific DB remains the source of truth

## Repository Event `project_id`

Desktop `project.db` stores repository history as collab client-store tables.

Important details:

- committed event rows have a `project_id` column
- that value is reconstructed as `event.projectId` when committed events are
  read back
- project identity for new projects is not derived from committed event rows
- the canonical id for new projects lives in `projectInfo.id`

## Bundled Runtime Namespace

The exported bundled runtime now prefers the namespace written into bundle
metadata from `projectInfo.namespace`.

Bundle metadata now carries:

- `bundleMetadata.project.namespace`

Important details:

- `projectId` is not exported into the bundle
- runtime IndexedDB/save identity should come from the project-specific DB
  namespace, not the browser path
- the browser-path namespace remains only as a fallback for older bundles that
  do not carry bundle metadata namespace

Implication:

- the same exported game keeps the same save bucket when moved to a different
  path
- two different exports should not collide just because they are hosted at the
  same path

## Current Guidance

Use these rules when reasoning about identity:

- for project display metadata, use `projectInfo`
- for canonical project identity on new projects, use `projectInfo.id`
- for exported runtime save identity on new projects, use
  `projectInfo.namespace`
- for repository history semantics, reason about committed repository events
- do not assume `state.project.id` came from repository state
- do not expose `projectInfo.id` into the exported bundle unless a separate
  product requirement explicitly needs it
