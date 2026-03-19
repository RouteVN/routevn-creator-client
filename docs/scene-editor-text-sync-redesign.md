# Scene Editor Text Sync Redesign

## Purpose

`src/pages/sceneEditor` currently mixes immediate DOM editing, optimistic store
mutation, debounced repository writes, and manual repository refresh logic.

That makes the editor feel fragile in exactly the places users notice most:

- typing and pressing Enter quickly
- deleting/merging lines
- multi-line paste
- navigating away before debounce finishes
- contenteditable reconciliation after rerender or remote sync

This document records the current failure modes and proposes a replacement
model that separates immediate editing from debounced persistence.

## Current Flow

Today the text path looks like this:

```text
rvn-editable-text DOM
-> linesEditor emits input / split / merge / paste events
-> sceneEditor mutates page store immediately
-> pendingQueueService debounces repository writes
-> structural operations flush the queue before mutating the repository
-> sceneEditor manually resyncs repository/domain state in some handlers
-> renderCanvas runs on a separate debounced path
```

The main files involved are:

- `src/primitives/editableText.js`
- `src/components/linesEditor/linesEditor.handlers.js`
- `src/pages/sceneEditor/sceneEditor.handlers.js`
- `src/pages/sceneEditor/sceneEditor.store.js`
- `src/internal/ui/sceneEditor/lineOperations.js`
- `src/internal/ui/sceneEditor/runtime.js`
- `src/deps/services/pendingQueueService.js`

## What Is Wrong With The Current Model

### 1. There is no single authoritative text state while editing

At different moments the "real" text may live in:

- the `contenteditable` DOM
- `sceneEditor.store` via `setLineTextContent(...)`
- the pending debounce queue
- the repository/domain snapshot returned by `projectService`

The code compensates for this by pushing data between layers manually. That is
why the scene editor needs queue replay, manual flushes, local suppression
flags, and direct store mutation of repository/domain data.

### 2. Input acceptance is tied to selection, not to the actual edited line

`handleEditorDataChanged(...)` ignores input when:

- the event line is no longer the selected line
- the line is temporarily locked for split/merge

That guard avoids some stale events, but it also means a late input event can
be dropped even if it belongs to the line the user just edited.

This is especially risky around:

- Enter
- Backspace-at-start merge
- fast click-away after typing
- fast line navigation after typing

### 3. Pending text replay depends on the selected section

`applyPendingDialogueQueueToStore(...)` replays queued content through
`setLineTextContent(...)`.

`setLineTextContent(...)` writes through `state.selectedSectionId`, not the
actual section that owns the queued line. That means a pending draft can fail
to reapply correctly after the user changes selection before the debounce
flushes.

This is a real correctness bug, not just an architectural smell.

### 4. Structural edits wait on persistence work before the UI settles

Split, merge, paste, new line, swap, and delete all go through async flows that
flush queued writes and then submit repository commands before focus and line
structure are fully settled.

That is why the user can feel:

- a slight delay on Enter
- a slight delay on deleting/merging a line
- occasional mismatch between what the DOM just showed and what the model
  settles to

The UI should not wait on persistence policy to decide whether a new line
exists visually.

### 5. Enter is implemented as keydown plus requestAnimationFrame snapshotting

The current Enter flow is roughly:

```text
keydown Enter
-> preventDefault
-> requestAnimationFrame(...)
-> read caret + DOM text
-> dispatch splitLine
```

That is brittle for `contenteditable`.

It depends on timing assumptions around:

- caret state already being stable
- the latest input already being reflected in DOM/store
- no late input event arriving after the split starts

This is the wrong level to model structural editing. `beforeinput` is a better
fit because it describes the intended edit (`insertParagraph`,
`deleteContentBackward`, `insertFromPaste`) before browser mutation.

### 6. The page is not repository-driven like the rest of the app wants

Other project-backed pages mostly subscribe to repository state through
`createProjectStateStream(...)`.

`sceneEditor` instead:

- manually syncs after local commands
- listens for a custom remote refresh stream
- replays pending queue entries back into store

That keeps scene editing on a special sync model that is harder to reason
about and easier to break.

### 7. Canvas rendering and text rendering are intentionally decoupled

While typing, the page dispatches `sceneEditor.renderCanvas` with
`skipRender: true` so the full UI does not rerender and disturb caret state.

That is understandable, but it means the current system already admits that the
repository-backed page render cannot safely be the live text authority during
editing.

The right response is not more manual syncing. The right response is to add an
explicit editor-local draft layer.

## Design Goals

The replacement design should satisfy all of these:

- Typing must feel immediate.
- Enter, merge, and delete must feel immediate.
- Debounced saves must remain possible.
- A rerender must never discard newer local text.
- Navigating away, previewing, or unmounting must flush local drafts.
- Repository updates must still drive the page when no local draft overrides
  them.
- The sync model must be simple enough that we can test it directly.

## Proposed Model

Introduce a dedicated scene editor draft session for the active section.

The important change is:

- repository snapshot is the source of truth for committed state
- draft session is the source of truth for in-progress editing
- the DOM is only a view of the draft session, never the hidden canonical state

This means subscribing from the repository does **not** put local typing on a
repository round-trip. Repository subscription is the committed read model. The
draft session is the immediate local write model.

### High-Level Architecture

```text
projectService.subscribeProjectState()
-> repository snapshot in sceneEditor store

editor input / beforeinput
-> section draft session updates immediately
-> selectors overlay draft session on top of repository snapshot
-> linesEditor + canvas render from draft-aware view data

debounced commit scheduler
-> persists dirty draft lines to repository
-> repository subscription acknowledges committed state
-> dirty draft entries are cleared when acked
```

### Repository Reads vs Immediate Draft Writes

For the local user, the typing path should be:

```text
keypress / input
-> DOM updates
-> draft session updates immediately
-> visible UI reads from draft session
```

The repository path should be separate:

```text
dirty draft
-> debounced or explicit commit
-> repository command accepted
-> repository subscription emits committed snapshot
-> draft session marks that work as acknowledged
```

Important rule:

- local typing must never wait for repository acknowledgement to become visible

If the local user can feel repository delay while typing, the design is wrong.

### Why Section-Scoped Draft Session

Text editing is not only per-line. The hard cases are structural:

- split line
- merge lines
- insert line before/after
- paste multiple lines
- delete selected line

Those are section operations. A section-scoped session can own:

- line order
- line text drafts
- provisional structural changes
- active selection/caret targets
- dirty and flushing state

That is a better fit than trying to patch individual lines independently while
the section structure changes under them.

## Proposed State Shape

The exact names can change, but the model should look like this:

```js
{
  repositorySnapshot: {
    repositoryState,
    domainState,
    revision,
  },
  editorSession: {
    sceneId,
    sectionId,
    baseRevision,
    lineOrder: ["l1", "l2"],
    linesById: {
      l1: {
        text: "Hello",
        baseText: "Hello",
        dirty: false,
        saveState: "idle",
      },
      l2: {
        text: "World",
        baseText: "World",
        dirty: true,
        saveState: "scheduled",
      },
    },
    selection: {
      lineId: "l2",
      caret: 5,
      goalColumn: 5,
    },
    conflictsByLineId: {},
  },
}
```

Key rules:

- Never mutate `repositorySnapshot` optimistically for text input.
- Never use `selectedSectionId` as a surrogate for locating a draft line.
- Dirty state is explicit.
- Reconciliation uses a local repository `revision` to detect that the snapshot
  changed, then uses snapshot content comparison to decide whether that change
  is an ack, an adoptable non-conflicting update, or a conflict.

### What `revision` means here

`revision` is a local repository snapshot counter.

It should increase whenever the local repository instance changes, regardless
of whether that change came from:

- a local command applied immediately
- a remote committed event applied to this client
- replayed repository events during boot or sync

It is **not**:

- a global collaboration version
- a server commit number
- a guarantee that two clients share the same value for the same logical state

Its purpose is only:

- tell the editor that the repository snapshot changed
- let the draft session know its base snapshot is now stale and reconciliation
  must run

For local-only projects, this still works fine. Even without server commits,
the local repository snapshot changes when local commands are applied, so the
local `revision` still increases.

## Input Model

### Use `beforeinput` for structural edits

Move structural editing out of `keydown` timing and onto semantic input types:

- `insertParagraph` -> split line
- `deleteContentBackward` at caret 0 -> merge with previous line
- `insertFromPaste` with newline content -> multi-line paste transaction

`keydown` should remain for:

- navigation
- block-mode shortcuts
- Escape / preview shortcuts
- line movement shortcuts

### Use `input` for plain text updates

For normal typing:

1. let native `contenteditable` update the DOM
2. read text + caret on `input`
3. write that value into the draft session immediately
4. schedule a debounced commit

That keeps the typing path simple while still making structural edits explicit.

### Composition / IME contract

The new editor must handle IME composition explicitly.

Rules:

- while composition is active, do not run structural transactions
- while composition is active, do not treat Enter as split-line
- while composition is active, plain text draft updates may continue
- only after composition ends may `beforeinput` structural intents be handled

This is required so the rewrite does not regress Chinese, Japanese, or Korean
input while fixing Enter and delete timing for Latin-keyboard editing.

At implementation level, the editor session should expose a simple boolean such
as `isComposing`, and `linesEditor` should route `compositionstart` /
`compositionend` into that state.

## Save Policy

### Text edits

Plain text changes should be debounced, but the debounce should only affect the
repository write, not the visible UI.

Recommended behavior:

- debounce text commits per active section or per line
- use a much shorter debounce than the current 2000ms for active editing
  sessions, for example 250ms to 400ms
- flush immediately on blur, selection change, preview, section switch,
  structural edit, and unmount

This still gives immediate local feedback because the visible editor state comes
from the draft session, not from the repository.

### Structural edits

Structural edits should update the draft session immediately and persist
immediately in the background.

Important rule:

- do not wait for the repository round-trip before showing the split/merge/new
  line in the UI

The repository command is persistence work. The visible line structure should
already exist in the local draft transaction.

### Caret ownership after transactions

The draft session must be the single owner of post-transaction selection state.

For each structural transaction, the session should produce an explicit
selection target such as:

```js
{
  lineId,
  caret,
  goalColumn,
  direction,
}
```

Examples:

- split line: focus new line at caret `0`
- merge with previous line: focus previous line at the old boundary
- multi-line paste: focus last inserted/affected line at the expected caret
- new line before/after: focus created line at caret `0`

Important rule:

- handlers and DOM helpers must not invent competing caret decisions after the
  transaction is already resolved by the draft session

`linesEditor` can still perform the low-level DOM focus/caret placement, but it
should do so from one canonical session-produced target.

## Repository Reconciliation

The page should subscribe to project state like other project-backed pages.

On each repository snapshot:

1. update `repositorySnapshot`
2. if the active section has no dirty draft entries, replace the visible
   section state from repository
3. if a line has a dirty draft and repository now matches that draft, treat it
   as acknowledged and clear dirty state
4. if a line has a dirty draft and repository differs from that draft, keep the
   local draft visible and compare against base state
5. if that differing repository update is non-conflicting for the local draft,
   adopt the repository change where appropriate
6. if it conflicts with the local draft, preserve the local draft and mark the
   line as conflicted

Important clarification:

- `revision` tells us that reconciliation must happen
- snapshot comparison decides whether the result is ack, adopt, or conflict

We do **not** need a committed cursor or global commit id for the editor to
work correctly.

### Minimal per-line data needed for reconciliation

For each dirty draft line, keep at least:

- `baseRevision`
- `baseText` or base structural snapshot
- `draftText` or draft structural snapshot
- `dirty`
- optional `saveState`

Then when a repository snapshot arrives with a higher `revision`:

- if repository state equals `draftText`, clear dirty state
- if repository state equals `baseText`, keep waiting
- if repository state differs from both, reconcile as remote change vs local
  draft and mark conflict if needed

### Minimum conflict UX

The cutover should ship with a minimal explicit conflict policy.

When repository state differs from both base and draft for the same line:

- keep the local draft visible
- mark the line as conflicted in editor session state
- show a clear but lightweight visual indicator on that line
- do not silently overwrite the local draft
- do not auto-merge text content

We do not need full conflict-resolution UI in the first cutover, but we do need
deterministic behavior. The minimum acceptable behavior is "preserve local
draft, mark conflict, avoid silent data loss".

This removes the need for:

- `applyPendingDialogueQueueToStore(...)`
- direct optimistic mutation of `repositoryState` / `domainState`
- selection-dependent replay of pending content
- manual "resync the store after every local command" logic for text edits

## Collaboration Scope

This design fixes local correctness and local UX.

It also makes committed collaboration simpler because every client can read from
the same repository subscription model.

### What becomes immediate

- local typing becomes immediate from local draft state
- local structural edits become immediate from local draft transactions
- committed remote updates become easier to reconcile because the page reads
  from repository subscription consistently

### What does not automatically become immediate

Repository subscription does **not** mean other collaborators will see every
keystroke immediately.

If we keep text saves debounced, then remote collaborators will normally see the
committed result after that debounce and commit path completes.

If we want true live remote drafting, that is a separate capability:

- send ephemeral draft events immediately for the active line/section
- keep committed repository writes debounced
- reconcile remote draft presence separately from committed project data

That is the clean design if the product wants "others can see me typing" but we
do not want every keystroke to become committed repository history.

### Current command-model limit

This design does **not** magically provide character-level collaborative editing
on the same line. If two clients type into the same line concurrently, the
current command model is still effectively last-write-wins at line granularity.

If true same-line co-editing is a product requirement, that is a separate
project and needs one of:

- a text CRDT per line
- an OT-based text channel
- an explicit single-writer lock for the active line

We should be explicit about that boundary instead of pretending a better local
draft model solves collaborative text merging.

## Recommended Implementation Shape

### 1. Make sceneEditor repository-driven

- subscribe through `createProjectStateStream({ projectService })`
- store repository snapshots directly, including a local `revision`
- stop relying on the custom remote refresh path for text correctness

### 2. Add a dedicated draft-session module

Suggested home:

- `src/internal/ui/sceneEditor/editorSession.js`

This module should own:

- section draft creation from repository snapshot
- local transactions for split/merge/paste/new line/delete
- commit scheduling
- repository reconciliation

### 3. Keep linesEditor UI-focused

`linesEditor` should stay responsible for:

- caret and focus behavior
- block-mode and insert-mode interaction
- dispatching semantic edit intents

It should not own:

- repository syncing
- debounce queues
- scene-specific persistence rules

### 4. Render from draft-aware selectors

The selectors that feed:

- the line list
- selected line actions
- project data for the preview canvas

should all derive from:

```text
repository snapshot + editor session overlay
```

not from optimistic mutation of repository/domain state objects.

## Single-Cutover Plan

We should treat this as one migration, not a long-lived phased hybrid.

The branch can be implemented incrementally, but once merged the editor should
switch fully from:

- optimistic repository/domain mutation in page store
- pending queue replay into store
- manual text resync rules

to:

- repository subscription for committed reads
- draft session for immediate local editing
- explicit commit scheduler for persistence

The one-time cutover should include all of the following together:

1. `sceneEditor` subscribes through `createProjectStateStream(...)` for
   repository snapshots, including a local `revision`.
2. A new editor-session module owns draft text, section structure drafts,
   selection targets, dirty state, and reconciliation.
3. `linesEditor` emits semantic edit intents and no longer relies on Enter
   snapshot timing for structural correctness.
4. Text rendering, actions rendering, and preview/canvas project data all read
   from `repository snapshot + editor session overlay`.
5. Debounced text persistence moves behind the editor session instead of
   mutating page store repository/domain objects directly.
6. Old queue replay and optimistic text mutation paths are removed completely.

There should not be a permanent mixed mode where both the old queue/store
mutation path and the new draft-session path stay alive together.

## Testing Plan

We should add tests around the new session logic before wiring all UI details.

At minimum:

- typing updates visible text immediately without mutating repository snapshot
- typing then Enter keeps the latest character and splits at the correct caret
- typing then fast section/line switch flushes correctly
- Backspace at start merges instantly and keeps combined text
- multi-line paste creates the expected local section draft and persisted
  commands
- IME composition does not trigger split/merge transactions while composing
- post-transaction caret lands on the session-selected target
- local repository revision increments on both local applies and remote applies
- repository refresh during dirty local edit does not drop the local draft
- repository refresh that now matches the draft clears dirty state as ack
- repository refresh that differs from both base and draft preserves local draft
  and marks conflict
- clean repository refresh replaces visible text as expected

The main trick is to move the difficult logic into a pure draft-session module
so it can be tested without the browser first.

That is necessary but not sufficient. We should also run a small browser-level
test slice for:

- Enter split behavior
- Backspace-at-start merge behavior
- multi-line paste behavior
- caret placement after structural edits
- IME composition boundaries

## Decision

Do not keep patching the current queue-plus-optimistic-store approach.

The right long-term fix is:

1. repository-driven page snapshots
2. explicit editor-local draft session for immediate UI
3. debounced persistence as a separate concern
4. `beforeinput` transactions for structural contenteditable edits
5. optional ephemeral draft broadcast if we want remote users to see typing
   immediately

That is the only model that cleanly resolves both sides of the tension:

- the UI must update immediately
- saves can still be debounced safely
