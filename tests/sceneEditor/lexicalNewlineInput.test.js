import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $setSelection,
  createEditor,
} from "lexical";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EDITOR_CARET_TEXT,
  getLineDialogueContent,
  getPlainTextFromContent,
} from "../../src/internal/ui/sceneEditorLexical/contentModel.js";

let dom;
let element;
let editor;
let rootElement;
let lineKeys;

beforeEach(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  for (const name of [
    "window",
    "document",
    "CustomEvent",
    "Element",
    "HTMLElement",
    "MutationObserver",
    "Node",
    "ShadowRoot",
  ]) {
    vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
  }
  vi.stubGlobal(
    "getComputedStyle",
    dom.window.getComputedStyle.bind(dom.window),
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  const { LexicalSceneDocumentEditorElement } = await import(
    "../../src/primitives/lexicalSceneDocumentEditor.js"
  );
  element = Object.create(LexicalSceneDocumentEditorElement.prototype);
  editor = createEditor({
    namespace: "newline-input-test",
    theme: { paragraph: "editor-paragraph" },
    onError: (error) => {
      throw error;
    },
  });
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  editor.setRootElement(rootElement);
  element.editor = editor;
  element.refs = { editor: rootElement };
  element.state = {
    mode: "text-editor",
    selectedLineId: "line-1",
    lines: [],
    mentionTargets: [],
  };
  element.lineMetaByKey = new Map();
  element.lineKeyById = new Map();
  element.scrollLineIntoView = vi.fn();
  element.focusLine = vi.fn();
  element.scheduleRender = vi.fn();
  lineKeys = [];
  editor.update(
    () => {
      for (const [index, text] of ["alpha", "beta"].entries()) {
        const line = $createParagraphNode().append($createTextNode(text));
        $getRoot().append(line);
        const id = `line-${index + 1}`;
        lineKeys.push(line.getKey());
        element.lineMetaByKey.set(line.getKey(), { id });
        element.lineKeyById.set(id, line.getKey());
      }
      $setSelection(null);
    },
    { discrete: true },
  );
  window.getSelection().removeAllRanges();
});

afterEach(() => {
  editor.setRootElement(null);
  dom.window.close();
  vi.unstubAllGlobals();
});

function targetRange(
  startLine,
  startOffset,
  endLine = startLine,
  endOffset = startOffset,
) {
  const startContainer = editor.getElementByKey(lineKeys[startLine]).firstChild
    .firstChild;
  const endContainer = editor.getElementByKey(lineKeys[endLine]).firstChild
    .firstChild;
  return new window.StaticRange({
    startContainer,
    startOffset,
    endContainer,
    endOffset,
  });
}

function beforeInput(inputType, range, data) {
  const event = new window.InputEvent("beforeinput", {
    inputType,
    data,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "getTargetRanges", {
    value: () => (range ? [range] : []),
  });
  element.handleNativeBeforeInput(event);
  return event;
}

function texts() {
  return editor.getEditorState().read(() =>
    $getRoot()
      .getChildren()
      .map((line) => line.getTextContent()),
  );
}

describe("word selection after soft newlines", () => {
  function prepareClick({ detail = 2, offset, formatted = false }) {
    editor.update(
      () => {
        const prefix = $createTextNode(
          formatted ? `alpha${EDITOR_CARET_TEXT}` : "alpha",
        );
        const suffix = $createTextNode("beta");
        if (formatted) {
          prefix.toggleFormat("bold");
          suffix.toggleFormat("italic");
        }
        $getRoot()
          .getFirstChild()
          .clear()
          .append(prefix, $createLineBreakNode(), suffix);
      },
      { discrete: true },
    );
    const lineElement = editor.getElementByKey(lineKeys[0]);
    const range = document.createRange();
    range.setStart(lineElement.lastChild.firstChild, offset);
    range.collapse(true);
    // JSDOM cannot hit-test coordinates; keep the real DOM-to-Lexical mapping.
    element.getCaretRangeFromPointerEvent = vi.fn(() => range);
    element.clearSelectedReferenceNodeKey = vi.fn();
    element.hideSelectionPopover = vi.fn();
    element.closeMentionMenu = vi.fn();
    element.setMode = vi.fn();
    return {
      target: lineElement,
      detail,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
  }

  it.each([false, true])(
    "preserves native word selection inside beta (formatted=%s)",
    (formatted) => {
      const event = prepareClick({ offset: 3, formatted });
      expect(element.getLineOffsetFromPointerEvent(event, event.target)).toBe(
        9,
      );
      expect(element.suppressNativeLineBoundaryDoubleClick(event)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(window.getSelection().isCollapsed).toBe(true);
    },
  );

  it.each([
    [2, "beta", 6],
    [3, "alpha\nbeta", 0],
  ])(
    "selects the complete intended text for a %s-click at the actual boundary",
    (detail, selectedText, start) => {
      const event = prepareClick({ detail, offset: 4 });
      expect(element.suppressNativeLineBoundaryDoubleClick(event)).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(
        editor.getEditorState().read(() => $getSelection().getTextContent()),
      ).toBe(selectedText);
      expect(element.getNativeLineRangeSelectionContext()).toMatchObject({
        startLineId: "line-1",
        endLineId: "line-1",
        startOffset: start,
        endOffset: 10,
      });
      const selection = window.getSelection();
      expect(selection.focusNode.textContent).toBe("beta");
      expect(selection.focusOffset).toBe(4);
      expect(texts()).toEqual(["alpha\nbeta", "beta"]);
    },
  );
});

describe("scene editor newline input", () => {
  it.each(["😀", "👨‍👩‍👧‍👦", "👍🏽", "🇸🇬"])(
    "TXT-004: Backspace preserves Unicode when deleting %s",
    (character) => {
      editor.update(
        () => {
          $getRoot()
            .getFirstChild()
            .clear()
            .append($createTextNode(`A${character}B`));
        },
        { discrete: true },
      );
      element.handleBackspaceDelete({
        nativeSelection: {
          lineId: "line-1",
          start: 1 + character.length,
          end: 1 + character.length,
        },
      });
      expect(texts()).toEqual(["AB", "beta"]);
      expect(element.getLinesSnapshot()[0].actions.dialogue.content).toEqual([
        { text: "AB" },
      ]);
    },
  );

  it.each([
    ["insertText", ["alXta"]],
    ["insertReplacementText", ["alXta"]],
    ["insertLineBreak", ["al\nta"]],
    ["deleteByCut", ["alta"]],
    ["deleteContentBackward", ["alta"]],
  ])(
    "TXT-002: %s honors a cross-line event target over a stale caret",
    (inputType, expected) => {
      const range = document.createRange();
      range.setStart(
        editor.getElementByKey(lineKeys[0]).firstChild.firstChild,
        0,
      );
      range.collapse(true);
      window.getSelection().addRange(range);
      beforeInput(inputType, targetRange(0, 2, 1, 2), "X");
      expect(texts()).toEqual(expected);
      expect(element.getLinesSnapshot()[0].id).toBe("line-1");
    },
  );

  it.each([
    ["one\ntwo", ["alone", "twota"], 3],
    ["one\n", ["alone", "ta"], 0],
    ["\none", ["al", "oneta"], 3],
    ["one\r\n\r\ntwo", ["alone", "", "twota"], 3],
  ])(
    "TXT-005/006: paste %j replaces the whole range and stops before the suffix",
    (text, expected, offset) => {
      beforeInput("insertFromPaste", targetRange(0, 2, 1, 2), text);
      expect(
        element
          .getLinesSnapshot()
          .map((line) => getPlainTextFromContent(getLineDialogueContent(line))),
      ).toEqual(expected);
      expect(element.getLinesSnapshot()[0].id).toBe("line-1");
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        expect(selection.isCollapsed()).toBe(true);
        expect(selection.anchor.offset).toBe(offset);
      });
    },
  );

  it("TXT-005: paste preserves untouched formatting and starting line actions", () => {
    element.lineMetaByKey.set(lineKeys[0], {
      id: "line-1",
      sectionId: "section-1",
      actions: { sound: { resourceId: "sound-1" } },
    });
    editor.update(
      () => $getRoot().getLastChild().getFirstChild().toggleFormat("bold"),
      { discrete: true },
    );
    beforeInput("insertFromPaste", targetRange(0, 2, 1, 2), "one\ntwo");
    const lines = element.getLinesSnapshot();
    expect(texts()).toEqual(["alone", "twota"]);
    expect(lines[0].actions.sound).toEqual({ resourceId: "sound-1" });
    expect(lines[1].actions.sound).toBeUndefined();
    expect(lines[1].sectionId).toBe("section-1");
    expect(lines[1].actions.dialogue.content.at(-1)).toMatchObject({
      text: "ta",
      textStyle: { fontWeight: "bold" },
    });
  });

  it.each([
    ["insertText", "al\nXha"],
    ["insertLineBreak", "al\n\nha"],
  ])(
    "replaces selected text just after a soft newline with %s",
    (inputType, expected) => {
      beforeInput("insertLineBreak", targetRange(0, 2));
      const range = document.createRange();
      const textNode = editor.getElementByKey(lineKeys[0]).lastChild.firstChild;
      range.setStart(textNode, 0);
      range.setEnd(textNode, 1);
      beforeInput(inputType, range, "X");
      expect(texts()).toEqual([expected, "beta"]);
    },
  );

  it.each(["missing", "stale"])(
    "deletes forward at the input target when the Lexical caret is %s",
    (caret) => {
      beforeInput("insertLineBreak", targetRange(0, 2));
      const range = document.createRange();
      range.setStart(
        editor.getElementByKey(lineKeys[0]).lastChild.firstChild,
        0,
      );
      range.setEnd(editor.getElementByKey(lineKeys[0]).lastChild.firstChild, 1);
      editor.update(
        () => {
          if (caret === "stale") {
            $getRoot().getLastChild().selectStart();
          } else {
            $setSelection(null);
          }
        },
        { discrete: true },
      );
      window.getSelection().removeAllRanges();
      beforeInput("deleteContentForward", range);
      expect(texts()).toEqual(["al\nha", "beta"]);
    },
  );

  it("prioritizes a forward target spanning scene lines over a stale live caret", () => {
    const staleRange = document.createRange();
    staleRange.setStart(
      editor.getElementByKey(lineKeys[0]).firstChild.firstChild,
      0,
    );
    staleRange.collapse(true);
    window.getSelection().addRange(staleRange);
    beforeInput("deleteContentForward", targetRange(0, 2, 1, 2));
    expect(texts()).toEqual(["alta"]);
    expect(element.getLinesSnapshot()[0].id).toBe("line-1");
  });

  it.each([
    [false, "insertParagraph"],
    [false, "insertLineBreak"],
    [true, "insertLineBreak"],
    [true, "insertParagraph"],
  ])(
    "defers keyboard Enter (shift=%s) without a usable caret to %s",
    (shiftKey, inputType) => {
      const key = new window.KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 13,
        shiftKey,
        cancelable: true,
      });
      expect(element.handleLexicalEnterCommand(key)).toBe(true);
      expect(key.defaultPrevented).toBe(false);
      beforeInput(inputType, targetRange(0, 2));
      expect(texts()).toEqual(
        shiftKey ? ["al\npha", "beta"] : ["al", "pha", "beta"],
      );
    },
  );

  it("splits at the beforeinput target even when DOM and Lexical selection are missing", () => {
    const event = beforeInput("insertParagraph", targetRange(0, 2));
    expect(event.defaultPrevented).toBe(true);
    expect(texts()).toEqual(["al", "pha", "beta"]);
    const lines = element.getLinesSnapshot();
    expect(element.state.selectedLineId).toBe(lines[1].id);
    expect(element.pendingFocusTarget).toEqual({
      lineId: lines[1].id,
      cursorPosition: 0,
    });
    expect(
      editor.getEditorState().read(() => $getSelection().anchor.offset),
    ).toBe(0);
  });

  it("uses the event target instead of a stale caret on another line", () => {
    editor.update(() => $getRoot().getFirstChild().selectStart(), {
      discrete: true,
    });
    const range = document.createRange();
    range.setStart(
      editor.getElementByKey(lineKeys[0]).firstChild.firstChild,
      0,
    );
    range.collapse(true);
    window.getSelection().addRange(range);
    beforeInput("insertParagraph", targetRange(1, 2));
    expect(texts()).toEqual(["alpha", "be", "ta"]);
  });

  it("replaces the target range across scene lines with one paragraph break", () => {
    beforeInput("insertParagraph", targetRange(0, 2, 1, 2));
    expect(texts()).toEqual(["al", "ta"]);
    expect(element.getLinesSnapshot()[0].id).toBe("line-1");
  });

  it("inserts a soft newline at the beforeinput target without creating a scene line", () => {
    beforeInput("insertLineBreak", targetRange(0, 2));
    expect(texts()).toEqual(["al\npha", "beta"]);
  });

  it("types after a soft newline at the rendered caret and persists the newline", () => {
    beforeInput("insertLineBreak", targetRange(0, 2));
    const lineElement = editor.getElementByKey(lineKeys[0]);
    const range = document.createRange();
    range.setStart(lineElement.lastChild.firstChild, 0);
    range.collapse(true);
    expect(element.getLineOffsetFromRange(lineElement, range)).toBe(3);
    beforeInput("insertText", range, "X");
    expect(texts()).toEqual(["al\nXpha", "beta"]);
    expect(
      getPlainTextFromContent(
        getLineDialogueContent(element.getLinesSnapshot()[0]),
      ),
    ).toBe("al\nXpha");
  });

  it("splits after a soft newline at its logical content offset", () => {
    beforeInput("insertLineBreak", targetRange(0, 2));
    const range = document.createRange();
    range.setStart(editor.getElementByKey(lineKeys[0]).lastChild.firstChild, 1);
    range.collapse(true);
    beforeInput("insertParagraph", range);
    expect(texts()).toEqual(["al\np", "ha", "beta"]);
  });

  it("counts consecutive soft breaks but ignores the trailing caret placeholder", () => {
    editor.update(
      () => {
        const line = $getRoot().getFirstChild();
        line
          .clear()
          .append(
            $createTextNode("alpha"),
            $createLineBreakNode(),
            $createLineBreakNode(),
          );
      },
      { discrete: true },
    );
    const lineElement = editor.getElementByKey(lineKeys[0]);
    expect(lineElement.querySelectorAll("br")).toHaveLength(3);
    const range = document.createRange();
    range.selectNodeContents(lineElement);
    range.collapse(false);
    expect(element.getLineOffsetFromRange(lineElement, range)).toBe(7);
    expect(element.getLineVisibleTextLength(lineElement)).toBe(7);
    beforeInput("insertText", range, "X");
    expect(texts()).toEqual(["alpha\n\nX", "beta"]);
  });

  it("does not count an empty paragraph placeholder as a newline", () => {
    editor.update(() => $getRoot().getFirstChild().clear(), { discrete: true });
    const lineElement = editor.getElementByKey(lineKeys[0]);
    const range = document.createRange();
    range.selectNodeContents(lineElement);
    range.collapse(false);
    expect(element.getLineOffsetFromRange(lineElement, range)).toBe(0);
    expect(element.getLineVisibleTextLength(lineElement)).toBe(0);
    beforeInput("insertText", range, "X");
    expect(texts()).toEqual(["X", "beta"]);
  });

  it("counts newlines across formatted text while excluding invisible caret anchors", () => {
    editor.update(
      () => {
        const line = $getRoot().getFirstChild();
        line
          .clear()
          .append(
            $createTextNode(`al${EDITOR_CARET_TEXT}`).toggleFormat("bold"),
            $createLineBreakNode(),
            $createTextNode("pha").toggleFormat("italic"),
          );
      },
      { discrete: true },
    );
    const lineElement = editor.getElementByKey(lineKeys[0]);
    const range = document.createRange();
    range.selectNodeContents(lineElement.lastChild);
    range.collapse(true);
    expect(element.getLineOffsetFromRange(lineElement, range)).toBe(3);
  });

  it.each(["insertParagraph", "insertLineBreak"])(
    "keeps the native-caret fallback when %s supplies no target range",
    (inputType) => {
      const target = targetRange(0, 2);
      const range = document.createRange();
      range.setStart(target.startContainer, target.startOffset);
      range.collapse(true);
      window.getSelection().addRange(range);
      element.handleNativeBeforeInput(
        new window.InputEvent("beforeinput", { inputType, cancelable: true }),
      );
      expect(texts()).toEqual(
        inputType === "insertParagraph"
          ? ["al", "pha", "beta"]
          : ["al\npha", "beta"],
      );
    },
  );

  it.each(["insertParagraph", "insertLineBreak"])(
    "keeps the Lexical-selection fallback when %s has no native selection",
    (inputType) => {
      editor.update(
        () => $getRoot().getFirstChild().getFirstChild().select(2, 2),
        { discrete: true },
      );
      window.getSelection().removeAllRanges();
      beforeInput(inputType);
      expect(texts()).toEqual(
        inputType === "insertParagraph"
          ? ["al", "pha", "beta"]
          : ["al\npha", "beta"],
      );
    },
  );

  it.each(["insertParagraph", "insertLineBreak"])(
    "leaves composing %s to the IME",
    (inputType) => {
      const event = new window.InputEvent("beforeinput", {
        inputType,
        isComposing: true,
        cancelable: true,
      });
      Object.defineProperty(event, "getTargetRanges", {
        value: () => [targetRange(0, 2)],
      });
      element.handleNativeBeforeInput(event);
      expect(event.defaultPrevented).toBe(false);
      expect(texts()).toEqual(["alpha", "beta"]);
    },
  );

  it("keeps scene block mode from inserting text or creating a paragraph", () => {
    element.state.mode = "block";
    const event = beforeInput("insertParagraph", targetRange(0, 2));
    expect(event.defaultPrevented).toBe(true);
    expect(texts()).toEqual(["alpha", "beta"]);
  });

  it.each([
    [false, "insertParagraph", ["al", "pha", "beta"]],
    [false, "insertLineBreak", ["al", "pha", "beta"]],
    [true, "insertLineBreak", ["al\npha", "beta"]],
    [true, "insertParagraph", ["al\npha", "beta"]],
  ])(
    "handles keyboard Enter (shift=%s) followed by %s exactly once",
    (shiftKey, inputType, expected) => {
      const target = targetRange(0, 2);
      const range = document.createRange();
      range.setStart(target.startContainer, target.startOffset);
      range.collapse(true);
      window.getSelection().addRange(range);
      const key = new window.KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 13,
        shiftKey,
        cancelable: true,
      });
      expect(element.handleLexicalEnterCommand(key)).toBe(true);
      expect(key.defaultPrevented).toBe(true);
      beforeInput(inputType, target);
      expect(texts()).toEqual(expected);
    },
  );
});
