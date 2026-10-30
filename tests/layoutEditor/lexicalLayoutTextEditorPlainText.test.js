// @vitest-environment jsdom
import {
  $getRoot,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  PASTE_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom has no clipboard or drag events. Lexical tells them apart by class
// name, so the test classes only need to exist.
class TestClipboardEvent extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.clipboardData = init.clipboardData;
  }
}
class TestDragEvent extends Event {}
vi.stubGlobal("ClipboardEvent", TestClipboardEvent);
vi.stubGlobal("DragEvent", TestDragEvent);
// jsdom has no layout, so Lexical's scroll into view measures an empty rect.
Range.prototype.getBoundingClientRect = () => new DOMRect();
const { LexicalLayoutTextEditorElement } = await import(
  "../../src/primitives/lexicalLayoutTextEditor.js"
);
customElements.define(
  "test-lexical-layout-text-editor",
  LexicalLayoutTextEditorElement,
);

const createDataTransfer = (data) => ({
  types: Object.keys(data),
  files: [],
  getData: (type) => data[type] ?? "",
});

const mountEditor = (content) => {
  const element = document.createElement("test-lexical-layout-text-editor");
  element.mentionTargets = [{ id: "playerName", label: "Player Name" }];
  element.content = content;
  document.body.append(element);
  return element;
};

const getEditorElement = (element) => element.querySelector("#editor");

// Places the caret at the end and runs the command in the same update, as
// Lexical does when it handles a paste or drop event.
const runAtEnd = (element, command, payload) => {
  element.editor.update(
    () => {
      $getRoot().selectEnd();
      element.editor.dispatchCommand(command, payload);
    },
    { discrete: true },
  );
};

describe("lexical layout text editor plain text", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("ignores bold, italic and underline shortcuts", async () => {
    const element = mountEditor([
      { text: "Hello " },
      { reference: { resourceId: "playerName" } },
    ]);
    const editorElement = getEditorElement(element);
    // A pasted tab becomes a tab node between text nodes.
    runAtEnd(
      element,
      PASTE_COMMAND,
      new ClipboardEvent("paste", {
        clipboardData: createDataTransfer({ "text/plain": "\tagain" }),
      }),
    );
    element.editor.update(
      () => {
        const paragraph = $getRoot().getFirstChild();
        paragraph.select(0, paragraph.getChildrenSize());
      },
      { discrete: true },
    );

    for (const key of ["b", "i", "u"]) {
      const event = new KeyboardEvent("keydown", {
        key,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      editorElement.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    // Lexical commits updates from events and commands in a microtask.
    await Promise.resolve();

    expect(element.getContent()).toEqual([
      { text: "Hello " },
      { reference: { resourceId: "playerName" } },
      { text: "\tagain" },
    ]);
    expect(editorElement.querySelector("strong, em, u")).toBeNull();
  });

  it("leaves the undo history alone on a formatting shortcut", async () => {
    const element = mountEditor([
      { text: "Hello " },
      { reference: { resourceId: "playerName" } },
    ]);
    const editorElement = getEditorElement(element);
    runAtEnd(element, CONTROLLED_TEXT_INSERTION_COMMAND, " end");
    element.editor.update(
      () => {
        const paragraph = $getRoot().getFirstChild();
        paragraph.select(0, paragraph.getChildrenSize());
      },
      { discrete: true },
    );

    editorElement.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "b",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await Promise.resolve();
    element.editor.dispatchCommand(UNDO_COMMAND);
    await Promise.resolve();

    // One Undo takes back the typing, the last change the user can see.
    expect(element.getContent()).toEqual([
      { text: "Hello " },
      { reference: { resourceId: "playerName" } },
    ]);
  });

  it("pastes formatted text as plain text", async () => {
    const element = mountEditor([{ text: "Hi " }]);

    runAtEnd(
      element,
      PASTE_COMMAND,
      new ClipboardEvent("paste", {
        clipboardData: createDataTransfer({
          "text/html": "<b>bold</b> <i>italic</i> <u>underlined</u>",
          "text/plain": "bold italic underlined",
        }),
      }),
    );

    expect(element.getContent()).toEqual([
      { text: "Hi bold italic underlined" },
    ]);
    expect(getEditorElement(element).querySelector("strong, em, u")).toBeNull();

    element.editor.dispatchCommand(UNDO_COMMAND);
    await Promise.resolve();
    expect(element.getContent()).toEqual([{ text: "Hi " }]);
  });

  it("drops dragged formatted text in as plain text", () => {
    const element = mountEditor([{ text: "Hi " }]);

    runAtEnd(element, CONTROLLED_TEXT_INSERTION_COMMAND, {
      dataTransfer: createDataTransfer({
        "text/html": "<b>bold</b>",
        "text/plain": "bold",
      }),
    });

    expect(element.getContent()).toEqual([{ text: "Hi bold" }]);
  });

  it("removes text styles from loaded content", () => {
    const element = mountEditor([
      {
        text: "Styled ",
        textStyle: {
          fontWeight: "bold",
          fill: "#336699",
        },
        textStyleId: "style-body",
        furigana: {
          text: "styled",
        },
      },
      {
        reference: {
          resourceId: "playerName",
        },
        textStyle: {
          fontStyle: "italic",
        },
        textStyleId: "style-variable",
      },
    ]);

    expect(getEditorElement(element).textContent).toBe("Styled Player Name");
    expect(element.getContent()).toEqual([
      { text: "Styled " },
      { reference: { resourceId: "playerName" } },
    ]);
  });
});
