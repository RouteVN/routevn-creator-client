# Command validation preparation

Prepared: September 13, 2026. User review completed: September 17, 2026.
Scope: specifications, captured fixture data, and
baseline verification only. No application/model implementation, active test
runner, dependency change, database migration, or release is included.

This package completes the preparation requested before implementing the
[versioned command validation specification](../command-schema-validation-spec.md).
The chosen persisted format is still envelope 2 with `{ mv, commandPayload }`.
Original historical commands retain envelope 1 and their recorded data.

Review decision: **a legacy project that opens before upgrading must still
open afterward with the same recovered state and availability; subsequent
edits receive strict validation.** Existing legacy normalization and recovery
remain compatible. New blocking legacy completeness/integrity checks are
deferred. This is a release requirement to test, not a guarantee already
established by these documentation artifacts.

## Approved behavior from the user review

The following decisions were reviewed one at a time and accepted. They record
the intended behavior, not completed implementation or permission to start it.
The detailed specification and fixture expectations must preserve these rules.

1. **Editing another line:** validate the new edit and its effects. Unrelated
   old fields/actions remain unchanged and cannot cause retroactive strict
   rejection. An invalid edit leaves the project open and saved data intact.
2. **Editing an old action itself:** the resulting edited action must satisfy
   strict validation, including any old content explicitly retained by the
   edit. Explain what needs fixing; leave the saved action intact on failure.
   Untouched sibling actions are not automatically revalidated strictly.
3. **Copying or duplicating:** copied content is new content. Validate all its
   actions strictly. If invalid, reject the copy and identify the problem;
   preserve the original without silently stripping fields.
4. **Restoring a whole-project backup:** retain original history and version
   information. Use the recorded contracts and existing legacy recovery rules.
   Subsequent edits are strict; restoration does not clean or upgrade old data.
5. **Moving an existing section:** retain line identities and old action data.
   Check placement and affected references. Reject a move that newly breaks
   a supported reference, explaining which reference needs updating. Leave
   the section in place; unrelated pre-existing problems do not block it.
6. **Reloading mixed history:** old commands keep existing validation/recovery.
   A command saved with `mv: 15` continues using that recorded contract after
   version 16 ships. Reloading never silently upgrades or rewrites commands.
   These version numbers are examples; the released model determines M.
7. **Unsupported newer versions:** detect an unsupported envelope/model version
   before replaying that command and explain that a compatible app update is
   required. Do not skip or reinterpret it. This clarifies the existing
   compatibility requirement instead of relying on a generic validation error;
   it adds no new legacy load restriction. Already released binaries cannot
   retroactively gain the new detection behavior.
8. **New inputs cannot choose older validation:** the app assigns the current
   version to UI/API authoring requests. Omitting or supplying an older `mv`
   cannot bypass strict validation. Historical replay/restore is a separate
   application operation, not a caller-selectable submission mode.
9. **Unnecessary fields:** reject unsupported fields in new input with the
   affected path. Preserve historical fields; automatic historical cleanup
   is deferred. No silent stripping is introduced by this feature.
10. **Command batches:** validate the entire group in order before writing any
    commands. Later commands may depend on earlier proposed results. A
    validation error anywhere means zero command rows saved for that request.
    This does not promise transactional disk writes after validation succeeds.
11. **New projects and templates:** strictly validate the complete initial
    state before accepting `project.create`. Audit/fix shipped template data
    and add automated checks before release. Do not put `mv` inside template
    project data: the app assigns its current version to the generated creation
    command. Updating a template does not alter projects already created from it.
12. **Storage failures and reconciliation:** persisted history is authoritative.
    Before further writes, reread the attempted command IDs and compare their
    versions and payloads under the project coordinator. Rebuild accepted state
    from the actual ordered history, not merely the last row or timestamp.
    Retain unsaved work and reuse original IDs on retry to prevent duplicates.

For decision 12, if saving A → B → C fails:

- Only matching A and B exist: accept the saved prefix through B; C remains
  unsaved. Retry C with its original identity against the refreshed state.
- All three matching records exist: recover successful acceptance once,
  including when only the acknowledgment was lost.
- None exist: retain the previous accepted state; the whole batch is unsaved.
- An unexpected gap, conflicting contents, or an unreadable database prevents
  reconciliation: pause further writes and report the problem without guessing.

The constraints remain: no server work, SQLite schema migration, history
rewrite, or new blocking checks on legacy recovery. Compatibility and strict
behavior still require implementation tests before release.

## Deliverables

| Artifact                                                   | What it settles                                                                                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Action contracts](./action-contracts.md)                  | Exact supported names, fields/types/ranges, nested contexts, references/bindings, clear/merge/preserve rules, and shipped adapter/template exceptions |
| [Limits and inputs](./limits-and-inputs.md)                | Measured checked-in corpus, concrete new-input limits, historical processing policy, emitter/alias coverage, and inventory method                     |
| [Machine-readable input inventory](./input-inventory.json) | Source paths/hashes, action/holder lists, measured sizes/depths, registry coverage, and selected limits                                               |
| [Fixture catalog](./fixture-catalog.md)                    | Unchanged legacy samples, neutral scenarios, observed baseline outputs, and explicitly unexecuted strict expectations                                 |
| [Fixture manifest](./fixtures/manifest.json)               | Exact artifact/source hashes, model-version binding, and provenance                                                                                   |
| [Replay and acceptance](./replay-and-acceptance.md)        | Complete chronological authority, same-identity moves, platform coordination, write recovery, acknowledgment promotion, and retained recovery sources |
| [Upstream and rollout](./upstream-and-rollout.md)          | Creator-model and Insieme PR scopes, release prerequisites, client slices, reader/writer delivery, and rollback                                       |

## Decisions made during preparation

- Model validation covers the shipped Creator shapes explicitly, including
  rich dialogue, template forms, callback contexts, generated filters, and
  character spritesheets. Engine-only features do not automatically enter the
  authoring registry.
- New-input limits are concrete and measured against checked-in content.
  Historical reading uses bounded processing/scheduling without applying new
  size/depth validity caps to old envelope-1 projects.
- One shared repository coordinator owns validation through persistence and
  accepted-state advancement. Web uses Web Locks; native platforms use a
  native project writer owner and an OS lock, with a queue inside that owner.
- Historical transitions use the resources and ownership that existed at
  their preceding history position. UI scenes derive from accepted state.
- Retry, history, and cache checks preserve payload dictionary order where
  indexed spritesheet playback depends on it; no historical payload is sorted.
- A future same-identity section move uses the existing model move command
  and retains line data. The current delete/move/recreate history remains
  replayable; actual copy/duplicate operations validate new content strictly.
- Existing checkpoint-backed recovery sources remain in place. New disposable
  caches use distinct view names; the preserved legacy cutoff is followed by
  strict suffix replay. Missing-scene cases retain existing recovery behavior;
  this feature adds no blocking legacy completeness check.
- The model package owns strict domain support; Insieme exposes original
  versions for exact strict decoding while preserving legacy reads. Both fixes use normal published
  releases. The reader-first rollback policy is explicit.

## Verification and its meaning

The input inventory measures the shipped default template, all model
compatibility artifacts, relevant client sources, and checked-in storage
scenarios. It records its exact corpus and limitations; it is not a survey of
users' private project databases.

The fixture package preserves six archival YAML copies and records current
outputs for 44 archived-stream commands, nine setup commands, and 19 commands
across eight synthetic sequences. Sequential current-model application matched
batch replay. Focused adapter/recovery probes record the reviewed existing
behavior. Their results are baseline evidence, not proof that the proposed
strict validator or new coordination already works.

Documentation links, data parsing, source/fixture hashes, and formatting are
checked during preparation. Copied historical YAML bytes are preserved rather
than reformatted. Strict action validation, native/Web coordination, failure
injection, and actual release compatibility must pass their specified tests
when implementation exists.

## Handoff

Work is parked on the local branch `docs/versioned-schema-validation-plan`.
The user requested returning to `main` for other work. Implementation has not
started; resume it only when requested. The short review record above is the
starting point for resuming, with the specification and preparation artifacts
providing the technical details.

When implementation is requested, start the model and Insieme owner changes,
then integrate the client in the documented order. The remaining gates are
implementation, published dependencies, and feature/platform verification;
no additional action-catalog or coordination design task is left as a
prerequisite in the original plan. Source revisions and hashes describe the
captured baseline; check intervening repository changes when resuming.

Do not enable strict writes incrementally while leaving an action holder or
authoring route permissive. Until enforcement is complete, the documents and
fixtures remain preparation artifacts, and the app's behavior is unchanged.
