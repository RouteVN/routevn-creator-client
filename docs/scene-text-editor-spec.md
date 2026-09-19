# Scene text editor specifications and bug register

This is the maintained behavior and regression register for
`src/pages/sceneEditorLexical` and its `lexicalSceneDocumentEditor` primitive.
Update this file and the matching regression coverage whenever an editing
contract changes or a bug is reproduced. Preserve resolved bug entries.

A **scene line** is a project line/paragraph with its own ID and actions. A
**soft break** is a newline inside that line, inserted with Shift+Enter in
desktop/pointer mode. In touch mode, Return and Shift+Return always create a
scene line.
Selections across scene lines in this document are within one section/editor.
Selections across separate section editors are outside this contract.

## Behavior specifications

| ID | Required behavior | Automated coverage |
| --- | --- | --- |
| TXT-001 | Enter splits a scene line. Touch mode always creates a scene line, including Shift+Enter and beforeinput-only insertLineBreak; desktop/pointer mode supports Shift+Enter soft breaks. Replace a selection once. A matching beforeinput must not duplicate the keyboard edit. | `lexicalNewlineInput.test.js`; `lexicalLineEditing.test.js`; `lexicalMultilineEditing.browser.mjs`; `lexicalTouchReturn.browser.mjs` |
| TXT-002 | Typing, replacement input, soft breaks, paste, Cut, and deletion replace the entire selected range, including forward/backward selections across scene lines. A supplied event target range, including a collapsed caret, wins over a stale live selection. Fall back to the live selection only when no target was resolved. Preserve the first surviving line ID. | `lexicalNewlineInput.test.js` TXT-002/TXT-B009; `lexicalEditingContracts.browser.mjs` TXT-002/TXT-B009 |
| TXT-003 | A real soft break counts as one logical character. Invisible caret anchors and trailing DOM placeholders do not. Text after a soft break uses the correct text-node selection boundary. | `lexicalNewlineInput.test.js`; `lexicalMultilineEditing.browser.mjs`; `lexicalSceneDocumentReferences.test.js` |
| TXT-004 | Deletion must not leave an unpaired UTF-16 surrogate. The app's collapsed Backspace fallback deletes a complete grapheme, including emoji modifiers, flags, and joined family emoji. A browser-supplied deletion range remains authoritative; native combining-accent behavior can differ by engine. | `lexicalNewlineInput.test.js` TXT-004; `lexicalEditingContracts.browser.mjs` TXT-004 |
| TXT-005 | Plain-text paste normalizes CR/CRLF to LF and creates one scene line per pasted row, preserving blank rows. Replace all selected scene lines. Keep the untouched prefix/suffix and their formatting. Preserve the starting line's actions; do not copy its unrelated actions to newly created lines. | `lexicalNewlineInput.test.js` TXT-005/006; `lexicalEditingContracts.browser.mjs` TXT-005 |
| TXT-006 | After paste, the caret follows the pasted text and precedes any existing suffix. Subsequent typing inserts there. | `lexicalNewlineInput.test.js` TXT-005/006; `lexicalEditingContracts.browser.mjs` TXT-006 |
| TXT-007 | Pending focus recovery after entering text mode, blur, or Backspace must not overwrite newer text, composition, arrow/Home/End movement, a keyboard selection, or a mouse/touch selection. A new primary pointerdown cancels the old recovery target before compatibility mouse events; later blur must not revive it. Escape cancels pending text-mode recovery so later block navigation stays selected. Recovery with no intervening action still works. | `lexicalMultilineEditing.browser.mjs`; `lexicalEditingContracts.browser.mjs` TXT-007; `lexicalShortcutFocus.browser.mjs` TXT-B011; `lexicalLineEditing.test.js` |
| TXT-008 | Cut copies the selected content to the clipboard and removes that same range. Retain Lexical's rich clipboard representations. | `lexicalEditingContracts.browser.mjs` TXT-002 cut cases; `lexicalNewlineInput.test.js` |
| TXT-009 | Untouched text retains formatting; reference chips remain atomic, with navigable caret boundaries. Desktop/pointer formatting context menus retain their behavior; touch editing uses native selection as specified in TXT-014. | `lexicalSceneDocumentReferences.test.js`; `lexicalLineEditing.test.js`; `lexicalNewlineInput.test.js`; `richTextContextMenu.browser.mjs` |
| TXT-010 | Active IME composition remains native. Committed composition persists, and Enter confirming an IME candidate must not also create a scene line. Space or digit process keys used to confirm a candidate must not be inserted again by the printable fallback; a later ordinary Space still inserts. | `lexicalLineEditing.test.js`; `lexicalNewlineInput.test.js` |
| TXT-011 | Block mode suppresses ordinary native text edits while preserving its explicit navigation/edit shortcuts. | `lexicalLineEditing.test.js`; `lexicalNewlineInput.test.js` |
| TXT-012 | Serialized dialogue preserves edits, soft breaks, line IDs, and retained actions. Reloading the serialized document must preserve content. Draft persistence remains covered separately from browser input. | `lexicalDraftPersistence.test.js`; `lexicalEditingContracts.browser.mjs`; `lexicalNewlineInput.test.js` |
| TXT-013 | In block mode, `o` inserts a scene line after the selected line and `O` inserts before it, then enters text mode on the new line. A newer selection supersedes pending page focus; after focus succeeds, subsequent typing, arrow movement, or Escape must not be undone by a second page focus. | `lexicalShortcutFocus.browser.mjs` TXT-B011; `sceneEditorLexical.handlers.test.js` |
| TXT-014 | In touch text-editing mode, long-press/right-click must keep native selection and the native context menu. Do not open rich-text/furigana/reference dropdowns, cancel the contextmenu event, or replace the selected range. Desktop/pointer menus remain available. | `lexicalTouchSelection.browser.mjs`; `richTextContextMenu.browser.mjs` |

All test paths above are under `tests/sceneEditor/`.

## Bug register

Status: the fixes below are implemented and have automated regression coverage.
Use the check command below to verify the current checkout. Packaged desktop and
physical mobile verification remain pending unless recorded for an individual
bug below; browser coverage is not a substitute for those release checks.

| Bug | Reproduction and former result | Cause/fix | Specs and regression |
| --- | --- | --- | --- |
| TXT-B001 | `alpha` + Shift+Enter + `beta`; select only `b` and type `X`. Produced `alpha↵bX` rather than `alpha↵Xeta`. Chromium/WebKit. | Map the soft-break boundary to the following text node at offset zero. | TXT-002/003; newline unit tests and multiline browser suite |
| TXT-B002 | Backspace, type `X` before the recovery frame, then `YZ` afterward. Produced `YZX`. WebKit. | New input invalidates the pending caret recovery sequence. | TXT-007; multiline browser suite |
| TXT-B003 | Forward Delete with a valid native input range but missing/stale Lexical selection did nothing. WebKit. | Restore the event/native range, including cross-line ranges, before deleting. | TXT-002; newline unit tests and multiline browser suite |
| TXT-B004 | `A😀B`, caret before `B`, Backspace. Left a lone surrogate, often rendered as `A�B`. Also affected family emoji. WebKit. | Use grapheme boundaries instead of subtracting one UTF-16 code unit. | TXT-004; unit and browser cases for emoji, family, skin tone, and flag |
| TXT-B005 | Scene lines `alpha`, `beta`; select from after `al` through `be`, then type, paste, or cut. The original selection remained unchanged. WebKit. | Restore both endpoints of native selections across scene lines. Cut restores the captured range for both copying and deletion. | TXT-002/008; browser cases in both selection directions, clipboard-content assertions, event-target unit tests |
| TXT-B006 | Over the same selection, paste `one` newline `two`. Produced `alone`, `two`, `beta` instead of `alone`, `twota`. Chromium. | Replace the whole range before creating the pasted paragraphs, retaining the final suffix. | TXT-005; unit and browser multiline paste cases |
| TXT-B007 | Paste `one` newline `two` at `alpha\|beta`, then type `X`. Produced `twobetaX` on the final line instead of `twoXbeta`. Both engines. | Position the caret after the pasted final fragment, before the suffix; remove the later unconditional focus jump. | TXT-006; unit and browser paste cases including leading/trailing/blank rows |
| TXT-B008 | From `abc\|d`, Backspace then Left before the recovery frame, then type `X`. Produced `abXd` instead of `aXbd`. WebKit. | Cursor movement/selection invalidates delayed recovery. | TXT-007; browser arrow and range-selection races |
| TXT-B009 | Scene lines `alpha`, `beta`; leave a live selection from `al\|pha` through `be\|ta`, then supply an `insertText("X")` target at `bet\|a`. Produced `alXta` instead of `alpha`, `betXa`. Also affected soft breaks, single-line paste, forward deletion, and Cut. | A resolved single-line target suppresses the fallback to a live cross-line selection, including when the target is collapsed. Forward Delete also extends from that DOM caret and reads the resulting selection through the shadow-aware range helper. An absent target still uses the live range. | TXT-002; newline unit cases for collapsed/absent targets; browser cases for typing, replacement, composition commit, both newline types, paste, and deletion, followed by native typing and caret/content/reload assertions |
| TXT-B010 | At `abc\|d`, enter text mode (or queue programmatic blur recovery), type `Y` before its recovery frame, then `X` afterward. Produced `abcXYd` instead of `abcYXd`. Under load, typing `alpha`, Enter, `beta` could become `lpha`, `betaa`. | Guard both deferred focus callbacks with the focus-restore sequence so later input invalidates them. | TXT-007; controlled-frame browser cases for text-mode entry and blur recovery; reproduced in a constrained Linux WebKit fixture |
| TXT-B011 | Enter text mode on the first line, then Escape and `j`/Down before the next frame: selection jumped back to the first line and text mode resumed. After `o`/`O`, move the caret or type between the page's first and second focus frames: the second focus undid the movement or rewound the caret. Escape and block navigation could also be undone. Reproduced in Chromium and macOS WebKit. | Entering block mode invalidates pending caret recovery, and deferred text-mode entry verifies its mode and target. Page structural edits request focus once, only while that line remains selected; the primitive owns subsequent recovery. | TXT-007/011/013; `lexicalShortcutFocus.browser.mjs` exercises production page handlers, wrapper methods, and primitive with controlled frames, both insertion directions, block/text navigation, exact content/caret, and subsequent typing/draft assertions |
| TXT-B012 | On a physical iPhone 13 Pro / iOS 16.3.1, activate software Return four times 70ms apart after `alpha`. Produced four scene lines with a soft break in the third instead of five scene lines. | The third Enter keydown had `shiftKey: true` without a Shift keydown: iOS automatic capitalization was mistaken for Shift+Enter. Use the app's touch input mode to create a scene line for every Return, regardless of Shift or insertLineBreak. Desktop/pointer Shift+Enter retains soft breaks. | TXT-001; `lexicalNewlineInput.test.js` covers touch modifiers, deferred target ranges, beforeinput-only newlines, and deduplication; `lexicalTouchReturn.browser.mjs` replays the captured modifiers and checks subsequent native typing/caret in Chromium/WebKit. Physical-device reproduction uses the production primitive with dummy text only. |
| TXT-B013 | In touch mode, beforeinput-only `insertLineBreak`, type `X` before the split recovery frame, then `Y` afterward. Produced `YX` in the new scene line instead of `XY`. Reproduced in Chromium. | Guard the split's deferred focus reset with the existing focus-restore sequence; newer input invalidates it. | TXT-007; `lexicalTouchReturn.browser.mjs` freezes animation frames and asserts subsequent native typing and caret in Chromium/WebKit. |
| TXT-B014 | Focus line 1 offset 5, tap line 2 offset 4, then deliver a transient blur. Recovery jumped back to line 1 offset 5. Reproduced in Chromium and through a synthetic event replay on the physical iPhone. | Cancel both the old target and queued recovery on every primary pointerdown, including inside the editor, and on mousedown. Deferred pointer fallback validates the recovery sequence. | TXT-007; `lexicalCaretRecovery.browser.mjs` checks native taps, replayed blur, exact caret, and subsequent native typing in Chromium/WebKit; `lexicalPointerSelection.test.js` checks early cancellation and stale fallback timers. See `notes/lexical-pointer-selection.md` for device replay and its limits. |
| TXT-B015 | On macOS with Apple Pinyin, type `ni` then Space at `a\|b`. The candidate committed but an extra space produced `a你 b` instead of `a你b`. | WebKit delivers the confirming Space after compositionend with `isComposing: false` but keyCode/which 229. Exclude process keys from the printable fallback. | TXT-010; `lexicalImeConfirmation.browser.mjs` checks committed text, deferred Space, subsequent ordinary Space/typing, and exact caret in both engines. Unit tests cover both process-key markers and digit keys. Native Apple Pinyin before/after verification is recorded in `notes/macos-tauri-lexical-selection.md`. |
| TXT-B016 | On Android/Gboard, place the caret at the start of a loaded empty scene line and press Backspace once. The line remained; a second press merged it. | Lexical deleted the invisible caret anchor before the app handler ran. Handle collapsed logical line-start Backspace in the existing window capture path, before Lexical character deletion. Preserve IME composition, modified keys, and native text selections. | `lexicalEmptyLineBackspace.browser.mjs` covers loaded/new empty lines, deleting the last character, consecutive empty lines, nonempty line starts, and subsequent typing/caret in Chromium and WebKit. Verified on the connected Vivo V2309A using native Gboard taps. |
| TXT-B017 | Leave an unchanged scene editor open with Android backups enabled. Each scheduled check rewrote the text-statistics checkpoint and made the database appear dirty. | Backup preparation passes an explicit backup reason and only flushes pending drafts; actual saves retain their normal statistics update, while navigation still caches statistics before leaving. | `sceneEditorLexical.handlers.test.js` checks repeated unchanged preparation; `projectEntryLanguagePlatforms.test.js` checks the Android preparation payload; `lexicalDraftPersistence.test.js` covers save/cache completion. |

TXT-B012 was verified in a packaged Debug app on that same physical iPhone on
2026-09-17. Four native software Return activations, including automatically
shifted Enter events, produced five scene lines without soft breaks. Subsequent
native `X` and `y` keys produced `Xy` in the final line. The final touch-mode
policy also makes hardware Shift+Enter create a scene line; this behavior is covered with native browser keys. A physical hardware keyboard
has not been checked on the phone. The fixture did not read or write project
dialogue.

The final touch-mode build was rechecked on the iPhone after installation:
four native Return presses produced five scene lines and subsequent `x`/`y`
keys produced `xy` in the final line. For TXT-014, replayed touch and mouse
contextmenu events on dummy styled/furigana text remained uncancelled, left the
custom menu closed, and preserved the selected offsets 1–4. Browser tests also
cover native right-click and replacement typing. An actual finger long-press
was not automated. No Android device was connected for verification.

## Running the regression gate

Install the matching browser engines once (CI installs them with OS dependencies):

```bash
bunx playwright install chromium webkit
bun run test:scene-editor
```

The command runs:

1. All scene-editor unit tests plus the neighboring layout text-editor suite.
2. The existing multiline keyboard/caret regression suite in Chromium and WebKit.
3. The editing-contract browser suite in both engines, using native typing,
   selection, clipboard copy/paste/cut, controlled frame timing, serialized
   content checks, native caret checks, and reload checks.
4. The shortcut-focus browser suite in both engines, including page-created
   lines and input before/between scheduled focus frames. Cases cover `o`/`O`,
   Enter/`i`/Shift+I/Shift+A, Escape, arrows, `j`, and subsequent typing.
5. The captured iPhone Return modifier sequence in both engines, followed by
   native typing and exact content/caret checks, plus touch beforeinput-only
   line breaks and native Shift+Enter in both touch and pointer modes.
6. Touch context menus remain uncancelled, custom dropdowns stay closed, and
   subsequent native typing replaces the preserved selection in both engines.
   Long-press contextmenu is replayed; this is not a native iOS long-press test.
7. Native touch taps followed by replayed transient blur preserve the tapped
   caret and subsequent typing in both engines.
8. Replayed IME confirmation Space does not insert whitespace, while a later
   native Space and ordinary typing retain their normal content/caret behavior.
9. Single Backspace merges empty and nonempty scene lines at the logical start;
   subsequent typing stays at the join, including after consecutive empty lines.

The browser suites bundle the production primitive into temporary fixtures with
nested shadow roots. They need no app build, running development server, or user
projects. Browser exceptions, assertion failures, or missing browser installations
fail the command. `.github/workflows/ci.yaml` runs it on pull requests.

Use `node tests/sceneEditor/richTextContextMenu.browser.mjs` as the additional
native browser check when changing rich-text formatting or context menus.

## Maintaining the list

- Give new behaviors a stable TXT ID and new defects a stable TXT-B ID.
- Record the exact input sequence, expected/actual content and caret, affected
  engine/device, and the responsible test before marking a bug resolved.
- Keep tests tied to observable editing behavior, not implementation details.
- Add a native browser case for input/selection/timing bugs; use unit tests for
  target-range fallbacks and data/metadata edge cases.
- Do not accept a content-only test as proof of a caret fix. Type again afterward
  and assert both serialized content and the native insertion position.
- Mark untested platforms explicitly. Before a release, repeat applicable cases
  on the packaged desktop app and physical mobile keyboards, including IME.

Historical investigation: [newline input notes](notes/lexical-newline-input.md).
