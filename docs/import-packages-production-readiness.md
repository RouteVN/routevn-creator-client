# Import Packages Production Readiness Checklist

## Status

This document is the implementation and release-verification checklist for the
animation and transform package importer.

The shared production path is implemented. It now provides strict planning,
package-local id mapping, creator-model preflight, bounded network reads,
integrity verification, review and replacement choices, cancellation, staged
asset cleanup, deterministic retry ids, and one user-visible command batch.
The detailed phase checklists below are reusable acceptance templates and stay
unchecked until evidence is attached during release review. The implementation
snapshot below records what is present in this change; it deliberately keeps
manual/device/release gates separate from code completion.

### Implementation Snapshot

- [x] One strict `routevn.import-pack.v1` path for animations and transforms.
- [x] Shared bounded network client with HTTPS policy, redirect revalidation,
      timeouts, cancellation, streaming size limits, relative URLs, MIME checks,
      and SHA-256 verification.
- [x] Strict deterministic planner with tree/resource/file/tag validation,
      creator-model preflight, primary-first multi-item imports, complete known
      reference rewriting, frozen plans, and project-revision capture.
- [x] Shared localized source/review/progress wizard with visual resource
      selection for multi-item packages, automatic selection-page skip for a
      single item, one customization page per selected resource, package image
      or silent looping MP4 previews in 16:9 frames, accumulated choices, final
      Submit All, existing/new destination folders, existing-image replacement,
      cancellation, and retry.
- [x] Staged files and thumbnails, platform cleanup adapters, one atomic command
      batch, stable resource/command ids, unknown-outcome recovery, and result
      ids for post-success selection.
- [x] Animations and transforms pages use the same shared production workflow.
- [x] Deterministic local HTTP fixture server and success, redirect, delay,
      status-failure, and integrity-failure data.
- [x] Focused client, planner, service, component-store, command-batch, real
      repository-projection, and SQLite-backed Puty storage tests.
- [ ] Release evidence: browser VT, keyboard/mobile manual validation,
      platform-native device runs, limit/soak profiling, and final release build.

The package format remains defined in [Import Packages](./import-packages.md).
This document defines how the client should safely plan, review, execute, test,
and operate imports using that format.

## Scope

In scope:

- animation packages
- transform packages
- referenced image dependencies
- web, Tauri, Android, and iOS client behavior
- strict package validation and compatibility handling
- a shared import planner and executor behind `projectService`
- review, progress, cancellation, retry, and stable error feedback
- user-visible all-or-nothing resource commits
- integration, failure-injection, and VT coverage

Out of scope for the first production-ready release:

- importing every RouteVN resource type
- automatically recreating or merging package folder trees (the reviewed flow
  may create one user-named destination folder per imported collection)
- silently updating resources from a previously imported package
- arbitrary creator-model migrations inside the importer
- relying on asset-store browser cookies
- treating package data as trusted because it came from a RouteVN domain

The architecture must remain reusable for future resource types even though
the first shipping implementation is limited to transforms and animations.

## Pre-Hardening Baseline (Historical)

Before the shared importer, the implementation provided:

- an Import action on the animations and transforms pages
- an absolute HTTP or HTTPS manifest URL field
- JSON and shallow package-envelope validation
- support for `routevn.import-pack.v1`, raw collections, and single items
- destination-folder selection for the imported resource and its images
- import of referenced transform preview images
- import of referenced animation mask images
- generation of new project image and resource ids
- rewriting of the currently supported image reference paths
- alerts for failure and a toast on success
- page handler/store unit tests and shared image-import tests

That implementation did not guarantee:

- strict schema validation before writes
- creator-model validation of the final normalized resources before writes
- mapping of every package-local id
- all-or-nothing resource creation
- cleanup after partial file or resource writes
- protection from duplicate submission
- manifest or asset limits
- request timeout or cancellation
- hash verification
- relative file URL resolution
- review of package contents and choices before import
- consistent multi-item behavior between transforms and animations
- real repository/storage integration coverage

## Implemented Production Path

The current implementation is split across these ownership boundaries:

- `src/deps/clients/importPackageClient.js`: URL policy, redirects, bounded
  streaming, timeouts, cancellation, content-type checks, and SHA-256
- `src/internal/resourceImportPlan.js`: strict package/tree/resource validation,
  dependency discovery, stable ids, tag reuse, reference rewriting, and
  creator-model preflight
- `src/deps/services/shared/resourcePackageImportService.js`: plan lifecycle,
  review validation, concurrent downloads, staging, cleanup, retry recovery, and
  execution results
- `src/deps/services/shared/commandApi/resources/importPackage.js`: destination
  revalidation and one atomic file/folder/tag/image/target-resource command
  batch
- `src/components/resource-import-dialog/`: shared localized source, review,
  selection, rename, replacement, progress, cancellation, and error UI
- `scripts/import-package-test-server.js` and
  `tests/fixtures/import-packages/`: deterministic success, redirect, delay,
  HTTP failure, and integrity-failure data

The animations and transforms pages only open the component and handle its
completion/cancellation events. Their former form remains covered by legacy unit
tests but is no longer connected to the rendered production workflow.

## Production Invariants

The production importer must preserve these invariants:

1. Treat every manifest and downloaded file as untrusted input.
2. Do not write project resources until the complete import plan validates.
3. Generate destination ids once during planning and reuse them during retry.
4. Persist no package-local ids in project state.
5. Validate the final command batch against creator-model and current project
   state before submission.
6. Make the resource commit user-visible as one operation.
7. Clean up or garbage-collect staged blobs after failed or cancelled imports.
8. Do not silently skip, coerce, or choose package resources without showing
   the decision in the review UI.
9. Use the same logical import contract on every supported platform.
10. Return stable error codes; localize messages at the UI boundary.
11. Do not log signed URLs, query tokens, raw manifests, or file contents.
12. Page handlers orchestrate UI only; import logic belongs behind
    `projectService` and platform clients.

## Target User Flow

```text
Import action
-> enter package URL
-> fetch with limits and cancellation
-> validate package and build dependency graph
-> create normalized import plan with destination ids
-> validate creator-model command plan
-> for multiple resources, review previews and choose which ones to import
-> customize each selected resource with its preview, name, description, destinations, and media choices
-> submit all from the final item
-> stage and verify files with progress
-> revalidate destinations and current project revision
-> submit one resource command batch
-> finalize staged assets
-> show result and select imported resource
```

The user should be able to close the dialog before execution without changing
the project. During execution, closing the dialog should request cancellation
and leave the project in either the pre-import state or the completed state.

## Recommended Shared Contracts

The exact names can change during implementation, but the responsibilities
must remain separated.

### Import Source

```js
{
  manifestUrl,
  expectedResourceType: "animations" | "transforms",
}
```

### Import Plan

```js
{
  planId,
  schema,
  packageMetadata,
  source,
  sourceProjectRevision,
  primary,
  resources,
  dependencies,
  idMap,
  destinationRequirements,
  warnings,
  estimatedDownloadBytes,
}
```

Each planned resource should include:

```js
{
  sourceId,
  destinationId,
  resourceType,
  sourceData,
  normalizedData,
  selected,
  destinationFolderId,
  validation,
}
```

### Media Choice

```js
{
  sourceResourceId,
  mode: "import" | "existing" | "skip",
  destinationResourceId,
  destinationFolderId,
  name,
}
```

`skip` is valid only when every dependent resource is also skipped or remapped.
The planner must reject a choice graph that leaves a selected resource with a
missing dependency.

### Execution Result

```js
{
  valid,
  status: "completed" | "cancelled" | "failed",
  planId,
  importedResourceIds,
  importedDependencyIds,
  reusedResourceIds,
  skippedResourceIds,
  warnings,
  error,
}
```

## Phase 0: Lock Product, Compatibility, And Trust Decisions

### Goal

Settle decisions that change persisted behavior or package compatibility before
building the new importer.

### Checklist

- [ ] Decide whether production URL imports require
      `routevn.import-pack.v1` and reject unversioned raw resources.
- [ ] Recommended: keep raw collection/single-item parsing only as an explicit
      development or compatibility path, not the public asset-store path.
- [ ] Decide whether a transform package imports all transforms or only the
      declared primary transform.
- [ ] Recommended: show all matching transforms in review, with the primary
      selected and sorted first.
- [ ] Confirm that animation packages continue to show all animations, with
      the primary sorted first.
- [ ] Define how package tags are imported, reused, renamed, or rejected.
- [ ] Recommended: require referenced package tags to exist in the package,
      reuse an existing destination tag only after an explicit deterministic
      name/scope match, and otherwise create a mapped tag.
- [ ] Define re-import behavior for the same package id and version.
- [ ] Recommended initial behavior: a later import creates a new copy and does
      not silently update or overwrite existing resources.
- [ ] Decide whether import receipts/provenance are persisted.
- [ ] If receipts are persisted in project state, add first-class support in
      `routevn-creator-model` before client code writes them.
- [ ] Define the package compatibility fields required in v1 or a future v2,
      including creator-model minimum/maximum compatibility if needed.
- [ ] Define the production URL policy: HTTPS requirement, localhost/dev
      exceptions, redirects, CDN origins, and private-network destinations.
- [ ] Define whether authenticated imports use signed URLs only or also support
      authorization headers through a first-party account flow.
- [ ] Define manifest, file, total-download, resource-count, and nesting limits.
- [ ] Suggested starting limits for review: 2 MiB manifest, 100 files,
      500 resources, 50 MiB per image, and 500 MiB total download.
- [ ] Define manifest and file request timeouts.
- [ ] Suggested starting values for review: 15 seconds for manifests and
      60 seconds per file, with cancellation resetting the timer.
- [ ] Decide how same-name destination resources are presented; do not silently
      overwrite them.
- [ ] Record all accepted decisions in `docs/import-packages.md` and the model
      compatibility documentation.

### Exit Criteria

- The public package input contract is explicit.
- Multi-item behavior is consistent between animations and transforms.
- Tag, re-import, authentication, and trust behavior have one accepted policy.
- Resource and network limits have documented constants.
- No remaining open decision can change the persisted schema or core user flow.

## Phase 1: Create Shared Import Architecture

### Goal

Move package import logic out of page handlers and establish plan/execute
boundaries behind `projectService`.

### Checklist

- [ ] Add a shared package import service under
      `src/deps/services/shared/`.
- [ ] Add a low-level import-package network client under
      `src/deps/clients/` with platform adapters where behavior differs.
- [ ] Expose coarse methods through `projectService`, for example: - `createResourceImportPlan(...)` - `validateResourceImportPlan(...)` - `executeResourceImportPlan(...)` - `cancelResourceImport(...)`
- [ ] Keep page stores, refs, render functions, and event payloads out of the
      shared service.
- [ ] Keep fetch, response streaming, timeout, and platform URL behavior out of
      page handlers.
- [ ] Split pure package parsing/reference helpers into an app-owned internal
      module only when they have no service or platform dependencies.
- [ ] Create one normalized result/error contract shared by transforms and
      animations.
- [ ] Generate `planId`, resource destination ids, dependency destination ids,
      and command ids once during planning.
- [ ] Make plans immutable plain data after creation.
- [ ] Do not put services, callbacks, cleanup functions, or `AbortController`
      instances in Rettangoli stores.
- [ ] Keep active execution cancellation inside the service lifecycle.
- [ ] Ensure multiple mounted page instances cannot share mutable handler state.
- [ ] Remove direct package fetch/download orchestration from: - `src/pages/animations/animations.handlers.js` - `src/pages/transforms/transforms.handlers.js`
- [ ] Retain page handlers as composition roots that open the shared workflow,
      apply user choices, invoke `projectService`, and present results.

### Expected Code Ownership

```text
src/pages/animations/
src/pages/transforms/
  page-specific launch, selection, and post-success behavior

src/components/resource-import-dialog/
  reusable review/progress UI and local dialog state

src/internal/importPackages.js
  pure format helpers only, or replace with a more focused pure module

src/deps/services/shared/resourcePackageImportService.js
  planning, validation, execution, and cleanup orchestration

src/deps/clients/web/importPackageClient.js
src/deps/clients/tauri/importPackageClient.js
src/deps/clients/android/importPackageClient.js
src/deps/clients/ios/importPackageClient.js
  bounded manifest/file fetching and platform-specific behavior
```

File names are recommendations. Follow the existing setup/facade patterns if a
smaller number of adapters can provide the same explicit ownership.

### Exit Criteria

- Both pages call the same import planner and executor.
- Page handlers contain no direct `fetch` or dependency graph logic.
- Import state and errors use one shared contract.
- The service can be tested without rendering either page.

## Phase 2: Implement Bounded And Trusted Fetching

### Goal

Treat manifests and files as untrusted network input and fail before excessive
memory, storage, or network consumption.

### Checklist

- [ ] Validate the source URL against the accepted production URL policy.
- [ ] Apply manifest request timeout and cancellation.
- [ ] Request JSON explicitly and distinguish these failures: - network unavailable - timeout - cancelled - unauthorized or forbidden - not found - server failure - unsupported content type - invalid JSON
- [ ] Enforce manifest byte limits while reading the response; do not call
      `response.json()` on an unbounded body.
- [ ] Validate the final response URL after redirects when the platform exposes
      it.
- [ ] Resolve relative file URLs against the final manifest URL.
- [ ] Reject unsupported protocols after URL resolution.
- [ ] Apply per-file and total-download limits before and while reading bytes.
- [ ] Use `Content-Length` as an early signal but do not trust it as the only
      enforcement mechanism.
- [ ] Apply per-file timeout and cancellation.
- [ ] Limit concurrent downloads explicitly.
- [ ] Preserve deterministic dependency order independent of network timing.
- [ ] Verify `sha256` when present before processing or storing the file.
- [ ] Return a stable integrity error when the hash does not match.
- [ ] Validate allowed imported image formats against
      `docs/upload-file-types.md` before creating an image resource.
- [ ] Validate detected bytes/decodability in addition to extension and declared
      MIME type.
- [ ] Do not allow manifest MIME metadata to override contradictory detected
      content silently.
- [ ] Revoke temporary object URLs and release buffers on failure/cancellation.
- [ ] Ensure signed URLs and authorization headers are redacted from logs.
- [ ] Add platform contract tests proving equivalent policy on web, Tauri,
      Android, and iOS.

### Stable Error Codes

At minimum, define codes for:

- `import_manifest_network_failed`
- `import_manifest_timeout`
- `import_cancelled`
- `import_authorization_required`
- `import_manifest_not_found`
- `import_manifest_too_large`
- `import_manifest_invalid_json`
- `import_package_schema_unsupported`
- `import_file_missing`
- `import_file_timeout`
- `import_file_too_large`
- `import_total_size_exceeded`
- `import_file_type_unsupported`
- `import_file_integrity_failed`

### Exit Criteria

- No manifest or file body is read without enforced limits.
- Every request can be cancelled.
- Relative package file URLs work according to the spec.
- Hash mismatches and unsupported image types fail before project resource
  creation.
- Network and auth failures have stable, localized UI outcomes.

## Phase 3: Build A Strict Import Planner

### Goal

Turn the manifest into a complete, deterministic, validated import plan before
any project mutation.

### Checklist

- [ ] Require the accepted package schema on the public URL path.
- [ ] Validate exact allowed keys and required package sections.
- [ ] Validate package metadata types and lengths.
- [ ] Validate every included `{ items, tree }` collection.
- [ ] Validate item ids against object keys.
- [ ] Validate tree nodes, duplicate nodes, missing items, cycles, depth, and
      item-count limits.
- [ ] Validate `primary.resourceType` and `primary.id` when present.
- [ ] Reject a primary id that does not reference the expected resource type.
- [ ] Select all supported matching resources according to the Phase 0 policy.
- [ ] Produce warnings for unsupported repository roots rather than silently
      implying that they will be imported.
- [ ] Build a dependency graph from selected resources.
- [ ] Detect missing, wrong-type, and cyclic dependencies.
- [ ] Enumerate every package-local reference field supported by the package
      version; do not rely on ad hoc recursive property-name replacement.
- [ ] Map all selected resource ids and dependency ids to stable destination
      ids.
- [ ] Map transform preview image references.
- [ ] Map animation mask image references.
- [ ] Map animation preview image/transform references when supported by the
      package contract.
- [ ] Map thumbnail and preview file ids when those files are retained.
- [ ] Map tag ids through an explicit tag import/reuse plan.
- [ ] Remove import-only tree/display metadata before command construction.
- [ ] Reject unsupported top-level or nested resource fields instead of passing
      them through to creator-model later.
- [ ] Normalize values only where the product contract defines normalization.
- [ ] Do not silently turn invalid animation definitions into defaults.
- [ ] Do not silently replace an explicitly empty or invalid name.
- [ ] Validate normalized resource payloads with creator-model.
- [ ] Validate destination folders and referenced existing substitutions against
      current project state.
- [ ] Build the full command descriptors without submitting them.
- [ ] Validate the full command sequence against one projected current state,
      including file, image, tag, transform, and animation dependencies.
- [ ] Scan the final plan and assert that no package-local id remains in a field
      defined as a project reference.
- [ ] Store the project repository revision used to create the plan.
- [ ] Return structured field/resource errors suitable for the review UI.

### Planner-Specific Regression Cases

- [ ] Empty animation name.
- [ ] Invalid animation keyframe duration or easing.
- [ ] Invalid transition mask definition.
- [ ] Unknown animation or transform field.
- [ ] Duplicate or empty tag ids.
- [ ] Missing package tag.
- [ ] Transform preview slot with extra unsupported fields.
- [ ] Missing preview or mask image.
- [ ] Image item referencing a missing file record.
- [ ] Package tree referencing an absent item.
- [ ] Package-local id left in normalized output.
- [ ] Multiple resources sharing one dependency.
- [ ] Multiple package images sharing one file.
- [ ] Primary item not first in package tree.
- [ ] Package containing unsupported resource roots alongside supported roots.

### Exit Criteria

- Every selected resource can be represented as valid creator-model commands
  before execution begins.
- Every persisted reference has a destination-project id.
- Invalid packages fail before file download or project writes.
- The same manifest and project revision produce the same plan apart from the
  intentionally generated ids captured in that plan.

## Phase 4: Add A Shared Review And Choice UI

### Goal

Show users exactly what will happen and collect all choices before execution.

### Checklist

- [ ] Add a reusable import dialog component rather than duplicating a visual
      workflow in both pages.
- [ ] Keep localization inside the component/store/handlers instead of passing
      page copy objects through props.
- [ ] Use a source step for URL entry and loading.
- [ ] Use a review wizard showing: - package name, version, and description - source/publisher information when available - selected transforms or animations - primary resource - image dependencies - warnings and unsupported/skipped content - known download size and unknown-size indicators
- [ ] For multi-item packages, start with a visual resource-selection page; skip
      that page when the package contains only one matching resource.
- [ ] Show each selected resource on its own customization page with a package
      preview, name and description fields, referenced-media previews, Back,
      and Next.
- [ ] Put destination choices on each selected resource, put Submit All on the
      final selected resource, and preserve all earlier choices in the submitted
      payload.
- [ ] Let users select/deselect resources when dependency rules allow it.
- [ ] Let users edit imported resource names and descriptions before execution.
- [ ] Let users choose an existing destination folder or name a new folder for
      every imported resource type.
- [ ] Let users choose an existing destination folder or name a new folder for
      imported images.
- [ ] Show New Folder before Existing Folder, default to New Folder, and seed
      its name from `package.defaultFolderName`; never silently fall back to
      root.
- [ ] Validate new folder names and create requested folders in the same atomic
      batch as their imported children.
- [ ] Add media choices for import, existing-resource substitution, or skip
      according to the Phase 0 policy.
- [ ] Prevent confirmation while choices leave unresolved dependencies.
- [ ] Preserve same-name resources as separate copies without overwriting or
      renaming existing resources.
- [ ] Show validation errors beside the affected resource/choice where possible.
- [ ] Preserve source and review choices when navigating Back.
- [ ] Use the dialog close affordance for cancellation before execution.
- [ ] Disable duplicate source fetches and duplicate execution submissions.
- [ ] Add a progress step with current phase, completed count, total count, and
      cancel availability.
- [ ] Add a result step or stable toast/alert summary with imported, reused,
      skipped, and failed counts.
- [ ] On success, close the workflow and select the primary imported resource.
- [ ] On recoverable failure, preserve the review choices for retry.
- [ ] Ensure full keyboard operation, predictable focus, and Escape behavior.
- [ ] Ensure mobile layout, touch targets, safe areas, and scrolling work.
- [ ] Add accessible labels and announcements for loading, progress, errors,
      and completion.

### Exit Criteria

- Users can inspect and change every supported import decision before writes.
- Transform and animation imports use the same interaction pattern.
- Double submission is impossible from the UI.
- The workflow is usable by keyboard and on mobile-sized viewports.

## Phase 5: Stage Assets And Commit Atomically

### Goal

Make the import user-visible as one operation even though blob storage and the
project command store are separate systems.

### Checklist

- [ ] Add an import staging concept owned by the project asset service.
- [ ] Stage verified source files before creating repository file/image records.
- [ ] Generate thumbnails and derived metadata inside the staging lifecycle.
- [ ] Track every staged blob and derived blob by `planId`.
- [ ] Avoid creating image resources one at a time through the current
      `importImageFile(...)` happy-path helper.
- [ ] Build one command batch containing required file records, image resources,
      tags, and target transforms/animations.
- [ ] Use the existing command-session batch capability behind a dedicated
      project-service import method.
- [ ] Validate commands against the same state progression and command order
      used for submission.
- [ ] Recheck that destination folders and existing substitutions still exist
      immediately before commit.
- [ ] Compare the current repository revision with the plan revision.
- [ ] If state changed, revalidate/rebase safe choices or return a stable
      `import_project_changed` result for review; do not submit a stale plan.
- [ ] Submit the resource command batch once.
- [ ] Treat a rejected command batch as no resource commit.
- [ ] Finalize staged blobs after successful command submission according to the
      platform asset-store contract.
- [ ] On pre-commit failure or cancellation, delete staged blobs where safe.
- [ ] If immediate deletion is not guaranteed, record enough staging metadata
      for deterministic garbage collection.
- [ ] On post-commit finalization failure, keep the state recoverable and show a
      stable repair-required error rather than submitting duplicate commands.
- [ ] Reuse plan resource ids and command ids when retrying the same execution.
- [ ] Make repeated delivery of the same execution idempotent at the command
      session/storage boundary.
- [ ] Do not report success until repository state contains every planned
      committed resource.
- [ ] Return all created/reused ids in the execution result.

### Failure-Injection Cases

- [ ] First manifest request fails.
- [ ] Second of several files fails to download.
- [ ] Hash verification fails after earlier files were staged.
- [ ] Thumbnail generation fails.
- [ ] User cancels during download.
- [ ] User cancels after staging but before commit.
- [ ] Destination folder is deleted remotely during review.
- [ ] Tag or existing substitution is deleted remotely during review.
- [ ] Command preflight fails after all files are staged.
- [ ] Command submission returns a structured validation failure.
- [ ] Command submission throws a storage/network error.
- [ ] Repository apply/checkpoint fails after session submission.
- [ ] Asset finalization fails after command commit.
- [ ] Cleanup itself fails.
- [ ] The user retries the same plan after an unknown commit outcome.

### Exit Criteria

- No failure leaves a partially imported transform/animation/image resource set.
- Staged orphan blobs are removed or discoverable by garbage collection.
- Retrying the same plan cannot duplicate resources.
- Completion is confirmed from repository state, not only return values.

## Phase 6: Migrate Animations And Transforms

### Goal

Replace the two page-local import implementations with the shared production
workflow without regressing page selection or localization.

### Checklist

- [ ] Integrate the shared import dialog into the animations page.
- [ ] Integrate the same dialog into the transforms page.
- [ ] Preserve the current page-level Import action on desktop and mobile.
- [ ] Pass only intentional configuration such as expected resource type and
      initial destination context.
- [ ] Preserve explicit destination requirements from the current package spec.
- [ ] Make animation and transform multi-item behavior match the Phase 0
      decision.
- [ ] Remove duplicate manifest, validation, image import, and id-rewrite code
      from both handlers.
- [ ] Remove obsolete import-dialog fields/actions/selectors from both page
      stores after the shared component owns them.
- [ ] Remove obsolete import dialog view nodes and refs from both pages.
- [ ] Preserve page data refresh through the repository subscription model.
- [ ] Select the imported primary resource in the left explorer and center view.
- [ ] Clear search/tag filters only after explicit successful completion.
- [ ] Do not clear filters or review state on failure/cancellation.
- [ ] Ensure errors use `appService` feedback and stable localized copy.
- [ ] Remove page-local fallback parsing after the production URL contract is
      enabled.

### Exit Criteria

- There is one import implementation used by both pages.
- Existing page create/edit/preview workflows are unchanged.
- Successful imports appear and select correctly through repository-driven
  rendering.
- No obsolete half-MVP import state remains in either page.

## Phase 7: Error UX, Localization, And Observability

### Goal

Make failures understandable to users and diagnosable without leaking package
secrets.

### Checklist

- [ ] Replace hardcoded helper messages with structured error codes and details.
- [ ] Add every user-facing error and action label to all locale catalogs.
- [ ] Keep English, Japanese, and Simplified Chinese catalogs aligned.
- [ ] Use stable product messages instead of raw thrown error text.
- [ ] Include affected resource/file labels in safe structured details.
- [ ] Distinguish retryable and non-retryable failures.
- [ ] Offer Retry only when repeating the operation is safe and idempotent.
- [ ] Include a support/debug identifier without exposing URLs or tokens.
- [ ] Add import lifecycle events to the observability design: - plan started/completed/failed - execution started/progressed/completed/failed/cancelled - cleanup started/completed/failed
- [ ] Record safe metrics: - package schema - expected resource type - selected resource/dependency counts - planned/downloaded bytes - phase durations - stable failure code
- [ ] Do not record manifest bodies, file bytes, names when sensitive, absolute
      local paths, authorization headers, or URL query strings.
- [ ] Ensure observability delivery failure cannot affect import success.

### Exit Criteria

- Every expected failure maps to a stable localized message.
- Logs contain enough phase/failure context for support without containing
  signed-link secrets.
- Retry guidance matches actual idempotency guarantees.

## Phase 8: Test The Complete Contract

### Unit Tests

- [ ] URL and trust-policy validation.
- [ ] Bounded response readers and size limits.
- [ ] Timeout and cancellation behavior.
- [ ] Relative URL resolution against redirected final manifest URL.
- [ ] SHA-256 verification.
- [ ] MIME/extension/decoded-image mismatch handling.
- [ ] Exact package envelope validation.
- [ ] Collection/tree validation, including cycles and depth limits.
- [ ] Dependency graph construction.
- [ ] Complete id mapping for every supported reference path.
- [ ] Tag import/reuse/conflict planning.
- [ ] Creator-model payload preflight.
- [ ] No package-local references in final commands.
- [ ] Deterministic plan ids/resource ids during retry.
- [ ] Structured error serialization and localization mapping.

### Service Integration Tests

- [ ] Plan a real transform package against a real repository state.
- [ ] Plan a real multi-animation package against a real repository state.
- [ ] Execute through the real command API and repository projection.
- [ ] Assert committed file, image, tag, transform, and animation rows/state.
- [ ] Assert shared image dependencies are created once.
- [ ] Assert existing-resource substitutions create no unused files.
- [ ] Assert command-batch rejection creates no project resources.
- [ ] Assert staged assets are cleaned after every pre-commit failure.
- [ ] Assert retry after an unknown outcome is idempotent.
- [ ] Assert remote state changes between plan and commit are handled.
- [ ] Assert web and Tauri adapters satisfy the same logical contract.
- [ ] Add Android and iOS adapter contract coverage.

### Puty/Storage Tests

- [x] Add a declarative scenario for the complete import command batch where the
      expected committed rows are stable and practical to express.
- [ ] Assert storage idempotency when the same import batch is submitted twice.
- [ ] Assert no prefix of the resource batch commits after validation failure.

### VT/Browser Tests

- [ ] Animation import happy path.
- [ ] Transform import happy path.
- [ ] Multi-item review and primary selection.
- [ ] Existing destination-folder selection.
- [ ] New destination-folder creation with and without existing folders.
- [ ] Existing-image substitution.
- [ ] Invalid manifest feedback.
- [ ] Missing dependency feedback.
- [ ] Integrity failure feedback.
- [ ] Loading and progress state.
- [ ] Duplicate-click protection.
- [ ] Cancellation and retry.
- [ ] Keyboard-only completion.
- [ ] Mobile review/progress layout.
- [ ] Post-success explorer and center-view selection.

### Performance And Limit Tests

- [ ] Manifest exactly at and just over the size limit.
- [ ] File exactly at and just over the per-file limit.
- [ ] Total download exactly at and just over the total limit.
- [ ] Maximum supported resource and dependency counts.
- [ ] Deepest supported tree and one level beyond it.
- [ ] Memory remains bounded while downloading the largest supported package.
- [ ] Cancellation releases readers, buffers, and temporary assets promptly.

### Exit Criteria

- Tests use creator-model and real project-service paths where correctness
  depends on their validation or persistence behavior.
- Failure-injection tests prove user-visible atomicity.
- VT covers both pages and the shared workflow.
- Supported platforms pass the same import-client contract suite.

## Phase 9: Documentation, Rollout, And Removal Of The MVP Path

### Goal

Ship the new path deliberately and remove ambiguous compatibility behavior.

### Checklist

- [ ] Update `docs/import-packages.md` with final decisions and limits.
- [ ] Update `docs/upload-file-types.md` with imported-package image validation.
- [ ] Update `docs/platform/10-model-compatibility-and-upgrades.md` if package
      compatibility depends on creator-model versions.
- [ ] Update `docs/observability.md` with accepted import events and redaction.
- [ ] Add an asset-store/package-author validation guide with a valid example.
- [ ] Add malformed/unsupported example packages for automated tests only.
- [ ] Document CORS, signed URL, redirect, and CDN requirements for publishers.
- [ ] Document how users recover from cancellation, auth expiry, and failed
      integrity validation.
- [ ] Validate with known trusted packages before enabling arbitrary URLs.
- [ ] Validate on web and Tauri production-like builds.
- [ ] Validate Android and iOS behavior in their supported test environments.
- [ ] Confirm no feature flag uses browser-global debug variables.
- [ ] If rollout gating is needed, use normal app configuration and document
      removal criteria.
- [ ] Remove old raw collection/single-item URL parsing if Phase 0 rejects it.
- [ ] Remove obsolete page tests that only protect the old duplicated flow.
- [ ] Keep or rewrite tests that protect user-visible behavior and data
      contracts.
- [ ] Update `docs/roadmap.md` when the production acceptance checklist passes.

### Exit Criteria

- The public package-author contract matches shipped behavior.
- The MVP path cannot bypass production validation or execution.
- All supported platforms have a documented and tested network contract.
- Roadmap status reflects the actual shipping state.

## Suggested Pull Request Sequence

Keep pull requests independently reviewable and avoid mixing UI redesign with
storage changes before the contracts are settled.

1. Policy/spec decisions and error-code catalog.
2. Pure strict parser, schema validation, dependency graph, and planner tests.
3. Bounded import-package network client and platform contract tests.
4. Project-service plan API and creator-model command preflight.
5. Asset staging, cleanup, and command-batch execution.
6. Shared import review/progress component.
7. Animations page migration.
8. Transforms page migration.
9. Failure-injection, Puty, VT, mobile, and performance coverage.
10. Documentation reconciliation, MVP removal, and rollout gate removal.

Do not migrate either page to the new executor until creator-model preflight,
staging cleanup, and batch failure tests are in place.

## Final Production Acceptance Checklist

### Format And Compatibility

- [x] Public URL imports require one explicitly supported package schema.
- [x] Unsupported schemas fail before downloads or project writes.
- [x] Package compatibility policy is documented and tested.
- [x] Raw/unversioned compatibility input cannot bypass the production path.

### Correctness

- [x] Every selected resource validates against creator-model before execution.
- [x] Every package-local reference is mapped or rejected.
- [x] No package-local id remains in committed project state.
- [x] Tags, previews, masks, thumbnails, and file references follow explicit
      mapping rules.
- [x] Transform and animation multi-item behavior is consistent and visible.

### Reliability

- [x] Resource commits are all-or-nothing from the user's perspective.
- [x] Failed/cancelled imports leave no partial resource set.
- [x] Staged blobs are deleted or garbage-collectable.
- [x] Duplicate submission and safe retry cannot duplicate resources.
- [x] Project changes during review are revalidated before commit.

### Security And Resource Control

- [x] Manifest, per-file, total-size, count, and depth limits are enforced.
- [x] Requests support timeout and cancellation.
- [x] Relative URLs resolve safely against the manifest.
- [x] Hashes are verified when provided.
- [x] Imported image types follow the upload file-type policy.
- [x] Signed URLs and tokens are redacted from logs.

### UX And Accessibility

- [x] Users review exact resources, dependencies, names, and destinations.
- [x] Users can apply every supported media substitution choice.
- [x] Progress, cancellation, retry, and completion states are clear.
- [x] Errors are stable and localized.
- [ ] Keyboard and mobile workflows are covered by VT/manual validation.

### Architecture And Testing

- [x] Pages use one shared import component and project-service workflow.
- [x] The rendered production path contains no page-level package
      network/storage orchestration; the former unrendered handler is retained
      temporarily only for legacy regression tests.
- [x] Real creator-model/repository integration tests pass.
- [x] Focused failure-injection tests prove command rejection cleanup,
      cancellation, integrity failure, and unknown-outcome preservation.
- [ ] Platform client contract tests pass on web, Tauri, Android, and iOS.
- [ ] Animation and transform VT flows pass.
- [x] Targeted lint/format checks pass.
- [ ] Release validation is completed without relying on `bun run build:web`
      during routine development; run it only for the final release/VT gate as
      required by repository guidance.

The feature is production ready only when every item in this final checklist is
complete or explicitly removed through an approved product/engineering decision.
