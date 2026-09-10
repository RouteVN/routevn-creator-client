# Scene editor taps moving the caret to the line end

## Cause

The connected iPhone running iOS 16.3.1 exposes `caretRangeFromPoint`, but its
result for dialogue inside the editor's nested shadow roots points at `rvn-app`
instead of the text node. It has neither `caretPositionFromPoint` nor
`ShadowRoot.getSelection`. The primitive consequently resolves the pointer
offset to `-1`, meaning it could not determine the position.

When `getSelectionRange` also cannot read the native shadow selection, the
mouseup fallback passed that `-1` to `focusLine`. In the programmatic focus
contract, `-1` means the end of the line. Thus an unavailable position became an
explicit instruction to replace the caret that the browser had just placed.
The deferred fallback could repeat the same operation.

This is consistent with WebKit's historical lack of a shadow selection API:
[WebKit selection API issue](https://bugs.webkit.org/show_bug.cgi?id=163921).
The app must distinguish an unreadable native selection from a missing caret.

## Fix

`src/primitives/lexicalSceneDocumentEditor.js` only restores a pointer fallback
when its offset is nonnegative. An unresolved hit leaves the native caret or
selection intact, including during deferred validation. Mouseup still selects
the clicked scene line for the preview, even when its exact caret is hidden.
It avoids refocusing an already focused editor.

Explicit keyboard/programmatic requests to focus a line end retain their
existing meaning. Known pointer offsets, including zero and a resolved line
end, still support fallback restoration. The iOS `preventScroll` keyboard
adapter remains unchanged.

## Validation

An isolated Chromium editor fixture used real mouse clicks and touch taps with
both normal APIs and the legacy WebKit failure simulated at the selection API
boundary. Before the fix, a click at offset 3 in `alpha beta gamma` moved to
offset 16. After the fix, repeated clicks/taps at offsets 3, 8, and 4 remained
at those positions, including switching to a different line. Subsequent typing
inserted at the selected position in both the DOM and serialized Lexical state.

Regression tests cover hidden shadow selections, native selection preservation,
clicked-line synchronization, known offsets, and deferred restoration:

```bash
bunx vitest run tests/sceneEditor/lexicalPointerSelection.test.js \
  tests/sceneEditor/lexicalLineEditing.test.js \
  tests/sceneEditor/lexicalNewlineInput.test.js \
  tests/ios/sceneEditorKeyboard.test.js --exclude '.artifacts/**'
```

All 158 tests passed. Physical-device inspection confirmed the failed hit test;
the iPhone locked before post-fix tap validation. Device refresh and a real tap
check remain pending until it is unlocked. Synthetic browser taps do not establish
that native iOS selection and keyboard transitions are correct.
