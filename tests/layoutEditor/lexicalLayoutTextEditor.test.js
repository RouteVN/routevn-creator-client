import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  createEditor,
} from "lexical";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let restoreDomGlobals;

const installDomGlobals = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
    CustomEvent: globalThis.CustomEvent,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    MutationObserver: globalThis.MutationObserver,
    Node: globalThis.Node,
    ShadowRoot: globalThis.ShadowRoot,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.Node = dom.window.Node;
  globalThis.ShadowRoot = dom.window.ShadowRoot;

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

const createTextEditorHarness = async () => {
  const [{ LexicalLayoutTextEditorElement }, { MentionNode }] =
    await Promise.all([
      import("../../src/primitives/lexicalLayoutTextEditor.js"),
      import("../../src/primitives/lexicalRichTextShared.js"),
    ]);
  const editorElement = Object.create(LexicalLayoutTextEditorElement.prototype);
  const rootElement = document.createElement("div");
  const surfaceElement = document.createElement("div");
  const mentionMenuElement = document.createElement("div");

  rootElement.contentEditable = "true";
  mentionMenuElement.items = [];
  mentionMenuElement.open = false;
  mentionMenuElement.render = vi.fn();
  document.body.append(rootElement);

  editorElement.editor = createEditor({
    namespace: "layout-text-editor-test",
    nodes: [MentionNode],
    onError: (error) => {
      throw error;
    },
  });
  editorElement.editor.setRootElement(rootElement);
  editorElement.refs = {
    editor: rootElement,
    mentionMenu: mentionMenuElement,
    surface: surfaceElement,
  };
  editorElement.state = {
    content: [],
    mentionTargets: [],
    mentionMenu: {
      isOpen: false,
      query: "",
      items: [],
      highlightedIndex: 0,
      nodeKey: undefined,
      startOffset: 0,
      endOffset: 0,
      left: 0,
      top: 0,
    },
  };
  editorElement.selectedReferenceNodeKey = undefined;
  editorElement.focusEditor = vi.fn();
  editorElement.closeMentionMenu = vi.fn();
  Object.defineProperty(editorElement, "isConnected", {
    configurable: true,
    value: true,
  });

  return {
    editorElement,
    rootElement,
    dispose() {
      editorElement.editor.setRootElement(null);
      rootElement.remove();
    },
  };
};

const getNativeSelectionTextOffset = (rootElement) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return undefined;
  }

  const range = selection.getRangeAt(0);
  const beforeCaretRange = document.createRange();
  beforeCaretRange.selectNodeContents(rootElement);
  beforeCaretRange.setEnd(range.endContainer, range.endOffset);
  return beforeCaretRange.toString().length;
};

describe("lexical layout text editor", () => {
  beforeEach(() => {
    restoreDomGlobals = installDomGlobals();
  });

  afterEach(() => {
    restoreDomGlobals?.();
    restoreDomGlobals = undefined;
  });

  it("detects a slash mention trigger at the caret before trailing text", async () => {
    const { editorElement, rootElement, dispose } =
      await createTextEditorHarness();

    try {
      const textNode = document.createTextNode("Hello / world");
      rootElement.append(textNode);
      const range = document.createRange();
      range.setStart(textNode, "Hello /".length);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      const trigger = editorElement.getDomTextMentionTriggerMatch();

      expect(trigger).toMatchObject({
        source: "dom",
        startOffset: "Hello ".length,
        endOffset: "Hello /".length,
        query: "",
      });
      expect(
        editorElement.replaceContentRangeWithMention(
          [{ text: "Hello / world" }],
          trigger,
          {
            id: "playerName",
            label: "Player Name",
          },
        ),
      ).toEqual([
        { text: "Hello " },
        { reference: { resourceId: "playerName" } },
        { text: " world" },
      ]);
    } finally {
      dispose();
    }
  });

  it("opens the slash menu before trailing text when native selection is unavailable", async () => {
    const { editorElement, rootElement, dispose } =
      await createTextEditorHarness();

    try {
      rootElement.textContent = "Hello / world";
      window.getSelection().removeAllRanges();
      editorElement.state.mentionTargets = [
        {
          id: "playerName",
          label: "Player Name",
          variableType: "string",
        },
      ];
      editorElement.pendingTypedSlashMentionTrigger = {
        source: "beforeinput",
        until: editorElement.getNow() + 1000,
        domEndOffset: "Hello /".length,
      };

      expect(editorElement.openMentionMenuFromCurrentSelection()).toBe(true);
      expect(editorElement.state.mentionMenu).toMatchObject({
        isOpen: true,
        source: "dom",
        query: "",
        startOffset: "Hello ".length,
        endOffset: "Hello /".length,
      });
      expect(editorElement.state.mentionMenu.items).toEqual([
        {
          id: "playerName",
          label: "Player Name",
          variableType: "string",
        },
      ]);
    } finally {
      dispose();
    }
  });

  it("keeps a DOM-opened slash menu open when Lexical catches up", async () => {
    const { editorElement, dispose } = await createTextEditorHarness();

    try {
      editorElement.state.mentionMenu = {
        isOpen: true,
        source: "dom",
        query: "",
        items: [],
        highlightedIndex: 0,
        nodeKey: undefined,
        startOffset: "Hello ".length,
        endOffset: "Hello /".length,
        left: 0,
        top: 0,
      };

      expect(
        editorElement.getMentionTriggerOpenReason({
          nodeKey: "lexical-text-node",
          startOffset: "Hello ".length,
          endOffset: "Hello /".length,
          query: "",
        }),
      ).toBe("continuation");
    } finally {
      dispose();
    }
  });

  it("moves ArrowRight past a final variable chip without reselecting it", async () => {
    const [
      { $createMentionNode },
      { getReferenceSelectionInfo },
      { editorElement, rootElement, dispose },
    ] = await Promise.all([
      import("../../src/primitives/lexicalRichTextShared.js"),
      import("../../src/primitives/lexicalSceneDocumentReferences.js"),
      createTextEditorHarness(),
    ]);

    try {
      rootElement.focus();
      editorElement.editor.update(
        () => {
          const root = $getRoot();
          const paragraph = $createParagraphNode();
          const prefixNode = $createTextNode("Hi ");
          const mentionNode = $createMentionNode({
            resourceId: "playerName",
            label: "Player Name",
          });

          paragraph.append(prefixNode, mentionNode);
          root.clear();
          root.append(paragraph);
          prefixNode.selectEnd();
        },
        { discrete: true },
      );

      const chipElement = rootElement.querySelector(".mention-chip");
      const prefixTextNode = chipElement.previousSibling.firstChild;
      const range = document.createRange();
      range.setStart(prefixTextNode, prefixTextNode.textContent.length);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      const firstArrowRightEvent = {
        key: "ArrowRight",
        isComposing: false,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      expect(
        editorElement.handleReferenceArrowNavigation(firstArrowRightEvent),
      ).toBe(true);
      expect(firstArrowRightEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(rootElement.dataset.rvnReferenceSelectionActive).toBeUndefined();
      expect(
        rootElement.querySelector(".mention-chip").dataset,
      ).not.toHaveProperty("rvnReferenceSelected");

      const caretState = editorElement.editor.getEditorState().read(() => {
        const selection = $getSelection();
        const paragraph = $getRoot().getFirstChild();
        const referenceSelection = getReferenceSelectionInfo(selection);
        return {
          anchorKey: selection.anchor.key,
          anchorOffset: selection.anchor.offset,
          anchorType: selection.anchor.type,
          childrenSize: paragraph.getChildrenSize(),
          isCollapsed: selection.isCollapsed(),
          paragraphKey: paragraph.getKey(),
          referenceSelection: Boolean(referenceSelection),
        };
      });
      expect(caretState).toMatchObject({
        anchorOffset: caretState.childrenSize,
        anchorType: "element",
        isCollapsed: true,
        paragraphKey: caretState.anchorKey,
        referenceSelection: false,
      });

      const secondArrowRightEvent = {
        key: "ArrowRight",
        isComposing: false,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      expect(
        editorElement.handleReferenceArrowNavigation(secondArrowRightEvent),
      ).toBe(false);
      expect(secondArrowRightEvent.preventDefault).not.toHaveBeenCalled();
      expect(rootElement.dataset.rvnReferenceSelectionActive).toBeUndefined();
    } finally {
      dispose();
    }
  });

  it("selects a variable chip before Backspace removes it", async () => {
    const [
      { $createMentionNode },
      { getReferenceSelectionInfo },
      { editorElement, rootElement, dispose },
    ] = await Promise.all([
      import("../../src/primitives/lexicalRichTextShared.js"),
      import("../../src/primitives/lexicalSceneDocumentReferences.js"),
      createTextEditorHarness(),
    ]);
    let trailingTextKey;

    try {
      editorElement.editor.update(
        () => {
          const root = $getRoot();
          const paragraph = $createParagraphNode();
          const prefixNode = $createTextNode("Hi ");
          const mentionNode = $createMentionNode({
            resourceId: "playerName",
            label: "Player Name",
          });
          const trailingNode = $createTextNode("!");
          trailingTextKey = trailingNode.getKey();

          paragraph.append(prefixNode, mentionNode, trailingNode);
          root.clear();
          root.append(paragraph);
          trailingNode.select(0, 0);
        },
        { discrete: true },
      );
      const chipElement = rootElement.querySelector(".mention-chip");
      const trailingTextNode = chipElement.nextSibling;
      const range = document.createRange();
      range.setStart(trailingTextNode, 0);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      const firstBackspaceEvent = {
        key: "Backspace",
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };

      expect(editorElement.handleReferenceBackspace(firstBackspaceEvent)).toBe(
        true,
      );
      expect(firstBackspaceEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(rootElement.dataset.rvnReferenceSelectionActive).toBe("true");
      expect(rootElement.querySelector(".mention-chip").dataset).toMatchObject({
        rvnReferenceSelected: "true",
      });

      const selectedReference = editorElement.editor
        .getEditorState()
        .read(() => {
          const referenceSelection = getReferenceSelectionInfo($getSelection());
          return {
            isWhole: referenceSelection?.isWhole,
            resourceId: referenceSelection?.node.getReferenceData().resourceId,
          };
        });
      expect(selectedReference).toEqual({
        isWhole: true,
        resourceId: "playerName",
      });

      const secondBackspaceEvent = {
        key: "Backspace",
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      expect(editorElement.handleReferenceBackspace(secondBackspaceEvent)).toBe(
        true,
      );
      expect(secondBackspaceEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(rootElement.dataset.rvnReferenceSelectionActive).toBeUndefined();
      expect(rootElement.textContent).toBe("Hi !");
      expect(getNativeSelectionTextOffset(rootElement)).toBe("Hi ".length);
      expect(
        editorElement.editor.getEditorState().read(() => {
          return $getRoot().getTextContent();
        }),
      ).toBe("Hi !");
      expect(trailingTextKey).toBeDefined();
    } finally {
      dispose();
    }
  });

  it("handles beforeinput Backspace after a variable chip", async () => {
    const [{ $createMentionNode }, { editorElement, rootElement, dispose }] =
      await Promise.all([
        import("../../src/primitives/lexicalRichTextShared.js"),
        createTextEditorHarness(),
      ]);

    try {
      editorElement.editor.update(
        () => {
          const root = $getRoot();
          const paragraph = $createParagraphNode();

          paragraph.append(
            $createTextNode("Hi "),
            $createMentionNode({
              resourceId: "playerName",
              label: "Player Name",
            }),
            $createTextNode("!"),
          );
          root.clear();
          root.append(paragraph);
        },
        { discrete: true },
      );

      const chipElement = rootElement.querySelector(".mention-chip");
      const trailingTextNode = chipElement.nextSibling;
      const range = document.createRange();
      range.setStart(trailingTextNode, 0);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      const firstBeforeInputEvent = {
        inputType: "deleteContentBackward",
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      editorElement.handleEditorBeforeInput(firstBeforeInputEvent);

      expect(firstBeforeInputEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(rootElement.dataset.rvnReferenceSelectionActive).toBe("true");
      expect(rootElement.querySelector(".mention-chip").dataset).toMatchObject({
        rvnReferenceSelected: "true",
      });

      const secondBeforeInputEvent = {
        inputType: "deleteContentBackward",
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      editorElement.handleEditorBeforeInput(secondBeforeInputEvent);

      expect(secondBeforeInputEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(rootElement.textContent).toBe("Hi !");
      expect(rootElement.querySelector(".mention-chip")).toBeNull();
      expect(getNativeSelectionTextOffset(rootElement)).toBe("Hi ".length);
    } finally {
      dispose();
    }
  });

  it("handles beforeinput Backspace from an element caret after a variable chip", async () => {
    const [{ $createMentionNode }, { editorElement, rootElement, dispose }] =
      await Promise.all([
        import("../../src/primitives/lexicalRichTextShared.js"),
        createTextEditorHarness(),
      ]);

    try {
      editorElement.editor.update(
        () => {
          const root = $getRoot();
          const paragraph = $createParagraphNode();

          paragraph.append(
            $createMentionNode({
              resourceId: "skipMode",
              label: "Skipping",
            }),
            $createTextNode(" / 456"),
          );
          root.clear();
          root.append(paragraph);
        },
        { discrete: true },
      );

      const paragraphElement = rootElement.firstChild;
      const range = document.createRange();
      range.setStart(paragraphElement, 1);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      const beforeInputEvent = {
        inputType: "deleteContentBackward",
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      editorElement.handleEditorBeforeInput(beforeInputEvent);

      expect(beforeInputEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(rootElement.dataset.rvnReferenceSelectionActive).toBe("true");
      expect(rootElement.querySelector(".mention-chip").dataset).toMatchObject({
        rvnReferenceSelected: "true",
      });
    } finally {
      dispose();
    }
  });

  it("handles beforeinput Backspace after the variable chip spacer", async () => {
    const [{ $createMentionNode }, { editorElement, rootElement, dispose }] =
      await Promise.all([
        import("../../src/primitives/lexicalRichTextShared.js"),
        createTextEditorHarness(),
      ]);

    try {
      editorElement.editor.update(
        () => {
          const root = $getRoot();
          const paragraph = $createParagraphNode();

          paragraph.append(
            $createTextNode("Hi "),
            $createMentionNode({
              resourceId: "playerName",
              label: "Player Name",
            }),
            $createTextNode(" "),
          );
          root.clear();
          root.append(paragraph);
        },
        { discrete: true },
      );

      const chipElement = rootElement.querySelector(".mention-chip");
      const spacerTextNode = chipElement.nextSibling;
      const range = document.createRange();
      range.setStart(spacerTextNode, spacerTextNode.textContent.length);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      const firstBeforeInputEvent = {
        inputType: "deleteContentBackward",
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      editorElement.handleEditorBeforeInput(firstBeforeInputEvent);

      expect(firstBeforeInputEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(rootElement.dataset.rvnReferenceSelectionActive).toBe("true");
      expect(rootElement.querySelector(".mention-chip").dataset).toMatchObject({
        rvnReferenceSelected: "true",
      });

      const secondBeforeInputEvent = {
        inputType: "deleteContentBackward",
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      editorElement.handleEditorBeforeInput(secondBeforeInputEvent);

      expect(secondBeforeInputEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(rootElement.querySelector(".mention-chip")).toBeNull();
    } finally {
      dispose();
    }
  });

  it("handles beforeinput Backspace from target ranges when native selection is unavailable", async () => {
    const [{ $createMentionNode }, { editorElement, rootElement, dispose }] =
      await Promise.all([
        import("../../src/primitives/lexicalRichTextShared.js"),
        createTextEditorHarness(),
      ]);

    try {
      editorElement.editor.update(
        () => {
          const root = $getRoot();
          const paragraph = $createParagraphNode();

          paragraph.append(
            $createTextNode("Hi "),
            $createMentionNode({
              resourceId: "playerName",
              label: "Player Name",
            }),
            $createTextNode(" "),
          );
          root.clear();
          root.append(paragraph);
        },
        { discrete: true },
      );

      const chipElement = rootElement.querySelector(".mention-chip");
      const spacerNode = chipElement.nextSibling;
      const spacerTextNode =
        spacerNode.nodeType === Node.TEXT_NODE
          ? spacerNode
          : spacerNode.firstChild;
      window.getSelection().removeAllRanges();

      const beforeInputEvent = {
        inputType: "deleteContentBackward",
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        getTargetRanges: vi.fn(() => [
          {
            startContainer: spacerTextNode,
            startOffset: 0,
            endContainer: spacerTextNode,
            endOffset: spacerTextNode.textContent.length,
          },
        ]),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      editorElement.handleEditorBeforeInput(beforeInputEvent);

      expect(beforeInputEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(rootElement.dataset.rvnReferenceSelectionActive).toBe("true");
      expect(rootElement.querySelector(".mention-chip").dataset).toMatchObject({
        rvnReferenceSelected: "true",
      });
    } finally {
      dispose();
    }
  });

  it("handles Delete before a variable chip", async () => {
    const [{ $createMentionNode }, { editorElement, rootElement, dispose }] =
      await Promise.all([
        import("../../src/primitives/lexicalRichTextShared.js"),
        createTextEditorHarness(),
      ]);

    try {
      editorElement.editor.update(
        () => {
          const root = $getRoot();
          const paragraph = $createParagraphNode();

          paragraph.append(
            $createTextNode("Hi "),
            $createMentionNode({
              resourceId: "playerName",
              label: "Player Name",
            }),
            $createTextNode("!"),
          );
          root.clear();
          root.append(paragraph);
        },
        { discrete: true },
      );

      const chipElement = rootElement.querySelector(".mention-chip");
      const prefixTextNode = chipElement.previousSibling.firstChild;
      const range = document.createRange();
      range.setStart(prefixTextNode, prefixTextNode.textContent.length);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      const firstDeleteEvent = {
        key: "Delete",
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      expect(editorElement.handleReferenceDelete(firstDeleteEvent)).toBe(true);
      expect(rootElement.dataset.rvnReferenceSelectionActive).toBe("true");

      const secondDeleteEvent = {
        key: "Delete",
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      expect(editorElement.handleReferenceDelete(secondDeleteEvent)).toBe(true);

      expect(rootElement.textContent).toBe("Hi !");
      expect(rootElement.querySelector(".mention-chip")).toBeNull();
    } finally {
      dispose();
    }
  });

  it("renders backward-compatible variable content as a chip", async () => {
    const { editorElement, rootElement, dispose } =
      await createTextEditorHarness();

    try {
      editorElement.state.mentionTargets = [
        {
          id: "playerName",
          label: "Player Name",
        },
      ];

      editorElement.loadContent([
        { text: "Hi " },
        { variable: { variableId: "playerName" } },
        { text: "!" },
      ]);

      const chipElement = rootElement.querySelector(".mention-chip");
      expect(chipElement).not.toBeNull();
      expect(chipElement.dataset).toMatchObject({
        rvnReferenceResourceId: "playerName",
        rvnMentionLabel: "Player Name",
      });
      expect(rootElement.textContent).toBe("Hi Player Name!");
      expect(editorElement.getContent()).toEqual([
        { text: "Hi " },
        { reference: { resourceId: "playerName" } },
        { text: "!" },
      ]);
    } finally {
      dispose();
    }
  });

  it("preserves rich text metadata when returning loaded content", async () => {
    const { editorElement, rootElement, dispose } =
      await createTextEditorHarness();

    try {
      editorElement.state.mentionTargets = [
        {
          id: "playerName",
          label: "Player Name",
        },
      ];

      const content = [
        {
          text: "Styled ",
          textStyle: {
            fontWeight: "bold",
            fontStyle: "italic",
            textDecoration: "underline",
            fill: "#336699",
          },
          textStyleId: "style-body",
          furigana: {
            text: "styled",
            textStyleId: "style-ruby",
          },
        },
        {
          reference: {
            resourceId: "playerName",
          },
          textStyleId: "style-variable",
          furigana: {
            text: "name",
          },
        },
      ];

      editorElement.loadContent(content);

      expect(rootElement.textContent).toBe("Styled Player Name");
      expect(editorElement.getContent()).toEqual(content);
    } finally {
      dispose();
    }
  });
});
