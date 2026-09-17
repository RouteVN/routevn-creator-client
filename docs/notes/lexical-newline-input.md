# Scene editor newline input

The maintained specification, bug register, and regression command are in
[Scene text editor specifications](../scene-text-editor-spec.md).

The scene editor page (`src/pages/sceneEditorLexical`) delegates editing to
`src/primitives/lexicalSceneDocumentEditor.js`. The defects were in the primitive's
input and caret mapping, rather than page state or the Rettangoli dependency.

## Reproduced causes

1. **Newline input ignored the event's selection.** The `beforeinput` handlers for
   `insertParagraph` and `insertLineBreak` prevented the browser's default edit,
   then looked for the live DOM or Lexical selection. Unlike ordinary text input,
   they did not use `InputEvent.getTargetRanges()`. A valid event range with no
   live selection therefore produced no edit; a stale caret could split the wrong
   line. A soft break could also lose a cached Lexical selection when its update
   started without a DOM range.
2. **Caret offsets omitted soft newlines.** `getLineOffsetFromRange()` counted
   `Range.toString()` characters. That string excludes `<br>` elements, while a
   Lexical line-break node occupies one character in serialized dialogue. For
   example, after `al|pha` → Shift+Enter, the caret visually followed `al\n`, but
   mapped to offset 2 instead of 3. Typing `X` produced `alX\npha` instead of
   `al\nXpha`. This was reproduced with real keyboard input in Chromium.
3. **Duplicate suppression depended on the input type matching keydown.** Enter
   and Shift+Enter already perform an edit in the key command. A subsequent
   newline `beforeinput` with a different input type bypassed the corresponding
   pending flag and performed a second edit. Lexical 0.22.0 explicitly handles
   Safari reporting `insertParagraph` for a soft line break.
4. **The double-click boundary guard still omitted newlines.** After fixing
   pointer offsets, clicking before the final `a` in `alpha\nbeta` resolves to
   offset 9. DOM `textContent` also reports a length of 9, so the non-final-line
   boundary guard mistook this interior click for the line end. Its text-only
   word range then selected `alpha\nbet` instead of leaving `beta` to native
   selection. The same mismatch truncated actual boundary double/triple-click
   selections. This regression was reproduced with native clicks in Chromium.

The missing/stale-selection and duplicate-event failures were reproduced with
real Lexical state and DOM/static ranges in automated tests. They establish the
failure paths; they are not a captured trace from the physical iPhone keyboard.

## Fix and compatibility boundaries

- Newline `beforeinput` uses its target range first. Paragraph breaks support
  ranges spanning scene lines, as well as a caret or selection within one line.
  Existing native-selection and Lexical-selection fallbacks remain available.
- A soft break restores the cached Lexical range only if its update has no range
  after resolving native input selection.
- Keydown without a usable selection leaves the native event uncancelled so
  `beforeinput` can supply the caret. It still consumes Lexical's command to keep
  lower-priority handlers from cancelling that fallback.
- A pending keyboard newline records its intended input type and whether it
  performed the edit. The following newline `beforeinput` either consumes that
  completed edit or performs the deferred one with its target range. This also
  preserves Shift+Enter when WebKit reports `insertParagraph`. Pending input still
  expires on the next animation frame.
- Native offsets include actual Lexical line-break nodes before the caret. The
  extra `<br>` used to display an empty paragraph or trailing caret is excluded;
  invisible caret-anchor characters still contribute zero logical characters.
- Boundary detection, trailing-word ranges, and selection length limits read
  the paragraph's Lexical text, including soft newlines and excluding invisible
  anchors. This also gives end-of-line caret restoration the same logical length.
- Enter continues to create a scene line; Shift+Enter continues to insert `\n`
  within the current dialogue. Beforeinput-only keyboards use the event's input
  type to select the operation.
- Active IME composition remains browser-managed. The existing deferred
  `keyCode`/`which` 229 confirmation guard remains unchanged, so confirming an IME
  candidate does not create a scene line. Block mode still suppresses native
  text edits.

The fix is shared across platforms, uses no user-agent branching, and changes no
dependency source. Layout editor behavior is covered by its existing tests.

## Validation

Run the focused and neighboring regression suites:

```bash
bunx vitest run tests/sceneEditor tests/layoutEditor/lexicalLayoutTextEditor.test.js --exclude '**/.artifacts/**'
```

`tests/sceneEditor/lexicalNewlineInput.test.js` covers target ranges with missing
or stale selections, multi-line replacement, newline deduplication, native and
Lexical fallbacks, composition, block mode, persisted soft breaks, consecutive
breaks, formatted text, invisible anchors, and caret placeholders.

The boundary-selection regression tests use real Lexical paragraphs and DOM
ranges. They cover interior word clicks after a soft newline, formatted text
with invisible anchors, and complete double/triple-click selections at the
actual line end, checking both Lexical text and native selection endpoints.
The follow-up fix passed 372 scene/layout editor tests and lint. Native
double/triple-clicks and replacement typing passed in Chromium, WebKit, and
Firefox: interior and boundary double-clicks selected `beta` at offsets 6–10,
while boundary triple-clicks selected the complete `alpha\nbeta` at 0–10.
The iPhone dev client was disconnected during this check, so physical-device
verification of this follow-up is pending.

On 2026-09-10, an isolated browser fixture using the production primitive methods,
Lexical's real key-command registration, native `beforeinput`, and a shadow-DOM
contenteditable passed Enter and Shift+Enter followed by typing `X` in Chromium,
WebKit, and Firefox. Both resulting content and subsequent insertion position
were checked, including a deferred-keydown variant that made the primitive's
selection unavailable until native `beforeinput`. The scene and layout editor
regression command passed 354 tests, including 24 newline-specific cases. This is
browser-engine coverage, not physical iOS/Android or packaged Tauri validation.

For a device check, open a scene in text mode, place the caret inside dialogue,
press Return, and type. Repeat with Shift+Enter on a hardware keyboard, including
at the end of a line and twice consecutively. Confirm that typing follows the
caret and that leaving/reopening the scene preserves the newlines. Also confirm
an IME candidate with Enter before testing an ordinary Enter.

## Physical iPhone automatic Shift follow-up (2026-09-17)

TXT-B012 reproduces the reported rapid-Return failure on an iPhone 13 Pro running
iOS 16.3.1. After refreshing development signing, WebView inspection and native
debugger attachment worked. An isolated instance of the production primitive
inside the installed app used only dummy text, with no project persistence.
LLDB activated the native keyboard's Return accessibility element four times
70ms apart. The captured keydown Shift flags were `false, false, true, false`,
with no intervening Shift keydown. The third Return inserted a soft break, giving
four scene lines instead of five.

The primitive uses the app's existing touch input mode. Return always creates a
scene line in that mode, including Shift+Enter and beforeinput-only
`insertLineBreak`. This applies to native iOS/Android and touch web layouts.
Desktop/pointer Shift+Enter still inserts a soft break. The touch regression
also exposed TXT-B013: immediate typing after a beforeinput-only split could be
rewound by its deferred focus reset (`X`, then `Y` became `YX`). That callback
now checks the existing focus-restore sequence so newer input supersedes it. No platform detection or
held-Shift tracking is needed. The deferred input/deduplication logic retains
this same decision. This is an app-owned change; no dependency source was
modified.

The rebuilt packaged Debug app passed on the same iPhone: a burst of four native
Return events, including shifted events, created five scene lines with no soft
breaks, and native `X` then `y` input landed in the final line. The temporary
fixture was removed afterward. `bun run test:scene-editor` passed 455 unit tests
and all Chromium/WebKit browser suites; lint passed. The new browser suite
replays the captured modifier sequence, then uses native typing and asserts the
exact content and caret. It also verifies touch beforeinput-only line breaks and native Shift+Enter
in both touch and desktop/pointer modes. A physical iPhone hardware keyboard and IME were
not part of this device check.

## Multiline replacement and deletion follow-up (2026-09-16)

Investigation of intermittent editing reports reproduced three additional
failures in the production primitive, inside nested shadow roots:

1. **Replacing text immediately after a soft break removed the wrong text.**
   Load `alpha\nbeta`, place the caret before `b`, press Shift+ArrowRight, then
   type `X`. Chromium and WebKit produced `alpha\nbX` instead of
   `alpha\nXeta`. `resolvePointAtOffset()` represented the start of `beta` as
   an element point after the line-break node. Paired with the text endpoint
   after `b`, this made Lexical's replacement operate on the wrong side of the
   endpoint. The app now uses the following text node at offset zero when one
   exists. Empty rows, trailing breaks, and atomic reference boundaries keep
   their element points.
2. **Backspace recovery could rewind newer input.** In WebKit, Backspace
   schedules a caret restoration on the next animation frame. If `X` arrives
   before that frame and `YZ` arrives afterward, the old restoration moved
   the caret before `X`, producing `YZX`. The browser regression freezes the
   animation clock to make this event order deterministic while using native
   keyboard input. New text, soft/paragraph breaks, paste, composition, and
   forward deletion now invalidate pending recovery through the existing
   sequence counter. Normal-paced Backspace recovery remains covered.
3. **Forward Delete ignored the native target range.** WebKit could deliver a
   valid `deleteContentForward` range while the Lexical selection available to
   the edit was missing. The event was cancelled but no deletion happened.
   Forward deletion now resolves the input range before editing, including
   ranges spanning scene lines, with native/Lexical fallbacks retained.

These are confirmed reproductions, not a confirmed identification of every
reported user incident. The users' platform, installed version, and exact input
sequence were not available. The first failure requires a real soft newline;
automatic visual wrapping alone does not create that node boundary.

Validation:

```bash
bunx vitest run tests/sceneEditor tests/layoutEditor/lexicalLayoutTextEditor.test.js --exclude '**/.artifacts/**'
node tests/sceneEditor/lexicalMultilineEditing.browser.mjs
```

The browser suite checks serialized dialogue and native caret positions in
Chromium and WebKit, with single/consecutive soft breaks, selected-text
replacement, forward Delete, and rapid Backspace followed by input. It bundles
only the primitive into a temporary fixture and does not require a running app
or touch user projects. This is browser-engine validation; packaged desktop
apps and physical mobile devices have not been validated for this follow-up.

## References

- [Input Events Level 2: input types and target ranges](https://www.w3.org/TR/input-events-2/)
- [Lexical 0.22.0 input handling](https://github.com/facebook/lexical/blob/v0.22.0/packages/lexical/src/LexicalEvents.ts)
- [Existing Tauri WebKit selection and IME notes](macos-tauri-lexical-selection.md)
