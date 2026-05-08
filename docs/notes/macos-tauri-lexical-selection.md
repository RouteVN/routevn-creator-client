# macOS Tauri Lexical Selection Notes

## Symptoms

In the scene document Lexical editor on macOS Tauri, the editor can be focused
and receive keyboard events while printable typing or Enter-based line splitting
does not visibly update the document.

Observed selection/focus behavior:

- `keydown` reaches the contenteditable editor.
- `beforeinput` reaches the contenteditable editor with valid `inputType` and
  `data`.
- The native DOM selection points at the visible caret.
- Lexical's internal range selection can be missing or stale.
- WebKit can emit blur after the editor has already been programmatically
  focused again; at that point `document.activeElement` may still be the
  contenteditable editor.

Regressions seen in this branch:

- deleting a character worked, but deleting or merging a line could drop editor
  focus
- Backspace/Enter over a native multi-line selection could become a no-op
- pressing Enter from block mode could switch to text mode and then lose focus
  instead of placing the caret at the end of the selected line
- double-clicking the trailing empty area of a non-final line could briefly
  paint a full-width bottom selection artifact, then a faster click could select
  the full line
- clicking a line from block mode needed to enter normal text mode at the exact
  pointer position, not force the caret to the line end
- `o`/`O` block-mode shortcuts needed to create a line and move focus into that
  new line in text mode
- delayed page-level focus restoration could target a line before Lexical had
  mounted it, producing `focus-line-missing-key`

## Cause

The macOS Tauri WebKit path can leave Lexical's internal selection out of sync
with the native DOM selection. Editor commands that rely only on
`$getSelection()` may become no-ops even though the browser has a valid caret.
It can also deliver native blur/selection events after our own focus
restoration, so focus code must check whether the target line is still mounted
before touching Lexical selection.

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
- Programmatic blur restoration first checks that the target line still exists
  in Lexical. Stale focus targets are cleared instead of calling `focusLine`.
- Component-level `focusLine` waits a few render frames for freshly-created
  lines to mount before forwarding the request into the primitive.
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
- pressing Enter in block mode enters text mode and restores the selected line
  caret at the requested position, normally the end of the line
- clicking a line in block mode switches to text mode without preventing the
  native pointer event, so WebKit can place the caret at the exact clicked
  position
- `o` and `O` new-line shortcuts select the created line and request text-mode
  focus at the start of the line after render
- the non-final-line trailing-boundary double-click artifact is suppressed
  before native selection paints; double-click selects the trailing word and a
  third click selects the full line content, while regular word selection and
  final-line selection stay native
