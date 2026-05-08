# macOS Tauri Lexical Selection Notes

## Symptom

In the scene document Lexical editor on macOS Tauri, the editor can be focused
and receive keyboard events while printable typing or Enter-based line splitting
does not visibly update the document.

Observed behavior:

- `keydown` reaches the contenteditable editor.
- `beforeinput` reaches the contenteditable editor with valid `inputType` and
  `data`.
- The native DOM selection points at the visible caret.
- Lexical's internal range selection can be missing or stale.

## Cause

The macOS Tauri WebKit path can leave Lexical's internal selection out of sync
with the native DOM selection. Editor commands that rely only on
`$getSelection()` may become no-ops even though the browser has a valid caret.

## Current Workaround

`src/primitives/lexicalSceneDocumentEditor.js` treats the native DOM selection
as the source of truth before selection-sensitive text edits:

- printable `beforeinput` text insertion syncs Lexical selection from the native
  line selection before inserting text
- Backspace deletion uses the native line selection for collapsed caret and
  selected-range deletes
- Backspace deletion now handles native selections spanning multiple lines,
  merging the remaining start/end content into one line
- Plain Backspace is handled from `keydown` and the matching
  `deleteContentBackward` `beforeinput` is skipped, preventing double deletes
  and selection races
- Backspace prevents the native event before mutating Lexical, then reinforces
  the native and Lexical selections from the primitive
- Blur events are ignored when the editor is still the active element, covering
  WebKit blur events emitted after programmatic caret restoration
- A short programmatic-focus window ignores follow-up blur events after
  `focusLine`, then reapplies the last caret target
- Character Backspace does not call `focusLine` when the editor is already
  active; it only validates focus on the next frame to avoid triggering WebKit
  blur loops
- Backspace at the start of a line merges that line into the previous line and
  sets the caret at the join point during the Lexical update without using
  page-level repeated focus restore or native range rewriting while active
- Enter line splitting prefers native line selection
- Enter over a native selection spanning multiple lines removes the selected
  content and creates a new line from the remaining trailing content
- Shift+Enter soft line breaks sync native selection before inserting the line
  break
- after splitting a line, the new line is immediately marked selected and the
  caret/focus pass reinforces selection on the new line
- line split change events include a `focusTarget`, so the page can restore the
  caret after its render pass
- block mode keeps DOM focus on the contenteditable editor instead of moving it
  to the outer surface; block-mode keydown/beforeinput paths suppress native
  editing while still handling block shortcuts

Temporary diagnostics use the prefix:

```text
[rvn.lexical.input]
```

They can be disabled in devtools with:

```js
localStorage.setItem("routevn.debug.lexicalInput", "off");
```
