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

describe("scene editor newline input", () => {
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
