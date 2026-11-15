# Project Content Patches

Date baseline: July 22, 2026.

## Status

Project content patches are an exceptional repair mechanism for correcting or
augmenting specific user-project data written by a released RouteVN Creator
version or template.

They are not:

- project format migrations
- creator-model schema migrations or command upcasters
- a replacement for fixing the default project template
- permission to rewrite user-authored data that merely resembles old defaults

The normal compatibility policy remains unchanged. Schema and project-format
changes must use the compatibility strategy described in
`10-model-compatibility-and-upgrades.md`.

## Current Patches

### Default Menu Text Styles

RouteVN Creator 1.9.1 introduced one grouped content patch for two default menu
text-style defects.

Completion marker:

```text
contentPatch.defaultMenuTextStyles-1-9-1 = true
```

The marker is stored in the project-specific DB `app` key-value store. One key
covers both repairs.

The repairs are:

| Repair                    | Target identity                               | Required legacy value                                                                 | Partial update                        |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------- |
| Selected menu text weight | text style `saV5A4pkvHRb`                     | `fontWeight` is exactly `"400"`                                                       | set `fontWeight` to `"700"`           |
| Load menu text style      | layout `fKr5fa67MQWh`, element `icn4dknq2kyp` | `textStyleId` is exactly `"5rwEfyx2GBEi"` and destination style `e2WbW3vcPZR9` exists | set `textStyleId` to `"e2WbW3vcPZR9"` |

Identity is determined only by the fixed repository ids. Display names and the
visible `Load` text are not patch selectors.

The corrected values also live in `static/templates/default/repository.json`
so newly created projects do not depend on the repair.

### Font Weight Metadata

RouteVN Creator 1.10.0 added one patch that populates the following flat fields
on legacy font resources:

- `minWeight`
- `defaultWeight`
- `maxWeight`

Completion marker:

```text
contentPatch.fontWeightMetadata-1-10-0 = true
```

The patch follows these rules:

1. A font that already has all three fields is a successful no-op and its file
   is not read.
2. A font with an incomplete field set is inspected and all three fields are
   written together.
3. TTF, OTF, WOFF, and WOFF2 files are inspected. TTC, EOT, fonts without file
   ids, folders, and unknown formats are successful no-ops.
4. File format is resolved from the backing file record first, with legacy
   font-owned file metadata used only as a fallback.
5. Static fonts receive their extracted `usWeightClass` for all three fields.
6. Variable fonts receive the extracted `wght` minimum, default, and maximum.
7. The patch does not change text-style font ids or existing text-style font
   weights.
8. Deterministically invalid or uninspectable font data is logged and treated
   as a successful no-op. File access failures and rejected font update commands
   abort the patch so it can retry later.
9. A deterministic inspection no-op leaves all three fields absent. The Text
   Styles UI interprets absent weight metadata as unknown and offers all
   standard weights instead of blocking the font.

New font uploads persist these fields whenever extraction succeeds, and the
default template fonts already contain them, so neither path depends on the
patch.

### Section Transition Reset Story

Route Engine 1.51.0 deprecated the `resetStoryAtSection` action in favour of
`sectionTransition` with `resetStory: true`. Both run identically, and Route
Engine keeps running the deprecated action. RouteVN Creator 1.22.0 stopped
authoring the deprecated action and added one patch that rewrites the ones
existing projects already hold.

This is a deliberate exception to "not a project format migration": the
project format and the creator-model commands do not change, only the spelling
of one action inside action payloads that the model treats as opaque. The patch
runner already provides the one-time marker, command-based writes, and remote
synchronization gate this rewrite needs.

Completion marker:

```text
contentPatch.sectionTransitionResetStory-1-22-0 = true
```

The patch follows these rules:

1. It looks for `resetStoryAtSection` at any depth in scene line actions,
   layout elements, control elements, and control `keyboard` and `keyup`
   bindings. That covers conditional branches and confirm-dialog actions.
2. Each one is replaced in place by
   `sectionTransition: { sceneId, sectionId, resetStory: true }`, keeping its
   `screen` transition. `sceneId` is the scene that owns the section.
3. A reset whose section no longer exists is a successful no-op.
4. A reset that sits next to a `sectionTransition` in the same action set is a
   successful no-op. Route Engine already rejects two navigation actions in one
   set, and which one the author meant is unknown.
5. A line is updated with `line.update_actions` and `replace: true`, because a
   merge would keep the deprecated action next to its replacement. Elements are
   updated with only the fields that changed and `replace: false`. Control key
   bindings are updated with `control.update`, one update per binding group.
6. The items to rewrite are selected from one snapshot, but each rewrite is
   made from the item as it is in the current repository state, read right
   before its update is submitted. An item that was edited while earlier
   updates were awaited keeps that edit, and an item whose reset or section is
   gone by then is left alone.
7. A rejected update is logged and skipped, and the remaining items are still
   rewritten. The marker is not written, so the patch is evaluated again the
   next time the project is opened. A retry is safe because rewritten actions
   no longer match.
8. A failure never keeps the project from opening. Unlike the other patches,
   this one touches content the user authored, so an update the model rejects
   for an unrelated reason must not block the project. A thrown error stops
   the patch, is logged, and leaves the marker unset.

These are the only places a project holds actions: the creator model allows
actions in `line.actions`, in layout and control element interaction fields
, and in control `keyboard` and `keyup`
bindings. Scenes, sections, layouts, and the other resource collections have
fixed fields that cannot hold an action.

Older clients do not know `resetStory`. A client older than 1.22.0 that opens
a rewritten project runs the transition without resetting the story and drops
the option when it saves that transition again. The project format version
gate follows the application major version, so it cannot keep those clients
out.

The rewrite itself is `upgradeResetStoryActions` in
`src/internal/navigationActions.js`. Actions left in place by rules 3 and 4,
and deprecated actions that arrive later through imported content, still run
and still open in the Section Transition editor.

The default template uses the new form, so new projects do not depend on the
patch.

## Default Menu Patch Execution Contract

The grouped patch follows this order:

1. Read `contentPatch.defaultMenuTextStyles-1-9-1` from the project KV store.
2. If the value is exactly `true`, stop without inspecting or changing project
   content.
3. Read the current repository state.
4. Run each repair independently and only when its target ids exist and its
   current value exactly matches the documented legacy value.
5. Submit repository changes through the existing creator-model commands.
6. After both repairs either succeed or resolve as no-ops, write the marker as
   `true`.

Missing ids, missing destination resources, already-correct values, and
user-customized values are successful no-ops. They are never recreated,
renamed, or overwritten.

The marker is still written after successful no-op evaluation. This makes the
repair a one-time decision: if a missing default id is imported later, or a
user later changes a value back to its legacy value, this patch must not run
again.

If a submitted update fails or throws, the marker is not written. If the first
repair succeeds and the second fails, a retry is safe because the first repair
will see its new value and become a no-op. If the marker write itself fails, a
retry is also safe for the same reason.

An in-memory per-project promise prevents duplicate execution by concurrent
repository-ensure calls in one application instance. The persisted marker is
the cross-restart completion record.

Once the patches complete for an opened repository, normally during the
route's repository ensure that opens the project, later repository-ensure
calls for that repository skip them without reading the markers, so the
calls pages make do not touch the project store. Reopening the project
evaluates the patches again.

The font metadata patch uses the same marker ordering and concurrency guard.
When a retry follows a partially completed run, fonts that now have all three
fields are skipped before their files are read.

## Persistence And Commands

The patches must use existing repository commands:

- `textStyle.update` with only `fontWeight`
- `layout.element.update` with only `textStyleId` and `replace: false`
- `font.update` with `minWeight`, `defaultWeight`, and `maxWeight` together
- `line.update_actions` with the complete rewritten actions and
  `replace: true`
- `layout.element.update` and `control.element.update` with only the rewritten
  fields and `replace: false`
- `control.update` with only the rewritten `keyboard` or `keyup` bindings

It must not mutate projected repository state directly and must not introduce a
patch-specific creator-model command. Command submission preserves normal
repository persistence, collaboration, validation, and projection behavior.

The marker belongs in the project-specific `store.app` area because it is
app-owned repair bookkeeping. It must not be stored in:

- `projectInfo`, whose fields have a separate ownership contract
- global `userConfig`, which does not travel with the project DB
- `creatorVersion`, which is a project-format compatibility gate
- `layoutSchemaVersion`, which describes layout structure rather than content
- a hidden user-visible repository resource

The marker is local to one project DB and is not synchronized as repository
content. Another device or project copy can therefore evaluate the same patch.
Exact legacy-value predicates and idempotent partial assignments remain
mandatory even when a marker exists.

## Collaboration Safety

Local and native projects may evaluate the patch after repository hydration.

Web projects that can synchronize with a remote authority have a stricter
contract. A remote project must not evaluate or mark the patch during ordinary
repository ensure because its IndexedDB projection can be stale.

Remote evaluation is allowed only after all of the following are true:

1. the initial remote `syncNow()` completed successfully
2. queued committed commands finished applying to the repository projection
3. any uncommitted local events were replayed and synchronized
4. the second apply queue drain completed
5. no projection gap is stored

The web collaboration session exposes this as
`hasCompletedInitialRemoteSync()`. The connection runtime calls
`projectService.ensureProjectContentPatches()` only when that method returns
`true`.

If transport attachment fails, initial synchronization fails, or a projection
gap exists, the patch is not evaluated and the marker remains absent. Project
open may continue with its existing offline or compatibility behavior, but the
repair must wait for a later authoritative synchronization opportunity.

This prevents a stale local value from overwriting a newer server-side user
customization. It does not add compare-and-swap semantics to ordinary
collaboration commands; a truly simultaneous edit after synchronization still
uses the platform's normal last-writer behavior.

## Rules For Future Content Patches

Do not turn this implementation into a general migration registry by default.
A future content patch requires an explicit review of all of these points:

1. The defect was written into user projects by a released application or
   template.
2. Targets have stable ids; names or visible copy are not sufficient.
3. Every mutation has an exact legacy-value predicate that protects user
   customization.
4. Updates are the smallest possible partial creator-model commands.
5. Missing targets and unexpected values are documented no-ops.
6. A new, unique project-KV key identifies the patch group. Do not reuse or
   change the meaning of an existing key.
7. The marker is written only after the full group succeeds.
8. Remote web execution is gated by authoritative synchronization and
   projection readiness.
9. The current default template is fixed separately.
10. Tests cover applied, already marked, missing, customized, failed-command,
    local-project, successful-sync, and failed-sync behavior.
11. The new persisted key is added to `07-persisted-key-catalog.md`.

Do not remove a shipped patch merely because new projects contain corrected
defaults. Old project databases can remain unopened for long periods and still
need the repair when they return.

## Implementation And Test Mapping

Implementation:

- shared patch predicates, commands, marker, and explicit entry point:
  `src/deps/services/shared/projectServiceCore.js`
- web local-project classification:
  `src/deps/services/web/collabBootstrapService.js`
- web initial-sync readiness and projection-gap check:
  `src/deps/services/web/projectServiceAdapters.js`
- post-sync invocation:
  `src/deps/services/web/collab/connectionRuntime.js`
- corrected defaults: `static/templates/default/repository.json`

Primary regression coverage:

- `tests/projectService/projectServiceCore.releaseRuntime.test.js`
- `tests/web/projectServiceAdapters.test.js`
- `tests/collab/connectionRuntime.test.js`
- `tests/project/layout.richText.test.js`
