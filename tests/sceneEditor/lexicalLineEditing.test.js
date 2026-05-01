import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
} from "lexical";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

const installDomGlobals = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
    HTMLElement: globalThis.HTMLElement,
    MutationObserver: globalThis.MutationObserver,
    Node: globalThis.Node,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.Node = dom.window.Node;

  return () => {
    for (const [name, value] of Object.entries(previousGlobals)) {
      if (value === undefined) {
        delete globalThis[name];
      } else {
        globalThis[name] = value;
      }
    }

    dom.window.close();
  };
};

describe("lexical scene document editor line editing", () => {
  it("deletes from the native caret instead of merging when Backspace follows leading whitespace", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const preventDefault = vi.fn();
      const mergeCurrentLineBackward = vi.fn();
      const deleteCharacterBackward = vi.fn();
      const nativeSelection = {
        lineId: "line-2",
        offset: 1,
      };

      editorElement.hideSelectionPopover = vi.fn();
      editorElement.handleReferenceArrowNavigation = vi.fn(() => false);
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.getLineSelectionContext = vi.fn(() => ({
        lineId: "line-2",
        selection: {
          start: 0,
          end: 0,
        },
      }));
      editorElement.getNativeCollapsedLineSelectionContext = vi.fn(
        () => nativeSelection,
      );
      editorElement.mergeCurrentLineBackward = mergeCurrentLineBackward;
      editorElement.deleteCharacterBackward = deleteCharacterBackward;
      editorElement.handleNativeKeyDown({
        key: "Backspace",
        isComposing: false,
        preventDefault,
      });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(deleteCharacterBackward).toHaveBeenCalledWith({
        nativeSelection,
      });
      expect(mergeCurrentLineBackward).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("does not merge when Backspace was already handled by Lexical", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const preventDefault = vi.fn();
      const mergeCurrentLineBackward = vi.fn();
      const deleteCharacterBackward = vi.fn();

      editorElement.state = {
        selectedLineId: "line-2",
      };
      editorElement.editor = {
        getElementByKey: vi.fn(),
      };
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.handleReferenceArrowNavigation = vi.fn(() => false);
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.getLineSelectionContext = vi.fn(() => ({
        lineKey: "line-key-2",
        lineId: "line-2",
        selection: {
          start: 0,
          end: 0,
        },
        lineContent: [{ text: "" }],
      }));
      editorElement.getNativeCollapsedLineSelectionContext = vi.fn(() => ({
        lineId: "line-2",
        offset: 0,
      }));
      editorElement.mergeCurrentLineBackward = mergeCurrentLineBackward;
      editorElement.deleteCharacterBackward = deleteCharacterBackward;
      editorElement.handleNativeKeyDown({
        key: "Backspace",
        isComposing: false,
        defaultPrevented: true,
        preventDefault,
      });

      expect(preventDefault).not.toHaveBeenCalled();
      expect(deleteCharacterBackward).not.toHaveBeenCalled();
      expect(mergeCurrentLineBackward).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("removes leading whitespace without merging the current line into the previous line", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-line-leading-whitespace-test",
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();

      editor.update(
        () => {
          const root = $getRoot();
          const previousLine = $createParagraphNode();
          const currentLine = $createParagraphNode();

          previousLine.append($createTextNode("previous"));
          currentLine.append($createTextNode(" current"));
          root.append(previousLine, currentLine);
          editorElement.lineMetaByKey.set(previousLine.getKey(), {
            id: "line-1",
          });
          editorElement.lineMetaByKey.set(currentLine.getKey(), {
            id: "line-2",
          });
          editorElement.deleteLineContentBackwardAtOffset(
            currentLine,
            {
              id: "line-2",
            },
            1,
          );
        },
        { discrete: true },
      );

      const result = editor.getEditorState().read(() => {
        const lines = $getRoot().getChildren();
        return {
          count: lines.length,
          text: lines.map((line) => line.getTextContent()),
        };
      });

      expect(result).toEqual({
        count: 2,
        text: ["previous", "current"],
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("does not merge a non-empty line when Backspace resolves to line start", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-line-no-non-empty-merge-test",
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let currentLineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();

      editor.update(
        () => {
          const root = $getRoot();
          const previousLine = $createParagraphNode();
          const currentLine = $createParagraphNode();

          previousLine.append($createTextNode("previous"));
          currentLine.append($createTextNode("current"));
          root.append(previousLine, currentLine);
          currentLineKey = currentLine.getKey();
          editorElement.lineMetaByKey.set(previousLine.getKey(), {
            id: "line-1",
          });
          editorElement.lineMetaByKey.set(currentLineKey, {
            id: "line-2",
          });
        },
        { discrete: true },
      );

      const didMerge = editorElement.mergeCurrentLineBackward({
        context: {
          lineKey: currentLineKey,
          lineId: "line-2",
          selection: {
            start: 0,
            end: 0,
          },
          lineContent: [{ text: "current" }],
        },
        nativeSelection: {
          lineId: "line-2",
          offset: 0,
        },
      });
      const result = editor.getEditorState().read(() => {
        const lines = $getRoot().getChildren();
        return {
          count: lines.length,
          text: lines.map((line) => line.getTextContent()),
        };
      });

      expect(didMerge).toBe(false);
      expect(result).toEqual({
        count: 2,
        text: ["previous", "current"],
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("does not merge a single whitespace line when content serialization is empty", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-line-single-space-delete-test",
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let currentLineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();

      editor.update(
        () => {
          const root = $getRoot();
          const previousLine = $createParagraphNode();
          const currentLine = $createParagraphNode();

          previousLine.append($createTextNode("previous"));
          currentLine.append($createTextNode(" "));
          root.append(previousLine, currentLine);
          currentLineKey = currentLine.getKey();
          editorElement.lineMetaByKey.set(previousLine.getKey(), {
            id: "line-1",
          });
          editorElement.lineMetaByKey.set(currentLineKey, {
            id: "line-2",
          });
        },
        { discrete: true },
      );

      const didMerge = editorElement.mergeCurrentLineBackward({
        context: {
          lineKey: currentLineKey,
          lineId: "line-2",
          selection: {
            start: 0,
            end: 0,
          },
          lineContent: [{ text: "" }],
        },
        nativeSelection: {
          lineId: "line-2",
          offset: 0,
        },
      });

      const result = editor.getEditorState().read(() => {
        const lines = $getRoot().getChildren();
        return {
          count: lines.length,
          text: lines.map((line) => line.getTextContent()),
        };
      });

      expect(didMerge).toBe(false);
      expect(result).toEqual({
        count: 2,
        text: ["previous", " "],
      });
    } finally {
      restoreDomGlobals();
    }
  });
});
