# Scene text editor specifications and bug register

This is the maintained behavior and regression register for
`src/pages/sceneEditorLexical` and its `lexicalSceneDocumentEditor` primitive.
Update this file and the matching regression coverage whenever an editing
contract changes or a bug is reproduced. Preserve resolved bug entries.

A **scene line** is a project line/paragraph with its own ID and actions. A
**soft break** is a newline inside that line, inserted with Shift+Enter.
Selections across scene lines in this document are within one section/editor.
Selections across separate section editors are outside this contract.

## Behavior specifications

| ID | Required behavior | Automated coverage |
| --- | --- | --- |
| TXT-001 | Enter splits a scene line; Shift+Enter inserts a soft break. Replace a selection once. A matching beforeinput must not duplicate the keyboard edit. | `lexicalNewlineInput.test.js`; `lexicalLineEditing.test.js`; `lexicalMultilineEditing.browser.mjs` |
| TXT-002 | Typing, replacement input, soft breaks, paste, Cut, and deletion replace the entire selected range, including forward/backward selections across scene lines. A supplied event target range, including a collapsed caret, wins over a stale live selection. Fall back to the live selection only when no target was resolved. Preserve the first surviving line ID. | `lexicalNewlineInput.test.js` TXT-002/TXT-B009; `lexicalEditingContracts.browser.mjs` TXT-002/TXT-B009 |
| TXT-003 | A real soft break counts as one logical character. Invisible caret anchors and trailing DOM placeholders do not. Text after a soft break uses the correct text-node selection boundary. | `lexicalNewlineInput.test.js`; `lexicalMultilineEditing.browser.mjs`; `lexicalSceneDocumentReferences.test.js` |
| TXT-004 | Deletion must not leave an unpaired UTF-16 surrogate. The app's collapsed Backspace fallback deletes a complete grapheme, including emoji modifiers, flags, and joined family emoji. A browser-supplied deletion range remains authoritative; native combining-accent behavior can differ by engine. | `lexicalNewlineInput.test.js` TXT-004; `lexicalEditingContracts.browser.mjs` TXT-004 |
| TXT-005 | Plain-text paste normalizes CR/CRLF to LF and creates one scene line per pasted row, preserving blank rows. Replace all selected scene lines. Keep the untouched prefix/suffix and their formatting. Preserve the starting line's actions; do not copy its unrelated actions to newly created lines. | `lexicalNewlineInput.test.js` TXT-005/006; `lexicalEditingContracts.browser.mjs` TXT-005 |
| TXT-006 | After paste, the caret follows the pasted text and precedes any existing suffix. Subsequent typing inserts there. | `lexicalNewlineInput.test.js` TXT-005/006; `lexicalEditingContracts.browser.mjs` TXT-006 |
| TXT-007 | Pending Backspace focus recovery must not overwrite newer text, composition, arrow/Home/End movement, a keyboard selection, or a mouse selection. Recovery with no intervening action still works. | `lexicalMultilineEditing.browser.mjs`; `lexicalEditingContracts.browser.mjs` TXT-007; `lexicalLineEditing.test.js` |
| TXT-008 | Cut copies the selected content to the clipboard and removes that same range. Retain Lexical's rich clipboard representations. | `lexicalEditingContracts.browser.mjs` TXT-002 cut cases; `lexicalNewlineInput.test.js` |
| TXT-009 | Untouched text retains formatting; reference chips remain atomic, with navigable caret boundaries. Formatting/context-menu workflows keep their existing behavior. | `lexicalSceneDocumentReferences.test.js`; `lexicalLineEditing.test.js`; `lexicalNewlineInput.test.js`; `richTextContextMenu.browser.mjs` |
| TXT-010 | Active IME composition remains native. Committed composition persists, and Enter confirming an IME candidate must not also create a scene line. | `lexicalLineEditing.test.js`; `lexicalNewlineInput.test.js` |
| TXT-011 | Block mode suppresses ordinary native text edits while preserving its explicit navigation/edit shortcuts. | `lexicalLineEditing.test.js`; `lexicalNewlineInput.test.js` |
| TXT-012 | Serialized dialogue preserves edits, soft breaks, line IDs, and retained actions. Reloading the serialized document must preserve content. Draft persistence remains covered separately from browser input. | `lexicalDraftPersistence.test.js`; `lexicalEditingContracts.browser.mjs`; `lexicalNewlineInput.test.js` |

All test paths above are under `tests/sceneEditor/`.

## Bug register

Status: the fixes below are implemented and have automated regression coverage.
Use the check command below to verify the current checkout. Packaged desktop and
physical mobile verification remain pending; browser coverage is not a substitute
for those release checks.

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
