import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $setSelection,
  createEditor,
} from "lexical";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { EDITOR_CARET_TEXT } from "../../src/internal/ui/sceneEditorLexical/contentModel.js";

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

const installAnimationFrameQueue = () => {
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const callbacks = [];
  globalThis.requestAnimationFrame = vi.fn((callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });

  return {
    callbacks,
    restore() {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
    },
  };
};

describe("lexical scene document editor line editing", () => {
  it("focuses the editor before restoring selection when block Enter enters text mode", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const calls = [];

      editorElement.refs = {
        editor: document.createElement("div"),
        surface: {
          dataset: {},
        },
      };
      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }],
      };
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();
      editorElement.focusLine = vi.fn();
      editorElement.isEditorActiveElement = vi.fn(() => true);
      editorElement.focus = vi.fn(() => {
        calls.push("focus");
      });
      editorElement.restoreLineSelection = vi.fn(() => {
        calls.push("restore");
        return true;
      });

      const event = {
        key: "Enter",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      editorElement.handleSurfaceKeyDown(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.state.mode).toBe("text-editor");
      expect(calls).toEqual(["focus", "restore", "restore", "restore"]);
      expect(editorElement.restoreLineSelection).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: -1,
      });
      expect(editorElement.focusLine).not.toHaveBeenCalled();
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("handles block Enter from the window capture path when the surface is active", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const surfaceNode = document.createElement("div");

      editorElement.refs = {
        editor: document.createElement("div"),
        surface: surfaceNode,
      };
      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }],
      };
      editorElement.enterTextMode = vi.fn();
      editorElement.getActiveElement = vi.fn(() => surfaceNode);

      const event = {
        key: "Enter",
        defaultPrevented: false,
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: surfaceNode,
        composedPath: vi.fn(() => [surfaceNode]),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      const didHandle = editorElement.handleBlockModeWindowEnter(event);

      expect(didHandle).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.enterTextMode).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: -1,
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("handles block Enter from the window capture path when the editor owns focus", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const editorNode = document.createElement("div");
      const paragraphNode = document.createElement("p");

      editorNode.append(paragraphNode);
      editorElement.refs = {
        editor: editorNode,
        surface: document.createElement("div"),
      };
      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }],
      };
      editorElement.enterTextMode = vi.fn();
      editorElement.getActiveElement = vi.fn(() => editorNode);

      const event = {
        key: "Enter",
        defaultPrevented: false,
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: paragraphNode,
        composedPath: vi.fn(() => [paragraphNode, editorNode]),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      const didHandle = editorElement.handleBlockModeWindowEnter(event);

      expect(didHandle).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.enterTextMode).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: -1,
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("routes block-mode shortcuts from the window capture path when focus has fallen to the document", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.refs = {
        editor: document.createElement("div"),
        surface: document.createElement("div"),
      };
      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }],
      };
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.dispatchShortcutEvent = vi.fn();
      editorElement.getActiveElement = vi.fn(() => document.body);

      const event = {
        key: "o",
        code: "KeyO",
        defaultPrevented: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        isComposing: false,
        target: document,
        composedPath: vi.fn(() => [document, window]),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      editorElement.handleWindowKeyDownCapture(event);

      expect(editorElement.dispatchShortcutEvent).toHaveBeenCalledWith(
        "newLine",
        {
          lineId: "line-1",
          position: "after",
        },
      );
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    } finally {
      restoreDomGlobals();
    }
  });

  it("suppresses block-mode Space from the window capture path", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.refs = {
        editor: document.createElement("div"),
        surface: document.createElement("div"),
      };
      editorElement.state = {
        mode: "block",
        selectedLineId: undefined,
        lines: [],
      };
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.getActiveElement = vi.fn(() => document.body);

      const event = {
        key: " ",
        code: "Space",
        defaultPrevented: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        isComposing: false,
        target: document.body,
        composedPath: vi.fn(() => [document.body, document, window]),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      editorElement.handleWindowKeyDownCapture(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    } finally {
      restoreDomGlobals();
    }
  });

  it("routes block-mode shortcuts from the window capture path when the host owns focus", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.refs = {
        editor: document.createElement("div"),
        surface: document.createElement("div"),
      };
      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }],
      };
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.enterTextMode = vi.fn();
      editorElement.getActiveElement = vi.fn(() => editorElement);

      const event = {
        key: "Enter",
        code: "Enter",
        defaultPrevented: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        isComposing: false,
        target: editorElement,
        composedPath: vi.fn(() => [editorElement]),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      editorElement.handleWindowKeyDownCapture(event);

      expect(editorElement.enterTextMode).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: -1,
      });
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    } finally {
      restoreDomGlobals();
    }
  });

  it("routes lowercase i to enter text mode at the start of the selected block line", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }],
      };
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.enterTextMode = vi.fn();

      const event = {
        key: "i",
        code: "KeyI",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };

      editorElement.handleSurfaceKeyDown(event);

      expect(editorElement.enterTextMode).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: 0,
      });
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    } finally {
      restoreDomGlobals();
    }
  });

  it("focuses before restoring selection in focusLine recovery", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const calls = [];

      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.state = {
        mode: "block",
        selectedLineId: "line-0",
      };
      editorElement.refs = {};
      editorElement.lineKeyById = new Map([["line-1", "line-key-1"]]);
      editorElement.markProgrammaticFocusRestore = vi.fn();
      editorElement.focus = vi.fn(() => {
        calls.push("focus");
      });
      editorElement.restoreLineSelection = vi.fn(() => {
        calls.push("restore");
        return true;
      });

      const didFocus = editorElement.focusLine({
        lineId: "line-1",
        cursorPosition: -1,
      });

      expect(didFocus).toBe(true);
      expect(calls).toEqual(["focus", "restore", "focus", "restore"]);
      expect(editorElement.state.mode).toBe("text-editor");
      expect(editorElement.state.selectedLineId).toBe("line-1");
      expect(editorElement.markProgrammaticFocusRestore).toHaveBeenCalledTimes(
        4,
      );
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("ignores stale async focus callbacks after a newer caret restore starts", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const animationFrameCallbacks = [];
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.focusRestoreSequenceId = 0;
      editorElement.programmaticFocusRestoreUntil = 0;
      editorElement.isEditorActiveElement = vi.fn(() => true);
      editorElement.focus = vi.fn();
      editorElement.restoreLineSelection = vi.fn(() => true);

      editorElement.restoreLineSelectionAfterLexicalFocus({
        lineId: "line-1",
        cursorPosition: 99,
      });
      editorElement.restoreLineSelectionAfterLexicalFocus({
        lineId: "line-1",
        cursorPosition: 12,
      });

      animationFrameCallbacks[0]();
      animationFrameCallbacks[1]();

      expect(editorElement.restoreLineSelection).toHaveBeenCalledTimes(1);
      expect(editorElement.restoreLineSelection).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: 12,
      });
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("does not overwrite a native caret that moved before async focus restore", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const animationFrameCallbacks = [];
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.focusRestoreSequenceId = 0;
      editorElement.programmaticFocusRestoreUntil = 0;
      editorElement.isEditorActiveElement = vi.fn(() => true);
      editorElement.getNativeLineSelectionContext = vi.fn(() => ({
        lineId: "line-1",
        start: 12,
        end: 12,
      }));
      editorElement.focus = vi.fn();
      editorElement.restoreLineSelection = vi.fn(() => true);

      editorElement.restoreLineSelectionAfterLexicalFocus({
        lineId: "line-1",
        cursorPosition: 99,
      });

      animationFrameCallbacks[0]();

      expect(editorElement.restoreLineSelection).not.toHaveBeenCalled();
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("does not switch modes when focusLine targets a line that is not loaded", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      editorElement.state = {
        mode: "block",
        selectedLineId: "line-0",
      };
      editorElement.lineKeyById = new Map();
      editorElement.focus = vi.fn();
      editorElement.restoreLineSelection = vi.fn();

      const didFocus = editorElement.focusLine({
        lineId: "missing-line",
        cursorPosition: 0,
      });

      expect(didFocus).toBe(false);
      expect(editorElement.state.mode).toBe("block");
      expect(editorElement.state.selectedLineId).toBe("line-0");
      expect(editorElement.focus).not.toHaveBeenCalled();
      expect(editorElement.restoreLineSelection).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("keeps the contenteditable as the focus owner when entering block mode", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const editorNode = document.createElement("div");
      const surfaceNode = document.createElement("div");

      editorElement.refs = {
        editor: editorNode,
        surface: surfaceNode,
      };
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }],
      };
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.clearPendingTextInputFallback = vi.fn();
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.scrollLineIntoView = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.focus = vi.fn();
      surfaceNode.focus = vi.fn();

      editorElement.enterBlockMode({
        focusSurface: true,
        lineId: "line-1",
      });

      expect(editorElement.state.mode).toBe("block");
      expect(editorNode.dataset.mode).toBe("block");
      expect(surfaceNode.dataset.mode).toBe("block");
      expect(editorElement.focus).toHaveBeenCalledWith({
        preventScroll: true,
      });
      expect(surfaceNode.focus).not.toHaveBeenCalled();
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("can prepare block focus without scrolling the selected line", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const editorNode = document.createElement("div");
      const surfaceNode = document.createElement("div");

      editorElement.refs = {
        editor: editorNode,
        surface: surfaceNode,
      };
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-2",
        lines: [{ id: "line-1" }, { id: "line-2" }],
      };
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.clearPendingTextInputFallback = vi.fn();
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.scrollLineIntoView = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.focus = vi.fn();

      editorElement.focusContainer({ scrollLine: false });

      expect(editorElement.state.mode).toBe("block");
      expect(editorElement.state.selectedLineId).toBe("line-2");
      expect(editorElement.scrollLineIntoView).not.toHaveBeenCalled();
      expect(editorElement.focus).toHaveBeenCalledWith({
        preventScroll: true,
      });
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("emits block navigation direction when moving down at the last line", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mode: "block",
        selectedLineId: "line-2",
        lines: [{ id: "line-1" }, { id: "line-2" }],
      };
      editorElement.scheduleRender = vi.fn();
      editorElement.scrollLineIntoView = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.moveBlockSelection(1);

      expect(editorElement.state.selectedLineId).toBe("line-2");
      expect(editorElement.scrollLineIntoView).toHaveBeenCalledWith({
        lineId: "line-2",
      });
      expect(editorElement.dispatchSelectedLineChanged).toHaveBeenCalledWith(
        "line-2",
        {
          cursorPosition: undefined,
          isBoundaryNavigation: true,
          isCollapsed: false,
          mode: "block",
          navigationDirection: "down",
        },
      );
    } finally {
      restoreDomGlobals();
    }
  });

  it("emits block navigation direction when moving up at the first line", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }, { id: "line-2" }],
      };
      editorElement.scheduleRender = vi.fn();
      editorElement.scrollLineIntoView = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.moveBlockSelection(-1);

      expect(editorElement.state.selectedLineId).toBe("line-1");
      expect(editorElement.scrollLineIntoView).toHaveBeenCalledWith({
        lineId: "line-1",
      });
      expect(editorElement.dispatchSelectedLineChanged).toHaveBeenCalledWith(
        "line-1",
        {
          cursorPosition: undefined,
          isBoundaryNavigation: true,
          isCollapsed: false,
          mode: "block",
          navigationDirection: "up",
        },
      );
    } finally {
      restoreDomGlobals();
    }
  });

  it("routes block-mode editor keydown through block shortcuts without arming text fallback", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }],
      };
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.moveBlockSelection = vi.fn();
      editorElement.updatePendingTextInputFallback = vi.fn();

      const event = {
        key: "j",
        code: "KeyJ",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      editorElement.handleNativeKeyDown(event);

      expect(editorElement.moveBlockSelection).toHaveBeenCalledWith(1);
      expect(
        editorElement.updatePendingTextInputFallback,
      ).not.toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("routes block-mode o new-line shortcut after the current line", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }],
      };
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.dispatchShortcutEvent = vi.fn();

      const event = {
        key: "o",
        code: "KeyO",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };

      editorElement.handleNativeKeyDown(event);

      expect(editorElement.dispatchShortcutEvent).toHaveBeenCalledWith(
        "newLine",
        {
          lineId: "line-1",
          position: "after",
        },
      );
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    } finally {
      restoreDomGlobals();
    }
  });

  it("routes block-mode O new-line shortcut before the current line", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }],
      };
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.dispatchShortcutEvent = vi.fn();

      const event = {
        key: "O",
        code: "KeyO",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: true,
        isComposing: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };

      editorElement.handleNativeKeyDown(event);

      expect(editorElement.dispatchShortcutEvent).toHaveBeenCalledWith(
        "newLine",
        {
          lineId: "line-1",
          position: "before",
        },
      );
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    } finally {
      restoreDomGlobals();
    }
  });

  it("syncs selected line from native selection after text-mode vertical arrow navigation", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const animationFrameCallbacks = [];
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-1",
        mentionMenu: {
          isOpen: false,
        },
      };
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.updatePendingTextInputFallback = vi.fn();
      editorElement.handleReferenceArrowNavigation = vi.fn(() => false);
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.getNativeLineSelectionContext = vi.fn(() => ({
        lineId: "line-2",
        start: 4,
        end: 4,
      }));
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      const event = {
        key: "ArrowDown",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
      };

      editorElement.handleNativeKeyDown(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(animationFrameCallbacks).toHaveLength(1);

      animationFrameCallbacks[0]();

      expect(editorElement.state.selectedLineId).toBe("line-2");
      expect(editorElement.scheduleRender).toHaveBeenCalledTimes(1);
      expect(editorElement.dispatchSelectedLineChanged).toHaveBeenCalledWith(
        "line-2",
        {
          cursorPosition: 4,
          isCollapsed: true,
          mode: "text-editor",
        },
      );
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("retries text-mode vertical selection sync when the native selection lags", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const animationFrameCallbacks = [];
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-2",
      };
      editorElement.getNativeLineSelectionContext = vi
        .fn()
        .mockReturnValueOnce({
          lineId: "line-2",
          start: 0,
          end: 0,
        })
        .mockReturnValueOnce({
          lineId: "line-2",
          start: 0,
          end: 0,
        })
        .mockReturnValueOnce({
          lineId: "line-1",
          start: 3,
          end: 3,
        });
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.scheduleNativeSelectionLineSyncAfterVerticalNavigation({
        key: "ArrowUp",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
      });

      expect(animationFrameCallbacks).toHaveLength(1);
      animationFrameCallbacks[0]();
      expect(editorElement.dispatchSelectedLineChanged).not.toHaveBeenCalled();
      expect(animationFrameCallbacks).toHaveLength(2);

      animationFrameCallbacks[1]();

      expect(editorElement.state.selectedLineId).toBe("line-1");
      expect(editorElement.scheduleRender).toHaveBeenCalledTimes(1);
      expect(editorElement.dispatchSelectedLineChanged).toHaveBeenCalledWith(
        "line-1",
        {
          cursorPosition: 3,
          isCollapsed: true,
          mode: "text-editor",
        },
      );
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("emits text-mode boundary navigation when ArrowDown cannot move past the last line", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const animationFrameCallbacks = [];
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-2",
        lines: [{ id: "line-1" }, { id: "line-2" }],
      };
      editorElement.getNativeLineSelectionContext = vi.fn(() => ({
        lineId: "line-2",
        start: 6,
        end: 6,
      }));
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.scheduleNativeSelectionLineSyncAfterVerticalNavigation({
        key: "ArrowDown",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
      });

      while (animationFrameCallbacks.length > 0) {
        const callback = animationFrameCallbacks.shift();
        callback();
      }

      expect(editorElement.dispatchSelectedLineChanged).toHaveBeenCalledOnce();
      expect(editorElement.dispatchSelectedLineChanged).toHaveBeenCalledWith(
        "line-2",
        {
          cursorPosition: 6,
          isCollapsed: true,
          mode: "text-editor",
          navigationDirection: "down",
          isBoundaryNavigation: true,
        },
      );
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("coalesces held ArrowDown repeats so boundary navigation can finish", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const animationFrameCallbacks = [];
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-2",
        lines: [{ id: "line-1" }, { id: "line-2" }],
      };
      editorElement.verticalNavigationSelectionSyncId = 0;
      editorElement.getNativeLineSelectionContext = vi.fn(() => ({
        lineId: "line-2",
        start: 6,
        end: 6,
      }));
      editorElement.dispatchSelectedLineChanged = vi.fn();

      const event = {
        key: "ArrowDown",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
      };

      editorElement.scheduleNativeSelectionLineSyncAfterVerticalNavigation(
        event,
      );

      for (let index = 0; index < 8; index += 1) {
        editorElement.scheduleNativeSelectionLineSyncAfterVerticalNavigation({
          ...event,
          repeat: true,
        });
        const callback = animationFrameCallbacks.shift();
        if (callback) {
          callback();
        }
        if (editorElement.dispatchSelectedLineChanged.mock.calls.length > 0) {
          break;
        }
      }

      expect(editorElement.dispatchSelectedLineChanged).toHaveBeenCalledOnce();
      expect(editorElement.dispatchSelectedLineChanged).toHaveBeenCalledWith(
        "line-2",
        {
          cursorPosition: 6,
          isCollapsed: true,
          mode: "text-editor",
          navigationDirection: "down",
          isBoundaryNavigation: true,
        },
      );
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("does not emit text-mode boundary navigation when ArrowDown moves within the last line", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const animationFrameCallbacks = [];
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-2",
        lines: [{ id: "line-1" }, { id: "line-2" }],
      };
      editorElement.getNativeLineSelectionContext = vi
        .fn()
        .mockReturnValueOnce({
          lineId: "line-2",
          start: 6,
          end: 6,
        })
        .mockReturnValueOnce({
          lineId: "line-2",
          start: 12,
          end: 12,
        });
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.scheduleNativeSelectionLineSyncAfterVerticalNavigation({
        key: "ArrowDown",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
      });

      animationFrameCallbacks[0]();

      expect(editorElement.dispatchSelectedLineChanged).not.toHaveBeenCalled();
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("suppresses native text insertion beforeinput while the editor is focused in block mode", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mode: "block",
      };
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.clearPendingTextInputFallback = vi.fn();
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.insertPlainText = vi.fn();

      const event = {
        inputType: "insertText",
        data: "x",
        defaultPrevented: false,
        isComposing: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      editorElement.handleNativeBeforeInput(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.insertPlainText).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("collapses invisible line-boundary selection artifacts to the line end", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lineElement = document.createElement("p");

      editorElement.state = {
        selectedLineId: "line-0",
      };
      editorElement.getLineElementFromRangePoint = vi.fn(() => lineElement);
      editorElement.getLineIdFromLineElement = vi.fn(() => "line-1");
      editorElement.restoreLineSelection = vi.fn(() => true);
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      const didNormalize =
        editorElement.normalizeInvisibleLineBoundarySelection({
          collapsed: false,
          startContainer: lineElement,
          startOffset: 0,
          endContainer: lineElement,
          endOffset: 1,
          toString: () => "\u200b\n",
        });

      expect(didNormalize).toBe(true);
      expect(editorElement.restoreLineSelection).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: -1,
      });
      expect(editorElement.dispatchSelectedLineChanged).toHaveBeenCalledWith(
        "line-1",
        {
          cursorPosition: undefined,
          isCollapsed: true,
          mode: "text-editor",
        },
      );
    } finally {
      restoreDomGlobals();
    }
  });

  it("collapses adjacent invisible line-boundary selection artifacts to the start line end", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const startLineElement = document.createElement("p");
      const endLineElement = document.createElement("p");

      editorElement.state = {
        selectedLineId: "line-0",
      };
      editorElement.getLineElementFromRangePoint = vi.fn((container) => {
        return container === startLineElement
          ? startLineElement
          : endLineElement;
      });
      editorElement.getLineIdFromLineElement = vi.fn((lineElement) => {
        return lineElement === startLineElement ? "line-1" : "line-2";
      });
      editorElement.getEditorLineOrder = vi.fn(() => [
        { lineId: "line-1" },
        { lineId: "line-2" },
      ]);
      editorElement.restoreLineSelection = vi.fn(() => true);
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      const didNormalize =
        editorElement.normalizeInvisibleLineBoundarySelection({
          collapsed: false,
          startContainer: startLineElement,
          startOffset: 1,
          endContainer: endLineElement,
          endOffset: 0,
          toString: () => "\n",
        });

      expect(didNormalize).toBe(true);
      expect(editorElement.restoreLineSelection).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: -1,
      });
      expect(editorElement.dispatchSelectedLineChanged).toHaveBeenCalledWith(
        "line-1",
        {
          cursorPosition: undefined,
          isCollapsed: true,
          mode: "text-editor",
        },
      );
    } finally {
      restoreDomGlobals();
    }
  });

  it("selects the trailing word at a non-final line boundary before native double-click selection paints", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lineElement = document.createElement("p");
      lineElement.textContent = "hello\u200b";

      editorElement.state = {
        selectedLineId: "line-0",
      };
      editorElement.getLineElementFromEvent = vi.fn(() => lineElement);
      editorElement.getLineIdFromLineElement = vi.fn(() => "line-1");
      editorElement.getEditorLineOrder = vi.fn(() => [
        { lineId: "line-1" },
        { lineId: "line-2" },
      ]);
      editorElement.getLineOffsetFromPointerEvent = vi.fn(() => 5);
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.setMode = vi.fn();
      editorElement.focusLine = vi.fn();
      editorElement.selectLineTextRange = vi.fn(() => true);
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      const event = {
        detail: 2,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      const didSuppress =
        editorElement.suppressNativeLineBoundaryDoubleClick(event);

      expect(didSuppress).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.focusLine).not.toHaveBeenCalled();
      expect(editorElement.selectLineTextRange).toHaveBeenCalledWith({
        lineId: "line-1",
        lineElement,
        start: 0,
        end: 5,
      });
      expect(editorElement.dispatchSelectedLineChanged).toHaveBeenCalledWith(
        "line-1",
        {
          cursorPosition: undefined,
          isCollapsed: false,
          mode: "text-editor",
        },
      );
    } finally {
      restoreDomGlobals();
    }
  });

  it("selects the full line on third click at a non-final line boundary", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lineElement = document.createElement("p");
      lineElement.textContent = "hello world\u200b";

      editorElement.state = {
        selectedLineId: "line-0",
      };
      editorElement.getLineElementFromEvent = vi.fn(() => lineElement);
      editorElement.getLineIdFromLineElement = vi.fn(() => "line-1");
      editorElement.getEditorLineOrder = vi.fn(() => [
        { lineId: "line-1" },
        { lineId: "line-2" },
      ]);
      editorElement.getLineOffsetFromPointerEvent = vi.fn(() => 11);
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.setMode = vi.fn();
      editorElement.focusLine = vi.fn();
      editorElement.selectLineTextRange = vi.fn(() => true);
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      const event = {
        detail: 3,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      const didSuppress =
        editorElement.suppressNativeLineBoundaryDoubleClick(event);

      expect(didSuppress).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(editorElement.selectLineTextRange).toHaveBeenCalledWith({
        lineId: "line-1",
        lineElement,
        start: 0,
        end: 11,
      });
      expect(editorElement.focusLine).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("enters text mode from block mode without preventing native caret placement", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lineElement = document.createElement("p");

      editorElement.state = {
        mode: "block",
      };
      editorElement.getLineElementFromEvent = vi.fn(() => lineElement);
      editorElement.getLineIdFromLineElement = vi.fn(() => "line-1");
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.applyModeState = vi.fn((mode) => {
        editorElement.state.mode = mode;
      });
      editorElement.clearDeleteShortcutState = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      const didEnter = editorElement.enterTextModeFromBlockModePointer(event);

      expect(didEnter).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
      expect(editorElement.state.selectedLineId).toBe("line-1");
      expect(editorElement.applyModeState).toHaveBeenCalledWith("text-editor");
      expect(editorElement.scheduleRender).toHaveBeenCalledTimes(1);
    } finally {
      restoreDomGlobals();
    }
  });

  it("enters block mode for the clicked line from the left gutter", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const leftGutter = document.createElement("div");
      const row = document.createElement("div");
      const lineNumber = document.createElement("div");

      row.className = "gutter-row";
      row.dataset.lineId = "line-2";
      lineNumber.className = "line-number";
      lineNumber.textContent = "2";
      row.append(lineNumber);
      leftGutter.append(row);

      editorElement.refs = {
        leftGutter,
      };
      editorElement.hasLine = vi.fn(() => true);
      editorElement.clearPointerDownInsideEditor = vi.fn();
      editorElement.clearDeleteShortcutState = vi.fn();
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.enterBlockMode = vi.fn();

      const event = {
        button: 0,
        target: lineNumber.firstChild,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      editorElement.handleLeftGutterMouseDown(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.hasLine).toHaveBeenCalledWith("line-2");
      expect(editorElement.enterBlockMode).toHaveBeenCalledWith({
        focusSurface: true,
        lineId: "line-2",
        emitSelectionChange: true,
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("enters block mode for the clicked line from an empty speaker slot", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const leftGutter = document.createElement("div");
      const row = document.createElement("div");
      const speakerSlot = document.createElement("div");

      row.className = "gutter-row";
      row.dataset.lineId = "line-3";
      speakerSlot.className = "speaker-slot";
      row.append(speakerSlot);
      leftGutter.append(row);

      editorElement.refs = {
        leftGutter,
      };
      editorElement.hasLine = vi.fn(() => true);
      editorElement.clearPointerDownInsideEditor = vi.fn();
      editorElement.clearDeleteShortcutState = vi.fn();
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.enterBlockMode = vi.fn();

      const event = {
        button: 0,
        target: speakerSlot,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      editorElement.handleLeftGutterMouseDown(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.hasLine).toHaveBeenCalledWith("line-3");
      expect(editorElement.enterBlockMode).toHaveBeenCalledWith({
        focusSurface: true,
        lineId: "line-3",
        emitSelectionChange: true,
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("enters block mode for the clicked line from avatar content", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const leftGutter = document.createElement("div");
      const row = document.createElement("div");
      const speakerSlot = document.createElement("div");
      const avatar = document.createElement("rvn-file-image");
      const avatarImage = document.createElement("img");

      row.className = "gutter-row";
      row.dataset.lineId = "line-4";
      speakerSlot.className = "speaker-slot";
      speakerSlot.append(avatar);
      row.append(speakerSlot);
      leftGutter.append(row);

      editorElement.refs = {
        leftGutter,
      };
      editorElement.hasLine = vi.fn(() => true);
      editorElement.clearPointerDownInsideEditor = vi.fn();
      editorElement.clearDeleteShortcutState = vi.fn();
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.enterBlockMode = vi.fn();

      const event = {
        button: 0,
        target: avatar,
        composedPath: () => [avatarImage, avatar, speakerSlot, row, leftGutter],
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      editorElement.handleLeftGutterMouseDown(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.hasLine).toHaveBeenCalledWith("line-4");
      expect(editorElement.enterBlockMode).toHaveBeenCalledWith({
        focusSurface: true,
        lineId: "line-4",
        emitSelectionChange: true,
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("requests a line context menu when right-clicking a line in block mode", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lineElement = document.createElement("p");

      editorElement.state = {
        mode: "block",
        selectedLineId: "line-5",
      };
      editorElement.getLineElementFromEvent = vi.fn(() => lineElement);
      editorElement.getLineIdFromLineElement = vi.fn(() => "line-5");
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.enterBlockMode = vi.fn();
      editorElement.dispatchShortcutEvent = vi.fn();

      const event = {
        clientX: 32,
        clientY: 48,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      editorElement.handleNativeContextMenu(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.enterBlockMode).toHaveBeenCalledWith({
        focusSurface: true,
        lineId: "line-5",
        emitSelectionChange: true,
      });
      expect(editorElement.dispatchShortcutEvent).toHaveBeenCalledWith(
        "line-context-menu-request",
        {
          lineId: "line-5",
          position: {
            x: 32,
            y: 48,
          },
        },
      );
    } finally {
      restoreDomGlobals();
    }
  });

  it("keeps default context menu behavior for an unselected line in block mode", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lineElement = document.createElement("p");

      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
      };
      editorElement.refs = {
        editor: document.createElement("div"),
      };
      editorElement.getLineElementFromEvent = vi.fn(() => lineElement);
      editorElement.getLineIdFromLineElement = vi.fn(() => "line-2");
      editorElement.getReferenceSnapshotFromContextEvent = vi.fn();
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.enterBlockMode = vi.fn();
      editorElement.dispatchShortcutEvent = vi.fn();

      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      editorElement.handleNativeContextMenu(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
      expect(editorElement.enterBlockMode).not.toHaveBeenCalled();
      expect(editorElement.dispatchShortcutEvent).toHaveBeenCalledWith(
        "line-context-menu-dismiss",
        {},
      );
      expect(editorElement.hideSelectionPopover).toHaveBeenCalledTimes(1);
    } finally {
      restoreDomGlobals();
    }
  });

  it("does not select a line from right-button mouseup before the context menu opens", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
      };
      editorElement.clearPointerDownInsideEditor = vi.fn();
      editorElement.getLineIdFromRange = vi.fn(() => "line-2");
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.handleNativeMouseUp({
        button: 2,
      });

      expect(editorElement.state.selectedLineId).toBe("line-1");
      expect(editorElement.clearPointerDownInsideEditor).not.toHaveBeenCalled();
      expect(editorElement.scheduleRender).not.toHaveBeenCalled();
      expect(editorElement.dispatchSelectedLineChanged).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("enters text mode and keeps default context menu behavior when right-clicking a different line", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lineElement = document.createElement("p");

      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
      };
      editorElement.getLineElementFromEvent = vi.fn(() => lineElement);
      editorElement.getLineIdFromLineElement = vi.fn(() => "line-2");
      editorElement.getLineOffsetFromPointerEvent = vi.fn(() => 4);
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.enterTextMode = vi.fn();
      editorElement.dispatchShortcutEvent = vi.fn();

      const mouseDownEvent = {
        button: 2,
        preventDefault: vi.fn(),
      };

      editorElement.handleNativeMouseDown(mouseDownEvent);
      editorElement.state.selectedLineId = "line-2";

      const contextMenuEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      editorElement.handleNativeContextMenu(contextMenuEvent);

      expect(mouseDownEvent.preventDefault).not.toHaveBeenCalled();
      expect(editorElement.hideSelectionPopover).toHaveBeenCalledTimes(1);
      expect(editorElement.closeMentionMenu).toHaveBeenCalledTimes(1);
      expect(editorElement.enterTextMode).toHaveBeenCalledWith({
        lineId: "line-2",
        cursorPosition: 4,
      });
      expect(contextMenuEvent.preventDefault).not.toHaveBeenCalled();
      expect(contextMenuEvent.stopPropagation).not.toHaveBeenCalled();
      expect(contextMenuEvent.stopImmediatePropagation).not.toHaveBeenCalled();
      expect(editorElement.dispatchShortcutEvent).toHaveBeenCalledWith(
        "line-context-menu-dismiss",
        {},
      );
    } finally {
      restoreDomGlobals();
    }
  });

  it("uses the current selected line when Escape returns from text mode to block mode", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-2",
        mentionMenu: {
          isOpen: false,
        },
      };
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.scheduleNativeSelectionLineSyncAfterVerticalNavigation =
        vi.fn();
      editorElement.updatePendingTextInputFallback = vi.fn();
      editorElement.handleReferenceArrowNavigation = vi.fn(() => false);
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.getSelectedLineIdSnapshot = vi.fn(() => "line-1");
      editorElement.enterBlockMode = vi.fn();

      const event = {
        key: "Escape",
        isComposing: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };

      editorElement.handleNativeKeyDown(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.enterBlockMode).toHaveBeenCalledWith({
        focusSurface: true,
        lineId: "line-2",
        emitSelectionChange: true,
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("clears stale focus restore state when selected line is cleared", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-1",
      };
      editorElement.refs = {
        editor: document.createElement("div"),
      };
      editorElement.isEditorFocused = true;
      editorElement.lastProgrammaticFocusTarget = {
        lineId: "line-1",
        cursorPosition: 2,
      };
      editorElement.pendingFocusTarget = {
        lineId: "line-1",
        cursorPosition: 2,
      };
      editorElement.programmaticFocusRestoreUntil = Number.POSITIVE_INFINITY;
      editorElement.pendingSelectionSnapshot = {
        lineId: "line-1",
      };
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.applyModeState = vi.fn((mode) => {
        editorElement.state.mode = mode;
      });
      editorElement.scheduleRender = vi.fn();

      editorElement.selectedLineId = undefined;

      expect(editorElement.state.selectedLineId).toBeUndefined();
      expect(editorElement.isEditorFocused).toBe(false);
      expect(editorElement.lastProgrammaticFocusTarget).toBeUndefined();
      expect(editorElement.pendingFocusTarget).toBeUndefined();
      expect(editorElement.programmaticFocusRestoreUntil).toBe(0);
      expect(editorElement.pendingSelectionSnapshot).toBeUndefined();
      expect(editorElement.hideSelectionPopover).toHaveBeenCalledOnce();
      expect(editorElement.closeMentionMenu).toHaveBeenCalledOnce();
      expect(editorElement.applyModeState).toHaveBeenCalledWith("block");
      expect(editorElement.scheduleRender).toHaveBeenCalledOnce();
    } finally {
      restoreDomGlobals();
    }
  });

  it("ignores text selection sync from an unfocused editor", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lines = [
        {
          id: "line-1",
          actions: {
            dialogue: {
              content: [{ text: "first" }],
            },
          },
        },
        {
          id: "line-2",
          actions: {
            dialogue: {
              content: [{ text: "second" }],
            },
          },
        },
      ];

      editorElement.state = {
        mode: "text-editor",
        lines,
        selectedLineId: "line-1",
        mentionTargets: [],
      };
      editorElement.isEditorFocused = false;
      editorElement.readEditorSnapshot = vi.fn(() => ({
        lines,
        selectedLineId: "line-2",
        activeFormats: {},
      }));
      editorElement.shouldPreserveMentionMenuAfterSelectionLoss = vi.fn(
        () => false,
      );
      editorElement.closeMentionMenu = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.syncFromEditorState({});

      expect(editorElement.state.selectedLineId).toBe("line-1");
      expect(editorElement.dispatchSelectedLineChanged).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("preserves block selection when editor state sync has stale native selection", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lines = [
        {
          id: "line-1",
          actions: {
            dialogue: {
              content: [{ text: "first" }],
            },
          },
        },
        {
          id: "line-2",
          actions: {
            dialogue: {
              content: [{ text: "second" }],
            },
          },
        },
      ];

      editorElement.state = {
        mode: "block",
        lines,
        selectedLineId: "line-2",
        mentionTargets: [],
      };
      editorElement.readEditorSnapshot = vi.fn(() => ({
        lines,
        selectedLineId: "line-1",
        activeFormats: {},
      }));
      editorElement.shouldPreserveMentionMenuAfterSelectionLoss = vi.fn(
        () => false,
      );
      editorElement.closeMentionMenu = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.syncFromEditorState({});

      expect(editorElement.state.selectedLineId).toBe("line-2");
      expect(editorElement.dispatchSelectedLineChanged).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("keeps slash mention popover modal before opening", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const menu = document.createElement("div");
      const menuShadow = menu.attachShadow({ mode: "open" });
      const popover = document.createElement("rtgl-popover");
      const popoverShadow = popover.attachShadow({ mode: "open" });
      const dialog = document.createElement("dialog");
      const renderCalls = [];

      popoverShadow.append(dialog);
      menu.items = [];
      menu.open = false;
      menu.render = vi.fn(() => {
        renderCalls.push({
          open: menu.open,
          noOverlay: popover.hasAttribute("no-overlay"),
        });
        if (!menuShadow.querySelector("rtgl-popover")) {
          menuShadow.append(popover);
        }
      });

      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.mentionMenuFocusRestoreTimerId = undefined;
      editorElement.refs = { mentionMenu: menu };
      editorElement.state = {
        mentionMenu: {
          isOpen: true,
          query: "",
          items: [{ id: "character-1", label: "Alex" }],
          left: 24,
          top: 48,
        },
      };

      editorElement.renderMentionMenu();

      expect(renderCalls).toEqual([
        { open: false, noOverlay: false },
        { open: true, noOverlay: false },
      ]);
      expect(popover.hasAttribute("no-overlay")).toBe(false);
      expect(dialog.getAttribute("tabindex")).toBe("-1");

      editorElement.clearMentionMenuFocusRestore();
    } finally {
      restoreDomGlobals();
    }
  });

  it("removes stale no-overlay from the slash mention popover", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const popover = document.createElement("rtgl-popover");
      const popoverShadow = popover.attachShadow({ mode: "open" });
      const dialog = document.createElement("dialog");

      popover.setAttribute("no-overlay", "");
      popoverShadow.append(dialog);
      editorElement.getMentionMenuPopover = vi.fn(() => popover);

      editorElement.syncMentionMenuPopover();

      expect(popover.hasAttribute("no-overlay")).toBe(false);
      expect(dialog.getAttribute("tabindex")).toBe("-1");
    } finally {
      restoreDomGlobals();
    }
  });

  it("does not re-render an already matching slash mention menu", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const popover = document.createElement("rtgl-popover");

      editorElement.state = {
        mentionMenu: {
          isOpen: true,
          query: "",
          items: [
            {
              id: "character-1",
              label: "Alex",
              variableType: "character",
            },
          ],
          left: 193,
          top: 193,
        },
      };
      editorElement.refs = {
        mentionMenu: {
          open: true,
          items: [
            {
              id: "mention:character-1",
              type: "item",
              label: "Alex",
              suffixText: "character",
            },
          ],
          x: "193",
          y: "193",
          place: "bs",
          w: "260",
          h: "240",
          render: vi.fn(),
        },
      };
      editorElement.getMentionMenuPopover = vi.fn(() => popover);
      editorElement.syncMentionMenuPopover = vi.fn();

      editorElement.renderMentionMenu();

      expect(editorElement.refs.mentionMenu.render).not.toHaveBeenCalled();
      expect(editorElement.syncMentionMenuPopover).toHaveBeenCalledTimes(1);
    } finally {
      restoreDomGlobals();
    }
  });

  it("closes and dismisses the current slash mention trigger from the close event", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mentionMenu: {
          isOpen: true,
          query: "",
          nodeKey: "node-1",
          startOffset: 1,
          endOffset: 2,
        },
      };
      editorElement.refs = {
        mentionMenu: {
          items: [{ id: "character-1", label: "Alex" }],
          open: true,
          render: vi.fn(),
        },
      };
      editorElement.mentionMenuFocusRestoreTimerId = undefined;
      editorElement.hasActiveMentionTrigger = vi.fn(() => true);
      editorElement.syncMentionMenuPopover = vi.fn();
      editorElement.scheduleRender = vi.fn();

      editorElement.handleMentionMenuClose();

      expect(editorElement.refs.mentionMenu.open).toBe(false);
      expect(editorElement.state.mentionMenu.isOpen).toBe(false);
      expect(editorElement.dismissedMentionTrigger).toEqual({
        nodeKey: "node-1",
        startOffset: 1,
        endOffset: 2,
        query: "",
      });
      expect(editorElement.scheduleRender).not.toHaveBeenCalled();
      expect(editorElement.syncMentionMenuPopover).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("restores the slash mention trigger caret when the overlay closes the menu", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-slash-mention-overlay-close-selection-test",
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let firstLineKey;
      let secondLineKey;
      let triggerTextKey;

      rootElement.tabIndex = 0;
      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.refs = {
        editor: rootElement,
        surface: {
          dataset: {},
        },
        mentionMenu: {
          items: [{ id: "character-1", label: "Alex" }],
          open: true,
          render: vi.fn(),
        },
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();

      editor.update(
        () => {
          const root = $getRoot();
          const firstLine = $createParagraphNode();
          const secondLine = $createParagraphNode();
          const firstText = $createTextNode("first");
          const prefixText = $createTextNode("say ");
          const triggerText = $createTextNode("/a");
          const suffixText = $createTextNode(" later");

          triggerText.setStyle("--rvn-test-trigger: 1;");
          root.clear();
          firstLine.append(firstText);
          secondLine.append(prefixText, triggerText, suffixText);
          root.append(firstLine, secondLine);
          firstLineKey = firstLine.getKey();
          secondLineKey = secondLine.getKey();
          triggerTextKey = triggerText.getKey();
          editorElement.lineMetaByKey.set(firstLineKey, {
            id: "line-1",
          });
          editorElement.lineMetaByKey.set(secondLineKey, {
            id: "line-2",
          });
          editorElement.lineKeyById.set("line-1", firstLineKey);
          editorElement.lineKeyById.set("line-2", secondLineKey);
          firstText.select(0, 0);
        },
        { discrete: true },
      );

      editorElement.state = {
        mode: "text-editor",
        lines: [],
        selectedLineId: "line-1",
        mentionTargets: [{ id: "character-1", label: "Alex" }],
        mentionMenu: {
          isOpen: true,
          query: "a",
          items: [{ id: "character-1", label: "Alex" }],
          highlightedIndex: 0,
          nodeKey: triggerTextKey,
          lineId: "line-2",
          startOffset: 0,
          endOffset: 2,
        },
      };
      editorElement.isEditorFocused = true;
      editorElement.mentionMenuFocusRestoreTimerId = undefined;
      editorElement.hasActiveMentionTrigger = vi.fn(() => false);
      editorElement.scheduleRender = vi.fn();

      editorElement.handleMentionMenuClose();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(editorElement.refs.mentionMenu.open).toBe(false);
      expect(editorElement.state.selectedLineId).toBe("line-2");
      expect(editorElement.getCurrentSelectionSnapshot()).toEqual({
        lineId: "line-2",
        start: 6,
        end: 6,
      });
      expect(editorElement.dismissedMentionTrigger).toEqual({
        nodeKey: triggerTextKey,
        lineId: "line-2",
        startOffset: 0,
        endOffset: 2,
        query: "a",
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("prefers the live slash trigger over stale menu state when closing", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-slash-mention-live-close-selection-test",
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const textValue = "say / first /";
      let lineKey;
      let textKey;

      rootElement.tabIndex = 0;
      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.refs = {
        editor: rootElement,
        surface: {
          dataset: {},
        },
        mentionMenu: {
          items: [{ id: "character-1", label: "Alex" }],
          open: true,
          render: vi.fn(),
        },
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();
          const text = $createTextNode(textValue);

          text.setStyle("--rvn-test-trigger: 1;");
          root.clear();
          line.append(text);
          root.append(line);
          lineKey = line.getKey();
          textKey = text.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
          });
          editorElement.lineKeyById.set("line-1", lineKey);
          text.select(textValue.length, textValue.length);
        },
        { discrete: true },
      );

      editorElement.state = {
        mode: "text-editor",
        lines: [],
        selectedLineId: "line-1",
        mentionTargets: [{ id: "character-1", label: "Alex" }],
        mentionMenu: {
          isOpen: true,
          query: "",
          items: [{ id: "character-1", label: "Alex" }],
          highlightedIndex: 0,
          nodeKey: textKey,
          lineId: "line-1",
          startOffset: 4,
          endOffset: 5,
        },
      };
      editorElement.isEditorFocused = true;
      editorElement.mentionMenuFocusRestoreTimerId = undefined;
      editorElement.scheduleRender = vi.fn();

      editorElement.handleMentionMenuClose();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(editorElement.state.selectedLineId).toBe("line-1");
      expect(editorElement.getCurrentSelectionSnapshot()).toEqual({
        lineId: "line-1",
        start: textValue.length,
        end: textValue.length,
      });
      expect(editorElement.dismissedMentionTrigger).toEqual({
        nodeKey: textKey,
        lineId: "line-1",
        startOffset: textValue.length - 1,
        endOffset: textValue.length,
        query: "",
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("dismisses the current slash mention trigger when blur closes the menu", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-1",
        mentionMenu: {
          isOpen: true,
          query: "",
          nodeKey: "node-1",
          startOffset: 1,
          endOffset: 2,
        },
      };
      editorElement.refs = {
        mentionMenu: {
          items: [{ id: "character-1", label: "Alex" }],
          open: true,
          render: vi.fn(),
        },
      };
      editorElement.isEditorActiveElement = vi.fn(() => false);
      editorElement.isWithinProgrammaticFocusRestoreWindow = vi.fn(() => false);
      editorElement.shouldRestoreProgrammaticBodyBlur = vi.fn(() => false);
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.enterBlockMode = vi.fn();
      editorElement.dispatchEvent = vi.fn();

      editorElement.commitNativeBlur();

      expect(editorElement.refs.mentionMenu.open).toBe(false);
      expect(editorElement.state.mentionMenu.isOpen).toBe(false);
      expect(editorElement.dismissedMentionTrigger).toEqual({
        nodeKey: "node-1",
        startOffset: 1,
        endOffset: 2,
        query: "",
      });
      expect(editorElement.enterBlockMode).toHaveBeenCalledWith({
        focusSurface: false,
        emitSelectionChange: false,
        lineId: "line-1",
        scrollLine: false,
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("dismisses the slash mention menu on arrow keys without blocking caret movement", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-1",
        mentionMenu: {
          isOpen: true,
          query: "",
          nodeKey: "node-1",
          startOffset: 1,
          endOffset: 2,
        },
      };
      editorElement.refs = {
        mentionMenu: {
          items: [{ id: "character-1", label: "Alex" }],
          open: true,
          render: vi.fn(),
        },
      };
      editorElement.isEditorFocused = true;
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.scheduleNativeSelectionLineSyncAfterVerticalNavigation =
        vi.fn();
      editorElement.updatePendingTextInputFallback = vi.fn();
      editorElement.handleReferenceArrowNavigation = vi.fn(() => false);
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.isEditorActiveElement = vi.fn(() => true);

      const event = {
        key: "ArrowDown",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };

      editorElement.handleNativeKeyDown(event);

      expect(editorElement.refs.mentionMenu.open).toBe(false);
      expect(editorElement.state.mentionMenu.isOpen).toBe(false);
      expect(editorElement.dismissedMentionTrigger).toEqual({
        nodeKey: "node-1",
        startOffset: 1,
        endOffset: 2,
        query: "",
      });
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
      expect(
        editorElement.scheduleNativeSelectionLineSyncAfterVerticalNavigation,
      ).toHaveBeenCalledWith(event);
    } finally {
      restoreDomGlobals();
    }
  });

  it("does not reopen a dismissed slash mention menu for the same trigger", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lines = [
        {
          id: "line-1",
          actions: {
            dialogue: {
              content: [{ text: "/" }],
            },
          },
        },
      ];

      editorElement.state = {
        mode: "text-editor",
        lines,
        selectedLineId: "line-1",
        mentionTargets: [{ id: "character-1", label: "Alex" }],
        mentionMenu: {
          isOpen: false,
        },
      };
      editorElement.refs = {
        mentionMenu: {
          items: [],
          open: true,
          render: vi.fn(),
        },
      };
      editorElement.isEditorFocused = true;
      editorElement.dismissedMentionTrigger = {
        nodeKey: "node-1",
        startOffset: 0,
        endOffset: 1,
        query: "",
      };
      editorElement.readEditorSnapshot = vi.fn(() => ({
        lines,
        selectedLineId: "line-1",
        activeFormats: {},
        mentionTrigger: {
          nodeKey: "node-1",
          startOffset: 0,
          endOffset: 1,
          query: "",
          source: "lexical",
        },
      }));
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.syncFromEditorState({});

      expect(editorElement.state.mentionMenu.isOpen).toBe(false);
      expect(editorElement.refs.mentionMenu.open).toBe(false);
      expect(editorElement.dismissedMentionTrigger).toEqual({
        nodeKey: "node-1",
        startOffset: 0,
        endOffset: 1,
        query: "",
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("does not open the slash mention menu when the caret moves to an existing slash", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lines = [
        {
          id: "line-1",
          actions: {
            dialogue: {
              content: [{ text: "/" }],
            },
          },
        },
      ];

      editorElement.state = {
        mode: "text-editor",
        lines,
        selectedLineId: "line-1",
        mentionTargets: [{ id: "character-1", label: "Alex" }],
        mentionMenu: {
          isOpen: false,
        },
      };
      editorElement.refs = {
        mentionMenu: {
          items: [],
          open: false,
          render: vi.fn(),
        },
      };
      editorElement.isEditorFocused = true;
      editorElement.readEditorSnapshot = vi.fn(() => ({
        lines,
        selectedLineId: "line-1",
        activeFormats: {},
        mentionTrigger: {
          nodeKey: "node-1",
          lineId: "line-1",
          startOffset: 0,
          endOffset: 1,
          query: "",
          source: "lexical",
        },
      }));
      editorElement.getMentionMenuPositionForTrigger = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.syncFromEditorState({});

      expect(editorElement.state.mentionMenu.isOpen).toBe(false);
      expect(editorElement.refs.mentionMenu.open).toBe(false);
      expect(
        editorElement.getMentionMenuPositionForTrigger,
      ).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("opens the slash mention menu when slash was just typed", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lines = [
        {
          id: "line-1",
          actions: {
            dialogue: {
              content: [{ text: "/" }],
            },
          },
        },
      ];

      editorElement.state = {
        mode: "text-editor",
        lines,
        selectedLineId: "line-1",
        mentionTargets: [{ id: "character-1", label: "Alex" }],
        mentionMenu: {
          isOpen: false,
        },
      };
      editorElement.refs = {
        mentionMenu: {
          items: [],
          open: false,
          render: vi.fn(),
        },
      };
      editorElement.isEditorFocused = true;
      editorElement.readEditorSnapshot = vi.fn(() => ({
        lines,
        selectedLineId: "line-1",
        activeFormats: {},
        mentionTrigger: {
          nodeKey: "node-1",
          lineId: "line-1",
          startOffset: 0,
          endOffset: 1,
          query: "",
          source: "lexical",
        },
      }));
      editorElement.getMentionMenuPositionForTrigger = vi.fn(() => ({
        left: 24,
        top: 48,
      }));
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.armMentionMenuOpenFromTypedSlash({
        source: "test",
      });
      editorElement.syncFromEditorState({});

      expect(editorElement.state.mentionMenu).toMatchObject({
        isOpen: true,
        query: "",
        items: [{ id: "character-1", label: "Alex" }],
        nodeKey: "node-1",
        lineId: "line-1",
        startOffset: 0,
        endOffset: 1,
        left: 24,
        top: 48,
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("keeps updating an open slash mention menu while typing the query", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lines = [
        {
          id: "line-1",
          actions: {
            dialogue: {
              content: [{ text: "/a" }],
            },
          },
        },
      ];

      editorElement.state = {
        mode: "text-editor",
        lines,
        selectedLineId: "line-1",
        mentionTargets: [
          { id: "character-1", label: "Alex" },
          { id: "character-2", label: "Blake" },
        ],
        mentionMenu: {
          isOpen: true,
          query: "",
          items: [{ id: "character-1", label: "Alex" }],
          nodeKey: "node-1",
          lineId: "line-1",
          startOffset: 0,
          endOffset: 1,
        },
      };
      editorElement.refs = {
        mentionMenu: {
          items: [],
          open: true,
          render: vi.fn(),
        },
      };
      editorElement.isEditorFocused = true;
      editorElement.readEditorSnapshot = vi.fn(() => ({
        lines,
        selectedLineId: "line-1",
        activeFormats: {},
        mentionTrigger: {
          nodeKey: "node-1",
          lineId: "line-1",
          startOffset: 0,
          endOffset: 2,
          query: "a",
          source: "lexical",
        },
      }));
      editorElement.getMentionMenuPositionForTrigger = vi.fn(() => ({
        left: 24,
        top: 48,
      }));
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.syncFromEditorState({});

      expect(editorElement.state.mentionMenu).toMatchObject({
        isOpen: true,
        query: "a",
        items: [{ id: "character-1", label: "Alex" }],
        nodeKey: "node-1",
        lineId: "line-1",
        startOffset: 0,
        endOffset: 2,
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("keeps a dismissed slash mention trigger through a transient no-trigger sync", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lines = [
        {
          id: "line-1",
          actions: {
            dialogue: {
              content: [{ text: "/" }],
            },
          },
        },
      ];

      editorElement.state = {
        mode: "text-editor",
        lines,
        selectedLineId: "line-1",
        mentionTargets: [{ id: "character-1", label: "Alex" }],
        mentionMenu: {
          isOpen: false,
        },
      };
      editorElement.refs = {
        mentionMenu: {
          items: [],
          open: true,
          render: vi.fn(),
        },
      };
      editorElement.isEditorFocused = true;
      editorElement.dismissedMentionTrigger = {
        nodeKey: "node-1",
        startOffset: 0,
        endOffset: 1,
        query: "",
      };
      editorElement.readEditorSnapshot = vi
        .fn()
        .mockReturnValueOnce({
          lines,
          selectedLineId: "line-1",
          activeFormats: {},
          mentionTrigger: undefined,
        })
        .mockReturnValueOnce({
          lines,
          selectedLineId: "line-1",
          activeFormats: {},
          mentionTrigger: {
            nodeKey: "node-1",
            startOffset: 0,
            endOffset: 1,
            query: "",
            source: "lexical",
          },
        });
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.syncFromEditorState({});
      editorElement.syncFromEditorState({});

      expect(editorElement.state.mentionMenu.isOpen).toBe(false);
      expect(editorElement.refs.mentionMenu.open).toBe(false);
      expect(editorElement.dismissedMentionTrigger).toEqual({
        nodeKey: "node-1",
        startOffset: 0,
        endOffset: 1,
        query: "",
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("does not reopen another slash trigger in the same text node during close restore", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lines = [
        {
          id: "line-1",
          actions: {
            dialogue: {
              content: [{ text: "first / second /" }],
            },
          },
        },
      ];

      editorElement.state = {
        mode: "text-editor",
        lines,
        selectedLineId: "line-1",
        mentionTargets: [{ id: "character-1", label: "Alex" }],
        mentionMenu: {
          isOpen: true,
          query: "",
          items: [{ id: "character-1", label: "Alex" }],
          nodeKey: "node-1",
          lineId: "line-1",
          startOffset: 6,
          endOffset: 7,
        },
      };
      editorElement.refs = {
        mentionMenu: {
          items: [{ id: "character-1", label: "Alex" }],
          open: true,
          render: vi.fn(),
        },
      };
      editorElement.isEditorFocused = true;
      editorElement.readEditorSnapshot = vi.fn(() => ({
        lines,
        selectedLineId: "line-1",
        activeFormats: {},
        mentionTrigger: {
          nodeKey: "node-1",
          lineId: "line-1",
          startOffset: 15,
          endOffset: 16,
          query: "",
          source: "lexical",
        },
      }));
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.closeMentionMenu({
        dismissCurrentTrigger: true,
      });
      editorElement.syncFromEditorState({});

      expect(editorElement.state.mentionMenu.isOpen).toBe(false);
      expect(editorElement.refs.mentionMenu.open).toBe(false);
      expect(editorElement.dismissedMentionTriggerScope).toMatchObject({
        nodeKey: "node-1",
        query: "",
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("closes an open slash mention menu immediately when the trigger disappears", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lines = [
        {
          id: "line-1",
          actions: {
            dialogue: {
              content: [{ text: "/" }],
            },
          },
        },
      ];

      editorElement.state = {
        mode: "text-editor",
        lines,
        selectedLineId: "line-1",
        mentionTargets: [],
        mentionMenu: {
          isOpen: true,
          query: "",
          items: [{ id: "character-1", label: "Alex" }],
        },
      };
      editorElement.refs = {
        mentionMenu: {
          open: false,
        },
      };
      editorElement.isEditorFocused = true;
      editorElement.readEditorSnapshot = vi.fn(() => ({
        lines,
        selectedLineId: "line-1",
        activeFormats: {},
      }));
      editorElement.shouldPreserveMentionMenuAfterSelectionLoss = vi.fn(
        () => false,
      );
      editorElement.isEditorActiveElement = vi.fn(() => true);
      editorElement.syncMentionMenuPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.syncFromEditorState({});

      expect(editorElement.closeMentionMenu).toHaveBeenCalledTimes(1);
      expect(editorElement.syncMentionMenuPopover).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("keeps a newly opened slash mention menu through a stale no-trigger sync before render", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-slash-mention-pending-render-test",
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let textNodeKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editor.update(
        () => {
          const root = $getRoot();
          const paragraph = $createParagraphNode();
          const text = $createTextNode("/");

          paragraph.append(text);
          root.append(paragraph);
          textNodeKey = text.getKey();
        },
        { discrete: true },
      );

      const lines = [
        {
          id: "line-1",
          actions: {
            dialogue: {
              content: [{ text: "/" }],
            },
          },
        },
      ];

      editorElement.state = {
        mode: "text-editor",
        lines,
        selectedLineId: "line-1",
        mentionTargets: [{ id: "character-1", label: "Alex" }],
        mentionMenu: {
          isOpen: true,
          query: "",
          items: [{ id: "character-1", label: "Alex" }],
          highlightedIndex: 0,
          nodeKey: textNodeKey,
          lineId: "line-1",
          startOffset: 0,
          endOffset: 1,
        },
      };
      editorElement.refs = {
        mentionMenu: {
          open: false,
          items: [],
          render: vi.fn(),
        },
      };
      editorElement.editor = editor;
      editorElement.isEditorFocused = true;
      editorElement.readEditorSnapshot = vi.fn(() => ({
        lines,
        selectedLineId: "line-1",
        activeFormats: {},
      }));
      editorElement.closeMentionMenu = vi.fn();
      editorElement.syncMentionMenuPopover = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchSelectedLineChanged = vi.fn();

      editorElement.syncFromEditorState(editor.getEditorState());

      expect(editorElement.closeMentionMenu).not.toHaveBeenCalled();
      expect(editorElement.syncMentionMenuPopover).toHaveBeenCalledTimes(1);
      expect(editorElement.scheduleRender).toHaveBeenCalledTimes(1);
      expect(editorElement.state.mentionMenu.isOpen).toBe(true);
      expect(editorElement.refs.mentionMenu.open).toBe(false);
    } finally {
      restoreDomGlobals();
    }
  });

  it("keeps the slash mention menu open when blur moves focus to the menu", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const menu = document.createElement("div");

      editorElement.state = {
        mode: "text-editor",
        mentionMenu: {
          isOpen: true,
          items: [{ id: "character-1", label: "Alex" }],
        },
      };
      editorElement.refs = {
        editor: document.createElement("div"),
        mentionMenu: menu,
      };
      editorElement.refs.mentionMenu.open = false;
      editorElement.refs.mentionMenu.items = [];
      editorElement.isEditorFocused = true;
      editorElement.isEditorActiveElement = vi.fn(() => false);
      editorElement.isWithinProgrammaticFocusRestoreWindow = vi.fn(() => false);
      editorElement.shouldRestoreProgrammaticBodyBlur = vi.fn(() => false);
      editorElement.selectionMenuIsOpen = false;
      editorElement.furiganaDialogIsPending = false;
      editorElement.hasActiveMentionTrigger = vi.fn(() => false);
      editorElement.syncMentionMenuPopover = vi.fn();
      editorElement.commitNativeBlur = vi.fn();

      editorElement.handleNativeBlur({
        relatedTarget: menu,
      });

      expect(editorElement.refs.mentionMenu.open).toBe(true);
      expect(editorElement.syncMentionMenuPopover).toHaveBeenCalledTimes(1);
      expect(editorElement.hasActiveMentionTrigger).not.toHaveBeenCalled();
      expect(editorElement.commitNativeBlur).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("keeps native double-click word selection inside non-final line text", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lineElement = document.createElement("p");
      lineElement.textContent = "hello\u200b";

      editorElement.getLineElementFromEvent = vi.fn(() => lineElement);
      editorElement.getLineIdFromLineElement = vi.fn(() => "line-1");
      editorElement.getEditorLineOrder = vi.fn(() => [
        { lineId: "line-1" },
        { lineId: "line-2" },
      ]);
      editorElement.getLineOffsetFromPointerEvent = vi.fn(() => 2);
      editorElement.focusLine = vi.fn();

      const event = {
        detail: 2,
        preventDefault: vi.fn(),
      };

      const didSuppress =
        editorElement.suppressNativeLineBoundaryDoubleClick(event);

      expect(didSuppress).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(editorElement.focusLine).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("keeps native double-click word selection on the final line", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const lineElement = document.createElement("p");
      lineElement.textContent = "hello\u200b";

      editorElement.getLineElementFromEvent = vi.fn(() => lineElement);
      editorElement.getLineIdFromLineElement = vi.fn(() => "line-1");
      editorElement.getEditorLineOrder = vi.fn(() => [{ lineId: "line-1" }]);
      editorElement.getLineOffsetFromPointerEvent = vi.fn(() => 5);
      editorElement.focusLine = vi.fn();

      const event = {
        detail: 2,
        preventDefault: vi.fn(),
      };

      const didSuppress =
        editorElement.suppressNativeLineBoundaryDoubleClick(event);

      expect(didSuppress).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(editorElement.focusLine).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("keeps multi-line invisible selections intact", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.restoreLineSelection = vi.fn();

      const didNormalize =
        editorElement.normalizeInvisibleLineBoundarySelection({
          collapsed: false,
          toString: () => "\n\n",
        });

      expect(didNormalize).toBe(false);
      expect(editorElement.restoreLineSelection).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("keeps visible native text selections intact", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.restoreLineSelection = vi.fn();

      const didNormalize =
        editorElement.normalizeInvisibleLineBoundarySelection({
          collapsed: false,
          toString: () => "visible text",
        });

      expect(didNormalize).toBe(false);
      expect(editorElement.restoreLineSelection).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("ignores a blur event when the editor is still the active element", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const editorNode = document.createElement("div");

      Object.defineProperty(document, "activeElement", {
        configurable: true,
        get: () => editorNode,
      });

      editorElement.refs = {
        editor: editorNode,
        surface: {
          dataset: {},
        },
      };
      editorElement.state = {
        mode: "text-editor",
      };
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      editorElement.isEditorFocused = true;
      editorElement.isPointerDownInsideEditor = false;
      editorElement.selectionMenuIsOpen = false;
      editorElement.furiganaDialogIsPending = false;
      editorElement.commitNativeBlur = vi.fn();

      editorElement.handleNativeBlur({
        target: editorNode,
        currentTarget: editorNode,
      });

      expect(editorElement.commitNativeBlur).not.toHaveBeenCalled();
      expect(editorElement.isEditorFocused).toBe(true);
      expect(editorElement.state.mode).toBe("text-editor");
    } finally {
      restoreDomGlobals();
    }
  });

  it("restores the programmatic caret after an active-editor blur event", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const editorNode = document.createElement("div");
      const focusTarget = {
        lineId: "line-1",
        cursorPosition: -1,
      };

      Object.defineProperty(document, "activeElement", {
        configurable: true,
        get: () => editorNode,
      });

      editorElement.refs = {
        editor: editorNode,
        surface: {
          dataset: {},
        },
      };
      editorElement.state = {
        mode: "text-editor",
      };
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.isEditorFocused = true;
      editorElement.isPointerDownInsideEditor = false;
      editorElement.selectionMenuIsOpen = false;
      editorElement.furiganaDialogIsPending = false;
      editorElement.lastProgrammaticFocusTarget = focusTarget;
      editorElement.lineKeyById = new Map([["line-1", "line-key-1"]]);
      editorElement.commitNativeBlur = vi.fn();
      editorElement.focusLine = vi.fn();

      editorElement.handleNativeBlur({
        target: editorNode,
        currentTarget: editorNode,
      });

      expect(editorElement.commitNativeBlur).not.toHaveBeenCalled();
      expect(editorElement.state.mode).toBe("text-editor");
      expect(editorElement.focusLine).toHaveBeenCalledWith(focusTarget);
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("does not restore a stale programmatic caret target after active-editor blur", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const editorNode = document.createElement("div");
      const focusTarget = {
        lineId: "missing-line",
        cursorPosition: -1,
      };

      Object.defineProperty(document, "activeElement", {
        configurable: true,
        get: () => editorNode,
      });

      editorElement.refs = {
        editor: editorNode,
        surface: {
          dataset: {},
        },
      };
      editorElement.state = {
        mode: "text-editor",
      };
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.isEditorFocused = true;
      editorElement.isPointerDownInsideEditor = false;
      editorElement.selectionMenuIsOpen = false;
      editorElement.furiganaDialogIsPending = false;
      editorElement.lastProgrammaticFocusTarget = focusTarget;
      editorElement.programmaticFocusRestoreUntil = Number.POSITIVE_INFINITY;
      editorElement.lineKeyById = new Map();
      editorElement.commitNativeBlur = vi.fn();
      editorElement.focusLine = vi.fn();

      editorElement.handleNativeBlur({
        target: editorNode,
        currentTarget: editorNode,
      });

      expect(editorElement.commitNativeBlur).not.toHaveBeenCalled();
      expect(editorElement.focusLine).not.toHaveBeenCalled();
      expect(editorElement.lastProgrammaticFocusTarget).toBeUndefined();
      expect(editorElement.programmaticFocusRestoreUntil).toBe(0);
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("ignores a blur event during programmatic focus restoration", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const editorNode = document.createElement("div");
      const focusTarget = {
        lineId: "line-1",
        cursorPosition: 2,
      };

      editorElement.refs = {
        editor: editorNode,
        surface: {
          dataset: {},
        },
      };
      editorElement.state = {
        mode: "text-editor",
      };
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.isEditorFocused = true;
      editorElement.isPointerDownInsideEditor = false;
      editorElement.selectionMenuIsOpen = false;
      editorElement.furiganaDialogIsPending = false;
      editorElement.programmaticFocusRestoreUntil = Number.POSITIVE_INFINITY;
      editorElement.lastProgrammaticFocusTarget = focusTarget;
      editorElement.lineKeyById = new Map([["line-1", "line-key-1"]]);
      editorElement.commitNativeBlur = vi.fn();
      editorElement.focusLine = vi.fn();

      editorElement.handleNativeBlur({
        target: editorNode,
        currentTarget: editorNode,
      });

      expect(editorElement.commitNativeBlur).not.toHaveBeenCalled();
      expect(editorElement.isEditorFocused).toBe(true);
      expect(editorElement.state.mode).toBe("text-editor");
      expect(editorElement.focusLine).toHaveBeenCalledWith(focusTarget);
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("does not run a stale async selection restore after the selected line prop is cleared", async () => {
    const restoreDomGlobals = installDomGlobals();
    const animationFrame = installAnimationFrameQueue();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const editorNode = document.createElement("div");

      editorElement.refs = {
        editor: editorNode,
        surface: document.createElement("div"),
      };
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }],
      };
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.focusRestoreSequenceId = 0;
      editorElement.isEditorFocused = true;
      editorElement.lastProgrammaticFocusTarget = {
        lineId: "line-1",
        cursorPosition: 2,
      };
      editorElement.programmaticFocusRestoreUntil = Number.POSITIVE_INFINITY;
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.focus = vi.fn();
      editorElement.restoreLineSelection = vi.fn(() => true);
      editorElement.getNativeLineSelectionContext = vi.fn(() => undefined);

      editorElement.restoreLineSelectionAfterLexicalFocus({
        lineId: "line-1",
        cursorPosition: 2,
      });
      editorElement.selectedLineId = undefined;
      animationFrame.callbacks.shift()();

      expect(editorElement.focus).not.toHaveBeenCalled();
      expect(editorElement.restoreLineSelection).not.toHaveBeenCalled();
      expect(editorElement.isEditorFocused).toBe(false);
      expect(editorElement.state.mode).toBe("block");
      expect(editorElement.lastProgrammaticFocusTarget).toBeUndefined();
      expect(editorElement.programmaticFocusRestoreUntil).toBe(0);
    } finally {
      animationFrame.restore();
      restoreDomGlobals();
    }
  });

  it("treats section editor binding fallback strings as no selected line", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.refs = {
        editor: document.createElement("div"),
        surface: document.createElement("div"),
      };
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-1",
        lines: [{ id: "line-1" }],
      };
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.focusRestoreSequenceId = 0;
      editorElement.isEditorFocused = true;
      editorElement.lastProgrammaticFocusTarget = {
        lineId: "line-1",
        cursorPosition: 2,
      };
      editorElement.programmaticFocusRestoreUntil = Number.POSITIVE_INFINITY;
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.scheduleRender = vi.fn();

      editorElement.selectedLineId = "sectionEditorItems[0].selectedLineId";

      expect(editorElement.state.selectedLineId).toBeUndefined();
      expect(editorElement.isEditorFocused).toBe(false);
      expect(editorElement.state.mode).toBe("block");
      expect(editorElement.lastProgrammaticFocusTarget).toBeUndefined();
      expect(editorElement.programmaticFocusRestoreUntil).toBe(0);
    } finally {
      restoreDomGlobals();
    }
  });

  it("clears rendered selected styling when section selection becomes inactive", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const editorNode = document.createElement("div");
      const selectedLine = document.createElement("p");
      const leftGutter = document.createElement("div");
      const rightGutter = document.createElement("div");
      const leftRow = document.createElement("div");
      const rightRow = document.createElement("div");

      selectedLine.className = "editor-paragraph";
      selectedLine.dataset.selected = "true";
      leftRow.className = "gutter-row";
      leftRow.dataset.selected = "true";
      rightRow.className = "gutter-row";
      rightRow.dataset.selected = "true";
      editorNode.append(selectedLine);
      leftGutter.append(leftRow);
      rightGutter.append(rightRow);

      editorElement.refs = {
        editor: editorNode,
        surface: document.createElement("div"),
        leftGutter,
        rightGutter,
      };
      editorElement.state = {
        mode: "block",
        selectedLineId: "line-1",
        selectionActive: true,
        lines: [{ id: "line-1" }],
      };
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.focusRestoreSequenceId = 0;
      editorElement.isEditorFocused = true;
      editorElement.lastProgrammaticFocusTarget = {
        lineId: "line-1",
        cursorPosition: 2,
      };
      editorElement.programmaticFocusRestoreUntil = Number.POSITIVE_INFINITY;
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.closeMentionMenu = vi.fn();
      editorElement.scheduleRender = vi.fn();

      editorElement.selectionActive = false;

      expect(editorElement.state.selectionActive).toBe(false);
      expect(editorElement.isEditorFocused).toBe(false);
      expect(selectedLine.dataset.selected).toBe("false");
      expect(leftRow.dataset.selected).toBe("false");
      expect(rightRow.dataset.selected).toBe("false");
      expect(editorElement.scheduleRender).toHaveBeenCalledTimes(1);
    } finally {
      restoreDomGlobals();
    }
  });

  it("restores focus when programmatic text entry drops focus to body", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const editorNode = document.createElement("div");
      const focusTarget = {
        lineId: "line-1",
        cursorPosition: -1,
      };

      editorElement.refs = {
        editor: editorNode,
        surface: {
          dataset: {},
        },
      };
      editorElement.state = {
        mode: "text-editor",
      };
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.isEditorFocused = true;
      editorElement.isPointerDownInsideEditor = false;
      editorElement.selectionMenuIsOpen = false;
      editorElement.furiganaDialogIsPending = false;
      editorElement.programmaticFocusRestoreUntil = 0;
      editorElement.lastProgrammaticFocusTarget = focusTarget;
      editorElement.lineKeyById = new Map([["line-1", "line-key-1"]]);
      editorElement.commitNativeBlur = vi.fn();
      editorElement.focusLine = vi.fn();

      editorElement.handleNativeBlur({
        target: editorNode,
        currentTarget: editorNode,
      });

      expect(editorElement.commitNativeBlur).not.toHaveBeenCalled();
      expect(editorElement.state.mode).toBe("text-editor");
      expect(editorElement.focusLine).toHaveBeenCalledWith(focusTarget);
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

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
      const stopPropagation = vi.fn();
      const stopImmediatePropagation = vi.fn();
      const handleBackspaceDelete = vi.fn(() => true);
      const nativeSelection = {
        lineId: "line-2",
        start: 1,
        end: 1,
      };

      editorElement.hideSelectionPopover = vi.fn();
      editorElement.handleReferenceArrowNavigation = vi.fn(() => false);
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.getNativeLineSelectionContext = vi.fn(
        () => nativeSelection,
      );
      editorElement.handleBackspaceDelete = handleBackspaceDelete;
      editorElement.handleNativeKeyDown({
        key: "Backspace",
        isComposing: false,
        preventDefault,
        stopPropagation,
        stopImmediatePropagation,
      });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(stopPropagation).toHaveBeenCalledTimes(1);
      expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(handleBackspaceDelete).toHaveBeenCalledWith({
        nativeSelection,
        nativeLineRangeSelection: undefined,
      });
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

  it("uses printable keydown text when beforeinput insertText has no data", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      const stopImmediatePropagation = vi.fn();
      const insertPlainText = vi.fn();

      editorElement.hideSelectionPopover = vi.fn();
      editorElement.handleReferenceArrowNavigation = vi.fn(() => false);
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.insertPlainText = insertPlainText;

      editorElement.handleNativeKeyDown({
        key: "a",
        isComposing: false,
        timeStamp: 10,
      });
      editorElement.handleNativeBeforeInput({
        inputType: "insertText",
        data: null,
        isComposing: false,
        defaultPrevented: false,
        timeStamp: 12,
        preventDefault,
        stopPropagation,
        stopImmediatePropagation,
      });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(stopPropagation).toHaveBeenCalledTimes(1);
      expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(insertPlainText).toHaveBeenCalledWith("a");
    } finally {
      restoreDomGlobals();
    }
  });

  it("inserts printable keydown text when beforeinput never arrives", async () => {
    vi.useFakeTimers();
    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editorElement.state = {
        mode: "text-editor",
      };
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.isEditorActiveElement = vi.fn(() => true);
      editorElement.insertPlainText = vi.fn();

      editorElement.updatePendingTextInputFallback({
        key: "k",
        defaultPrevented: false,
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        timeStamp: 10,
      });

      vi.runOnlyPendingTimers();

      expect(editorElement.insertPlainText).toHaveBeenCalledWith("k");
      expect(editorElement.pendingTextInputFallback).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("suppresses delayed insertText beforeinput after printable fallback insertion", async () => {
    vi.useFakeTimers();
    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      const stopImmediatePropagation = vi.fn();

      editorElement.state = {
        mode: "text-editor",
      };
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.isEditorActiveElement = vi.fn(() => true);
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.insertPlainText = vi.fn();

      editorElement.updatePendingTextInputFallback({
        key: "/",
        defaultPrevented: false,
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        timeStamp: 10,
      });

      vi.runOnlyPendingTimers();

      editorElement.handleNativeBeforeInput({
        inputType: "insertText",
        data: "/",
        isComposing: false,
        defaultPrevented: false,
        timeStamp: 12,
        preventDefault,
        stopPropagation,
        stopImmediatePropagation,
      });

      expect(editorElement.insertPlainText).toHaveBeenCalledTimes(1);
      expect(editorElement.insertPlainText).toHaveBeenCalledWith("/");
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(stopPropagation).toHaveBeenCalledTimes(1);
      expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.lastCommittedTextInputFallback).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps different delayed insertText beforeinput after printable fallback insertion", async () => {
    vi.useFakeTimers();
    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const preventDefault = vi.fn();

      editorElement.state = {
        mode: "text-editor",
      };
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.isEditorActiveElement = vi.fn(() => true);
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.insertPlainText = vi.fn();

      editorElement.updatePendingTextInputFallback({
        key: "a",
        defaultPrevented: false,
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        timeStamp: 10,
      });

      vi.runOnlyPendingTimers();

      editorElement.handleNativeBeforeInput({
        inputType: "insertText",
        data: "b",
        isComposing: false,
        defaultPrevented: false,
        timeStamp: 12,
        preventDefault,
      });

      expect(editorElement.insertPlainText).toHaveBeenNthCalledWith(1, "a");
      expect(editorElement.insertPlainText).toHaveBeenNthCalledWith(2, "b");
      expect(preventDefault).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves insertText beforeinput to native handling when no text data is available", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const preventDefault = vi.fn();
      const insertPlainText = vi.fn();

      editorElement.hideSelectionPopover = vi.fn();
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.insertPlainText = insertPlainText;
      editorElement.handleNativeBeforeInput({
        inputType: "insertText",
        data: null,
        isComposing: false,
        defaultPrevented: false,
        timeStamp: 12,
        preventDefault,
      });

      expect(preventDefault).not.toHaveBeenCalled();
      expect(insertPlainText).not.toHaveBeenCalled();
    } finally {
      restoreDomGlobals();
    }
  });

  it("inserts text from the native DOM caret when Lexical selection is missing", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-native-selection-insert-test",
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mode: "text-editor",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();

          line.append($createTextNode("ab"));
          root.append(line);
          lineKey = line.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
          });
          editorElement.lineKeyById.set("line-1", lineKey);
        },
        { discrete: true },
      );

      const lineElement = editor.getElementByKey(lineKey);
      const textNode = lineElement.firstChild.firstChild;
      const range = document.createRange();
      range.setStart(textNode, 1);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      editorElement.insertPlainText("x");

      const result = editor.getEditorState().read(() => {
        return $getRoot().getFirstChild().getTextContent();
      });

      expect(result).toBe("axb");
    } finally {
      restoreDomGlobals();
    }
  });

  it("inserts slash from the beforeinput target range instead of a stale Lexical selection", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-native-selection-mention-trigger-test",
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let firstLineKey;
      let secondLineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: {
          isOpen: false,
        },
        mode: "text-editor",
      };
      editorElement.isEditorFocused = true;
      editorElement.pendingTextInputFallback = undefined;
      editorElement.lastCommittedTextInputFallback = undefined;
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();

      editor.update(
        () => {
          const root = $getRoot();
          const firstLine = $createParagraphNode();
          const secondLine = $createParagraphNode();
          const firstText = $createTextNode("first");
          const secondText = $createTextNode("second");

          firstLine.append(firstText);
          secondLine.append(secondText);
          root.append(firstLine, secondLine);
          firstLineKey = firstLine.getKey();
          secondLineKey = secondLine.getKey();
          editorElement.lineMetaByKey.set(firstLineKey, {
            id: "line-1",
          });
          editorElement.lineMetaByKey.set(secondLineKey, {
            id: "line-2",
          });
          editorElement.lineKeyById.set("line-1", firstLineKey);
          editorElement.lineKeyById.set("line-2", secondLineKey);
          firstText.select(1, 1);
        },
        { discrete: true },
      );

      const secondLineElement = editor.getElementByKey(secondLineKey);
      const secondTextNode = secondLineElement.firstChild.firstChild;
      const range = document.createRange();
      range.setStart(secondTextNode, 0);
      range.collapse(true);

      editorElement.handleNativeBeforeInput({
        inputType: "insertText",
        data: "/",
        isComposing: false,
        defaultPrevented: false,
        getTargetRanges: () => [range],
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      });

      const snapshot = editorElement.readEditorSnapshot();
      expect(snapshot.selectedLineId).toBe("line-2");
      expect(snapshot.mentionTrigger).toMatchObject({
        query: "",
        startOffset: 0,
        endOffset: 1,
        source: "lexical",
        lineId: "line-2",
      });
      expect(snapshot.lines[1].actions.dialogue.content[0].text).toBe(
        "/second",
      );
    } finally {
      restoreDomGlobals();
    }
  });

  it("uses the keydown fallback selection when slash beforeinput has no target range", async () => {
    vi.useFakeTimers();
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-keydown-selection-slash-trigger-test",
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let firstLineKey;
      let secondLineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: {
          isOpen: false,
        },
        mode: "text-editor",
      };
      editorElement.isEditorFocused = true;
      editorElement.pendingTextInputFallback = undefined;
      editorElement.lastCommittedTextInputFallback = undefined;
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.scheduleNativeSelectionLineSyncAfterVerticalNavigation =
        vi.fn();
      editorElement.handleReferenceArrowNavigation = vi.fn(() => false);
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.isEditorActiveElement = vi.fn(() => true);
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();

      editor.update(
        () => {
          const root = $getRoot();
          const firstLine = $createParagraphNode();
          const secondLine = $createParagraphNode();
          const firstText = $createTextNode("first");
          const secondText = $createTextNode("second");

          firstLine.append(firstText);
          secondLine.append(secondText);
          root.append(firstLine, secondLine);
          firstLineKey = firstLine.getKey();
          secondLineKey = secondLine.getKey();
          editorElement.lineMetaByKey.set(firstLineKey, {
            id: "line-1",
          });
          editorElement.lineMetaByKey.set(secondLineKey, {
            id: "line-2",
          });
          editorElement.lineKeyById.set("line-1", firstLineKey);
          editorElement.lineKeyById.set("line-2", secondLineKey);
          firstText.select(1, 1);
        },
        { discrete: true },
      );

      const secondLineElement = editor.getElementByKey(secondLineKey);
      const secondTextNode = secondLineElement.firstChild.firstChild;
      const range = document.createRange();
      range.setStart(secondTextNode, 0);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      editorElement.handleNativeKeyDown({
        key: "/",
        code: "Slash",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        isComposing: false,
        defaultPrevented: false,
        timeStamp: 10,
      });
      editorElement.handleNativeBeforeInput({
        inputType: "insertText",
        data: "/",
        isComposing: false,
        defaultPrevented: false,
        timeStamp: 12,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      });

      const snapshot = editorElement.readEditorSnapshot();
      expect(snapshot.selectedLineId).toBe("line-2");
      expect(snapshot.mentionTrigger).toMatchObject({
        query: "",
        startOffset: 0,
        endOffset: 1,
        source: "lexical",
        lineId: "line-2",
      });
      expect(snapshot.lines[1].actions.dialogue.content[0].text).toBe(
        "/second",
      );
    } finally {
      vi.useRealTimers();
      restoreDomGlobals();
    }
  });

  it("deletes text from the native DOM caret when Lexical selection is missing", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-native-selection-delete-test",
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mode: "text-editor",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.clearSelectedReferenceNodeKey = vi.fn();

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();

          line.append($createTextNode("ab"));
          root.append(line);
          lineKey = line.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
          });
          editorElement.lineKeyById.set("line-1", lineKey);
        },
        { discrete: true },
      );

      const lineElement = editor.getElementByKey(lineKey);
      const textNode = lineElement.firstChild.firstChild;
      const range = document.createRange();
      range.setStart(textNode, 2);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      editorElement.handleNativeBeforeInput({
        inputType: "deleteContentBackward",
        isComposing: false,
        defaultPrevented: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      });

      const result = editor.getEditorState().read(() => {
        return $getRoot().getFirstChild().getTextContent();
      });

      expect(result).toBe("a");
    } finally {
      restoreDomGlobals();
    }
  });

  it("handles Backspace on keydown and ignores the matching beforeinput", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-keydown-backspace-delete-test",
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mode: "text-editor",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.handleReferenceArrowNavigation = vi.fn(() => false);
      editorElement.scheduleRender = vi.fn();
      editorElement.focusLine = vi.fn();
      editorElement.restoreLineSelection = vi.fn();
      editorElement.isEditorActiveElement = vi.fn(() => true);
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();

          line.append($createTextNode("ab"));
          root.append(line);
          lineKey = line.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
          });
          editorElement.lineKeyById.set("line-1", lineKey);
        },
        { discrete: true },
      );

      const lineElement = editor.getElementByKey(lineKey);
      const textNode = lineElement.firstChild.firstChild;
      const range = document.createRange();
      range.setStart(textNode, 2);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      editorElement.handleNativeKeyDown({
        key: "Backspace",
        isComposing: false,
        timeStamp: 10,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      });
      editorElement.handleNativeBeforeInput({
        inputType: "deleteContentBackward",
        isComposing: false,
        defaultPrevented: false,
        timeStamp: 11,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      });

      const result = editor.getEditorState().read(() => {
        return $getRoot().getFirstChild().getTextContent();
      });

      expect(result).toBe("a");
      expect(editorElement.pendingFocusTarget).toEqual({
        lineId: "line-1",
        cursorPosition: 1,
      });
      expect(editorElement.focusLine).not.toHaveBeenCalled();
      expect(editorElement.restoreLineSelection).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: 1,
      });
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("selects a reference chip on Backspace before removing it", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(() => 1);

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const { $createMentionNode, MentionNode } = await import(
        "../../src/primitives/lexicalRichTextShared.js"
      );
      const { getReferenceSelectionInfo } = await import(
        "../../src/primitives/lexicalSceneDocumentReferences.js"
      );
      const editor = createEditor({
        namespace: "lexical-reference-backspace-delete-test",
        nodes: [MentionNode],
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;
      let mentionKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: { isOpen: false },
        mode: "text-editor",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.pendingHandledBackspaceKeyDown = undefined;
      editorElement.pendingTextInputFallback = undefined;
      editorElement.pendingTextInputFallbackTimerId = undefined;
      editorElement.selectedReferenceNodeKey = undefined;
      editorElement.renderFrame = 0;
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.handleReferenceArrowNavigation = vi.fn(() => false);
      editorElement.scheduleRender = vi.fn();
      editorElement.focusLine = vi.fn();
      editorElement.restoreLineSelection = vi.fn();
      editorElement.isEditorActiveElement = vi.fn(() => true);
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();
          const mentionNode = $createMentionNode({
            resourceId: "playerName",
            label: "Player",
          });

          line.append(
            $createTextNode("Hi "),
            mentionNode,
            $createTextNode("!"),
          );
          root.append(line);
          lineKey = line.getKey();
          mentionKey = mentionNode.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
            actions: {
              dialogue: {
                content: [
                  { text: "Hi " },
                  { reference: { resourceId: "playerName" } },
                  { text: "!" },
                ],
              },
            },
          });
          editorElement.lineKeyById.set("line-1", lineKey);
        },
        { discrete: true },
      );

      const lineElement = editor.getElementByKey(lineKey);
      const afterReferenceTextNode = lineElement.childNodes[2];
      const range = document.createRange();
      range.setStart(afterReferenceTextNode, 0);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      editorElement.handleNativeKeyDown({
        key: "Backspace",
        code: "Backspace",
        isComposing: false,
        timeStamp: 10,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      });

      const selectedResult = editor.getEditorState().read(() => {
        const referenceSelection = getReferenceSelectionInfo($getSelection());
        return {
          text: $getRoot().getFirstChild().getTextContent(),
          selectedReferenceKey: referenceSelection?.node.getKey(),
          isWhole: referenceSelection?.isWhole,
          isCollapsed: referenceSelection?.isCollapsed,
        };
      });

      expect(selectedResult).toEqual({
        text: "Hi Player!",
        selectedReferenceKey: mentionKey,
        isWhole: true,
        isCollapsed: false,
      });
      expect(editorElement.selectedReferenceNodeKey).toBe(mentionKey);

      editorElement.handleNativeKeyDown({
        key: "Backspace",
        code: "Backspace",
        isComposing: false,
        timeStamp: 20,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      });

      const deletedResult = editor.getEditorState().read(() => {
        return $getRoot().getFirstChild().getTextContent();
      });

      expect(deletedResult).toBe("Hi !");
      expect(
        editorElement.getLinesSnapshot()[0].actions.dialogue.content,
      ).toEqual([{ text: "Hi !" }]);
      expect(editorElement.selectedReferenceNodeKey).toBeUndefined();
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("does not leave native text selected when selecting a reference chip", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const { $createMentionNode, MentionNode } = await import(
        "../../src/primitives/lexicalRichTextShared.js"
      );
      const editor = createEditor({
        namespace: "lexical-reference-native-selection-collapse-test",
        nodes: [MentionNode],
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let mentionKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: { isOpen: false },
        mode: "text-editor",
      };

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();
          const mentionNode = $createMentionNode({
            resourceId: "playerName",
            label: "Player",
          });

          line.append(
            $createTextNode("Hi "),
            mentionNode,
            $createTextNode("!"),
          );
          root.append(line);
          mentionKey = mentionNode.getKey();
        },
        { discrete: true },
      );

      const mentionElement = rootElement.querySelector(".mention-chip");
      const parentNode = mentionElement.parentNode;
      const selection = window.getSelection();
      const staleRange = document.createRange();
      staleRange.selectNodeContents(parentNode);
      selection.removeAllRanges();
      selection.addRange(staleRange);

      editorElement.selectReferenceByNodeKey(mentionKey);

      const mentionOffset = Array.from(parentNode.childNodes).indexOf(
        mentionElement,
      );
      expect(rootElement.dataset.rvnReferenceSelectionActive).toBe("true");
      expect(mentionElement.dataset.rvnReferenceSelected).toBe("true");
      expect(selection.isCollapsed).toBe(true);
      expect(selection.anchorNode).toBe(parentNode);
      expect(selection.anchorOffset).toBe(mentionOffset + 1);
      expect(selection.toString()).toBe("");
    } finally {
      restoreDomGlobals();
    }
  });

  it("normalizes a collapsed reference-chip selection before Backspace deletes", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(() => 1);

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const { $createMentionNode, MentionNode } = await import(
        "../../src/primitives/lexicalRichTextShared.js"
      );
      const { EDITOR_CARET_TEXT } = await import(
        "../../src/internal/ui/sceneEditorLexical/contentModel.js"
      );
      const { getReferenceSelectionInfo } = await import(
        "../../src/primitives/lexicalSceneDocumentReferences.js"
      );
      const editor = createEditor({
        namespace: "lexical-reference-backspace-collapsed-selection-test",
        nodes: [MentionNode],
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;
      let mentionKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: { isOpen: false },
        mode: "text-editor",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.selectedReferenceNodeKey = undefined;
      editorElement.renderFrame = 0;
      editorElement.scheduleRender = vi.fn();
      editorElement.focusLine = vi.fn();

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();
          const mentionNode = $createMentionNode({
            resourceId: "playerName",
            label: "Player",
          });

          line.append(
            $createTextNode("Hi "),
            mentionNode,
            $createTextNode("!"),
          );
          root.append(line);
          lineKey = line.getKey();
          mentionKey = mentionNode.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
            actions: {
              dialogue: {
                content: [
                  { text: "Hi " },
                  { reference: { resourceId: "playerName" } },
                  { text: "!" },
                ],
              },
            },
          });
          editorElement.lineKeyById.set("line-1", lineKey);
          mentionNode.select(2, 2);
        },
        { discrete: true },
      );

      const didSelect = editorElement.handleBackspaceDelete({
        nativeSelection: {
          lineId: "line-1",
          start: 5,
          end: 5,
        },
        source: "keydown",
      });

      const selectedResult = editor.getEditorState().read(() => {
        const referenceSelection = getReferenceSelectionInfo($getSelection());
        return {
          text: $getRoot()
            .getFirstChild()
            .getTextContent()
            .replaceAll(EDITOR_CARET_TEXT, ""),
          selectedReferenceKey: referenceSelection?.node.getKey(),
          isWhole: referenceSelection?.isWhole,
          isCollapsed: referenceSelection?.isCollapsed,
        };
      });

      expect(didSelect).toBe(true);
      expect(selectedResult).toEqual({
        text: "Hi Player!",
        selectedReferenceKey: mentionKey,
        isWhole: true,
        isCollapsed: false,
      });
      expect(editorElement.selectedReferenceNodeKey).toBe(mentionKey);

      const didDelete = editorElement.handleBackspaceDelete({
        nativeSelection: {
          lineId: "line-1",
          start: 5,
          end: 5,
        },
        source: "keydown",
      });

      expect(didDelete).toBe(true);
      expect(
        editorElement.getLinesSnapshot()[0].actions.dialogue.content,
      ).toEqual([{ text: "Hi !" }]);
      expect(editorElement.selectedReferenceNodeKey).toBeUndefined();
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("selects a reference chip when a native Backspace range intersects it", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(() => 1);

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const { $createMentionNode, MentionNode } = await import(
        "../../src/primitives/lexicalRichTextShared.js"
      );
      const { getReferenceSelectionInfo } = await import(
        "../../src/primitives/lexicalSceneDocumentReferences.js"
      );
      const editor = createEditor({
        namespace: "lexical-reference-backspace-native-range-test",
        nodes: [MentionNode],
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;
      let mentionKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: { isOpen: false },
        mode: "text-editor",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.selectedReferenceNodeKey = undefined;
      editorElement.renderFrame = 0;
      editorElement.scheduleRender = vi.fn();
      editorElement.focusLine = vi.fn();

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();
          const mentionNode = $createMentionNode({
            resourceId: "playerName",
            label: "Player",
          });

          line.append(
            $createTextNode("Hi "),
            mentionNode,
            $createTextNode("!"),
          );
          root.append(line);
          lineKey = line.getKey();
          mentionKey = mentionNode.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
            actions: {
              dialogue: {
                content: [
                  { text: "Hi " },
                  { reference: { resourceId: "playerName" } },
                  { text: "!" },
                ],
              },
            },
          });
          editorElement.lineKeyById.set("line-1", lineKey);
        },
        { discrete: true },
      );

      const didHandle = editorElement.handleBackspaceDelete({
        nativeSelection: {
          lineId: "line-1",
          start: 3,
          end: 4,
        },
        source: "keydown",
      });

      const selectedResult = editor.getEditorState().read(() => {
        const referenceSelection = getReferenceSelectionInfo($getSelection());
        return {
          text: $getRoot().getFirstChild().getTextContent(),
          selectedReferenceKey: referenceSelection?.node.getKey(),
          isWhole: referenceSelection?.isWhole,
          isCollapsed: referenceSelection?.isCollapsed,
        };
      });

      expect(didHandle).toBe(true);
      expect(selectedResult).toEqual({
        text: "Hi Player!",
        selectedReferenceKey: mentionKey,
        isWhole: true,
        isCollapsed: false,
      });
      expect(
        editorElement.getLinesSnapshot()[0].actions.dialogue.content,
      ).toEqual([
        { text: "Hi " },
        { reference: { resourceId: "playerName" } },
        { text: "!" },
      ]);
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("selects a final reference chip when native Backspace offset includes the hidden boundary", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(() => 1);

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const { $createMentionNode, MentionNode } = await import(
        "../../src/primitives/lexicalRichTextShared.js"
      );
      const { EDITOR_CARET_TEXT } = await import(
        "../../src/internal/ui/sceneEditorLexical/contentModel.js"
      );
      const { getReferenceSelectionInfo } = await import(
        "../../src/primitives/lexicalSceneDocumentReferences.js"
      );
      const editor = createEditor({
        namespace: "lexical-reference-backspace-hidden-boundary-test",
        nodes: [MentionNode],
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;
      let mentionKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: { isOpen: false },
        mode: "text-editor",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.selectedReferenceNodeKey = undefined;
      editorElement.renderFrame = 0;
      editorElement.scheduleRender = vi.fn();
      editorElement.focusLine = vi.fn();

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();
          const mentionNode = $createMentionNode({
            resourceId: "ageVariable",
            label: "age2",
          });

          line.append(
            $createTextNode("2  "),
            mentionNode,
            $createTextNode(EDITOR_CARET_TEXT),
          );
          root.append(line);
          lineKey = line.getKey();
          mentionKey = mentionNode.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
            actions: {
              dialogue: {
                content: [
                  { text: "2  " },
                  { reference: { resourceId: "ageVariable" } },
                ],
              },
            },
          });
          editorElement.lineKeyById.set("line-1", lineKey);
          line.selectStart();
        },
        { discrete: true },
      );

      const didHandle = editorElement.handleBackspaceDelete({
        nativeSelection: {
          lineId: "line-1",
          start: 8,
          end: 8,
        },
        source: "keydown",
      });

      const selectedResult = editor.getEditorState().read(() => {
        const referenceSelection = getReferenceSelectionInfo($getSelection());
        return {
          text: $getRoot()
            .getFirstChild()
            .getTextContent()
            .replaceAll(EDITOR_CARET_TEXT, ""),
          selectedReferenceKey: referenceSelection?.node.getKey(),
          isWhole: referenceSelection?.isWhole,
          isCollapsed: referenceSelection?.isCollapsed,
        };
      });

      expect(didHandle).toBe(true);
      expect(selectedResult).toEqual({
        text: "2  age2",
        selectedReferenceKey: mentionKey,
        isWhole: true,
        isCollapsed: false,
      });
      expect(
        editorElement.getLinesSnapshot()[0].actions.dialogue.content,
      ).toEqual([
        { text: "2  " },
        { reference: { resourceId: "ageVariable" } },
      ]);
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("finds a final reference chip from native arrow selection offsets", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const { $createMentionNode, MentionNode } = await import(
        "../../src/primitives/lexicalRichTextShared.js"
      );
      const editor = createEditor({
        namespace: "lexical-reference-native-arrow-fallback-test",
        nodes: [MentionNode],
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;
      let mentionKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: { isOpen: false },
        mode: "text-editor",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();
          const mentionNode = $createMentionNode({
            resourceId: "ageVariable",
            label: "age2",
          });

          line.append(
            $createTextNode("2  "),
            mentionNode,
            $createTextNode(EDITOR_CARET_TEXT),
          );
          root.append(line);
          lineKey = line.getKey();
          mentionKey = mentionNode.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
            actions: {
              dialogue: {
                content: [
                  { text: "2  " },
                  { reference: { resourceId: "ageVariable" } },
                ],
              },
            },
          });
          editorElement.lineKeyById.set("line-1", lineKey);
        },
        { discrete: true },
      );

      const result = editor.getEditorState().read(() => {
        const backwardFallbackInfo =
          editorElement.getNativeReferenceArrowFallbackInfo(
            {
              lineId: "line-1",
              start: 7,
              end: 7,
            },
            -1,
          );
        const forwardFallbackInfo =
          editorElement.getNativeReferenceArrowFallbackInfo(
            {
              lineId: "line-1",
              start: 7,
              end: 7,
            },
            1,
          );
        return {
          backward: {
            nodeKey: backwardFallbackInfo?.node.getKey(),
            offset: backwardFallbackInfo?.offset,
            itemStart: backwardFallbackInfo?.itemStart,
            itemEnd: backwardFallbackInfo?.itemEnd,
            lineLength: backwardFallbackInfo?.lineLength,
            shouldMoveAcross: backwardFallbackInfo?.shouldMoveAcross,
          },
          forward: {
            nodeKey: forwardFallbackInfo?.node.getKey(),
            offset: forwardFallbackInfo?.offset,
            itemStart: forwardFallbackInfo?.itemStart,
            itemEnd: forwardFallbackInfo?.itemEnd,
            lineLength: forwardFallbackInfo?.lineLength,
            shouldMoveAcross: forwardFallbackInfo?.shouldMoveAcross,
          },
        };
      });

      expect(result.backward).toEqual({
        nodeKey: mentionKey,
        offset: 7,
        itemStart: 3,
        itemEnd: 7,
        lineLength: 7,
        shouldMoveAcross: true,
      });
      expect(result.forward).toEqual({
        nodeKey: undefined,
        offset: undefined,
        itemStart: undefined,
        itemEnd: undefined,
        lineLength: undefined,
        shouldMoveAcross: undefined,
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("does not recatch ArrowRight after a final reference chip has already been crossed", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const { $createMentionNode, MentionNode } = await import(
        "../../src/primitives/lexicalRichTextShared.js"
      );
      const editor = createEditor({
        namespace: "lexical-reference-final-arrow-right-end-fallback-test",
        nodes: [MentionNode],
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: { isOpen: false },
        mode: "text-editor",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.selectedReferenceNodeKey = undefined;
      editorElement.updateReferenceSelectionMarkers = vi.fn();
      editorElement.getNativeLineSelectionContext = vi.fn(() => ({
        lineId: "line-1",
        start: 7,
        end: 7,
      }));

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();
          const mentionNode = $createMentionNode({
            resourceId: "ageVariable",
            label: "age2",
          });

          line.append(
            $createTextNode("2  "),
            mentionNode,
            $createTextNode(EDITOR_CARET_TEXT),
          );
          root.append(line);
          lineKey = line.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
            actions: {
              dialogue: {
                content: [
                  { text: "2  " },
                  { reference: { resourceId: "ageVariable" } },
                ],
              },
            },
          });
          editorElement.lineKeyById.set("line-1", lineKey);
          $setSelection(null);
        },
        { discrete: true },
      );

      const event = {
        key: "ArrowRight",
        code: "ArrowRight",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      const didHandle = editorElement.handleReferenceArrowNavigation(event);
      const selection = editor.getEditorState().read(() => {
        const currentSelection = $getSelection();
        return {
          type: currentSelection?.getType?.(),
        };
      });

      expect(didHandle).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
      expect(editorElement.selectedReferenceNodeKey).toBeUndefined();
      expect(selection).toEqual({
        type: undefined,
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("moves right across a final reference chip in one keypress", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const { $createMentionNode, MentionNode } = await import(
        "../../src/primitives/lexicalRichTextShared.js"
      );
      const editor = createEditor({
        namespace: "lexical-reference-final-arrow-right-test",
        nodes: [MentionNode],
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: { isOpen: false },
        mode: "text-editor",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.selectedReferenceNodeKey = undefined;
      editorElement.updateReferenceSelectionMarkers = vi.fn();
      editorElement.getNativeLineSelectionContext = vi.fn(() => ({
        lineId: "line-1",
        start: 3,
        end: 3,
      }));

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();
          const mentionNode = $createMentionNode({
            resourceId: "ageVariable",
            label: "age2",
          });

          line.append(
            $createTextNode("2  "),
            mentionNode,
            $createTextNode(EDITOR_CARET_TEXT),
          );
          root.append(line);
          lineKey = line.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
            actions: {
              dialogue: {
                content: [
                  { text: "2  " },
                  { reference: { resourceId: "ageVariable" } },
                ],
              },
            },
          });
          editorElement.lineKeyById.set("line-1", lineKey);
          line.select(1, 1);
        },
        { discrete: true },
      );

      const event = {
        key: "ArrowRight",
        code: "ArrowRight",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      const didHandle = editorElement.handleReferenceArrowNavigation(event);
      const selection = editor.getEditorState().read(() => {
        const currentSelection = $getSelection();
        return {
          anchorKey: currentSelection?.anchor?.key,
          anchorOffset: currentSelection?.anchor?.offset,
          anchorType: currentSelection?.anchor?.type,
        };
      });

      expect(didHandle).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.selectedReferenceNodeKey).toBeUndefined();
      expect(selection).toEqual({
        anchorKey: lineKey,
        anchorOffset: 3,
        anchorType: "element",
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("moves right out of a final reference when native selection is inside the chip", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const { $createMentionNode, MentionNode } = await import(
        "../../src/primitives/lexicalRichTextShared.js"
      );
      const editor = createEditor({
        namespace: "lexical-reference-final-arrow-right-dom-fallback-test",
        nodes: [MentionNode],
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: { isOpen: false },
        mode: "text-editor",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.selectedReferenceNodeKey = undefined;
      editorElement.updateReferenceSelectionMarkers = vi.fn();

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();
          const mentionNode = $createMentionNode({
            resourceId: "ageVariable",
            label: "age2",
          });

          line.append(
            $createTextNode("2  "),
            mentionNode,
            $createTextNode(EDITOR_CARET_TEXT),
          );
          root.append(line);
          lineKey = line.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
            actions: {
              dialogue: {
                content: [
                  { text: "2  " },
                  { reference: { resourceId: "ageVariable" } },
                ],
              },
            },
          });
          editorElement.lineKeyById.set("line-1", lineKey);
          $setSelection(null);
        },
        { discrete: true },
      );

      const mentionElement = rootElement.querySelector(".mention-chip");
      const range = document.createRange();
      range.setStart(
        mentionElement.firstChild,
        mentionElement.firstChild.textContent.length,
      );
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      const event = {
        key: "ArrowRight",
        code: "ArrowRight",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      const didHandle = editorElement.handleReferenceArrowNavigation(event);
      const selection = editor.getEditorState().read(() => {
        const currentSelection = $getSelection();
        return {
          anchorKey: currentSelection?.anchor?.key,
          anchorOffset: currentSelection?.anchor?.offset,
          anchorType: currentSelection?.anchor?.type,
        };
      });

      expect(didHandle).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(editorElement.selectedReferenceNodeKey).toBeUndefined();
      expect(selection).toEqual({
        anchorKey: lineKey,
        anchorOffset: 3,
        anchorType: "element",
      });
    } finally {
      restoreDomGlobals();
    }
  });

  it("uses native arrow fallback when Lexical selection is missing", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const { $createMentionNode, MentionNode } = await import(
        "../../src/primitives/lexicalRichTextShared.js"
      );
      const editor = createEditor({
        namespace: "lexical-reference-native-arrow-no-selection-test",
        nodes: [MentionNode],
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: { isOpen: false },
        mode: "text-editor",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.selectedReferenceNodeKey = undefined;
      editorElement.updateReferenceSelectionMarkers = vi.fn();
      editorElement.getNativeLineSelectionContext = vi.fn(() => ({
        lineId: "line-1",
        start: 7,
        end: 7,
      }));

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();
          const mentionNode = $createMentionNode({
            resourceId: "ageVariable",
            label: "age2",
          });

          line.append(
            $createTextNode("2  "),
            mentionNode,
            $createTextNode(EDITOR_CARET_TEXT),
          );
          root.append(line);
          lineKey = line.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
            actions: {
              dialogue: {
                content: [
                  { text: "2  " },
                  { reference: { resourceId: "ageVariable" } },
                ],
              },
            },
          });
          editorElement.lineKeyById.set("line-1", lineKey);
        },
        { discrete: true },
      );

      const event = {
        key: "ArrowLeft",
        code: "ArrowLeft",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      const didHandle = editorElement.handleReferenceArrowNavigation(event);
      const selection = editor.getEditorState().read(() => {
        const currentSelection = $getSelection();
        return {
          anchorKey: currentSelection?.anchor?.key,
          anchorOffset: currentSelection?.anchor?.offset,
          anchorType: currentSelection?.anchor?.type,
        };
      });

      expect(didHandle).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(selection).toEqual({
        anchorKey: lineKey,
        anchorOffset: 1,
        anchorType: "element",
      });
    } finally {
      restoreDomGlobals();
    }
  });
  it("deletes selected text from the native DOM range when Lexical selection is missing", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-native-range-delete-test",
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.clearSelectedReferenceNodeKey = vi.fn();

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();

          line.append($createTextNode("abcd"));
          root.append(line);
          lineKey = line.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
          });
          editorElement.lineKeyById.set("line-1", lineKey);
        },
        { discrete: true },
      );

      const lineElement = editor.getElementByKey(lineKey);
      const textNode = lineElement.firstChild.firstChild;
      const range = document.createRange();
      range.setStart(textNode, 1);
      range.setEnd(textNode, 3);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      editorElement.handleNativeBeforeInput({
        inputType: "deleteContentBackward",
        isComposing: false,
        defaultPrevented: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      });

      const result = editor.getEditorState().read(() => {
        return $getRoot().getFirstChild().getTextContent();
      });

      expect(result).toBe("ad");
    } finally {
      restoreDomGlobals();
    }
  });

  it("deletes a native DOM range spanning multiple lines", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-native-multi-line-range-delete-test",
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let firstLineKey;
      let secondLineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.focusLine = vi.fn();
      editorElement.restoreLineSelection = vi.fn();
      editorElement.isEditorActiveElement = vi.fn(() => true);
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });

      editor.update(
        () => {
          const root = $getRoot();
          const firstLine = $createParagraphNode();
          const secondLine = $createParagraphNode();

          firstLine.append($createTextNode("hello"));
          secondLine.append($createTextNode("world"));
          root.append(firstLine, secondLine);
          firstLineKey = firstLine.getKey();
          secondLineKey = secondLine.getKey();
          editorElement.lineMetaByKey.set(firstLineKey, {
            id: "line-1",
          });
          editorElement.lineMetaByKey.set(secondLineKey, {
            id: "line-2",
          });
          editorElement.lineKeyById.set("line-1", firstLineKey);
          editorElement.lineKeyById.set("line-2", secondLineKey);
        },
        { discrete: true },
      );

      const firstLineElement = editor.getElementByKey(firstLineKey);
      const secondLineElement = editor.getElementByKey(secondLineKey);
      const range = document.createRange();
      range.setStart(firstLineElement.firstChild.firstChild, 2);
      range.setEnd(secondLineElement.firstChild.firstChild, 3);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      editorElement.handleNativeBeforeInput({
        inputType: "deleteContentBackward",
        isComposing: false,
        defaultPrevented: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      });

      const result = editor.getEditorState().read(() => {
        const lines = $getRoot().getChildren();
        return {
          count: lines.length,
          text: lines.map((line) => line.getTextContent()),
        };
      });

      expect(result).toEqual({
        count: 1,
        text: ["held"],
      });
      expect(editorElement.pendingFocusTarget).toEqual({
        lineId: "line-1",
        cursorPosition: 2,
        skipPageRestore: true,
      });
      expect(editorElement.focusLine).not.toHaveBeenCalled();
      expect(editorElement.restoreLineSelection).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: 2,
      });
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("merges the current line into the previous line from native Backspace at line start", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-native-line-start-merge-test",
        theme: {
          paragraph: "editor-paragraph",
        },
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
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-2",
        lines: [],
        mentionTargets: [],
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.hideSelectionPopover = vi.fn();
      editorElement.clearSelectedReferenceNodeKey = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.focusLine = vi.fn();

      editor.update(
        () => {
          const root = $getRoot();
          const previousLine = $createParagraphNode();
          const currentLine = $createParagraphNode();

          previousLine.append($createTextNode("ab"));
          currentLine.append($createTextNode("cd"));
          root.append(previousLine, currentLine);
          editorElement.lineMetaByKey.set(previousLine.getKey(), {
            id: "line-1",
          });
          currentLineKey = currentLine.getKey();
          editorElement.lineMetaByKey.set(currentLineKey, {
            id: "line-2",
          });
          editorElement.lineKeyById.set("line-1", previousLine.getKey());
          editorElement.lineKeyById.set("line-2", currentLineKey);
        },
        { discrete: true },
      );

      const lineElement = editor.getElementByKey(currentLineKey);
      const textNode = lineElement.firstChild.firstChild;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      editorElement.handleNativeBeforeInput({
        inputType: "deleteContentBackward",
        isComposing: false,
        defaultPrevented: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      });

      const result = editor.getEditorState().read(() => {
        const lines = $getRoot().getChildren();
        return {
          count: lines.length,
          text: lines.map((line) => line.getTextContent()),
        };
      });

      expect(result).toEqual({
        count: 1,
        text: ["abcd"],
      });
      expect(editorElement.pendingFocusTarget).toEqual({
        lineId: "line-1",
        cursorPosition: 2,
        skipPageRestore: true,
      });
      expect(editorElement.focusLine).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: 2,
      });
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("splits the current line from the native DOM caret when Lexical selection is missing", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(() => 1);

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-native-selection-split-test",
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.scrollLineIntoView = vi.fn();
      editorElement.focusLine = vi.fn();
      editorElement.scheduleRender = vi.fn();

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();

          line.append($createTextNode("ab"));
          root.append(line);
          lineKey = line.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
            actions: {
              dialogue: {
                content: [{ text: "ab" }],
              },
            },
          });
          editorElement.lineKeyById.set("line-1", lineKey);
        },
        { discrete: true },
      );

      const lineElement = editor.getElementByKey(lineKey);
      const textNode = lineElement.firstChild.firstChild;
      const range = document.createRange();
      range.setStart(textNode, 1);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      editorElement.splitCurrentLine();

      const lines = editorElement.getLinesSnapshot();
      const result = lines.map((line) => {
        return line.actions.dialogue.content;
      });

      expect(result).toEqual([[{ text: "a" }], [{ text: "b" }]]);
      expect(editorElement.state.selectedLineId).toBe(lines[1].id);
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("replaces a native DOM range spanning multiple lines with a paragraph split", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-native-multi-line-range-enter-test",
        theme: {
          paragraph: "editor-paragraph",
        },
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let firstLineKey;
      let secondLineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.scheduleRender = vi.fn();
      editorElement.focusLine = vi.fn();

      editor.update(
        () => {
          const root = $getRoot();
          const firstLine = $createParagraphNode();
          const secondLine = $createParagraphNode();

          firstLine.append($createTextNode("hello"));
          secondLine.append($createTextNode("world"));
          root.append(firstLine, secondLine);
          firstLineKey = firstLine.getKey();
          secondLineKey = secondLine.getKey();
          editorElement.lineMetaByKey.set(firstLineKey, {
            id: "line-1",
          });
          editorElement.lineMetaByKey.set(secondLineKey, {
            id: "line-2",
          });
          editorElement.lineKeyById.set("line-1", firstLineKey);
          editorElement.lineKeyById.set("line-2", secondLineKey);
        },
        { discrete: true },
      );

      const firstLineElement = editor.getElementByKey(firstLineKey);
      const secondLineElement = editor.getElementByKey(secondLineKey);
      const range = document.createRange();
      range.setStart(firstLineElement.firstChild.firstChild, 2);
      range.setEnd(secondLineElement.firstChild.firstChild, 3);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      editorElement.splitCurrentLine();

      const lines = editorElement.getLinesSnapshot();

      expect(lines).toHaveLength(2);
      expect(lines[0].id).toBe("line-1");
      expect(lines[0].actions.dialogue.content).toEqual([{ text: "he" }]);
      expect(lines[1].id).not.toBe("line-2");
      expect(lines[1].actions.dialogue.content).toEqual([{ text: "ld" }]);
      expect(editorElement.state.selectedLineId).toBe(lines[1].id);
      expect(editorElement.focusLine).toHaveBeenCalledWith({
        lineId: lines[1].id,
        cursorPosition: 0,
      });
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
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

  it("merges a non-empty line when Backspace resolves to line start", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

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
      editorElement.state = {
        selectedLineId: "line-2",
        lines: [],
        mentionTargets: [],
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.scheduleRender = vi.fn();
      editorElement.focusLine = vi.fn();

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
          editorElement.lineKeyById.set("line-1", previousLine.getKey());
          editorElement.lineKeyById.set("line-2", currentLineKey);
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

      expect(didMerge).toBe(true);
      expect(result).toEqual({
        count: 1,
        text: ["previouscurrent"],
      });
      expect(editorElement.focusLine).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: 8,
      });
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("does not refocus the editor when active Backspace merges a line", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-active-line-merge-focus-test",
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
      editorElement.refs = {
        editor: rootElement,
      };
      editorElement.state = {
        mode: "text-editor",
        selectedLineId: "line-2",
        lines: [],
        mentionTargets: [],
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.scheduleRender = vi.fn();
      editorElement.focusLine = vi.fn();
      editorElement.restoreLineSelection = vi.fn(
        LexicalSceneDocumentEditorElement.prototype.restoreLineSelection.bind(
          editorElement,
        ),
      );
      editorElement.isEditorActiveElement = vi.fn(() => true);
      Object.defineProperty(editorElement, "dataset", {
        configurable: true,
        value: {},
      });

      editor.update(
        () => {
          const root = $getRoot();
          const previousLine = $createParagraphNode();
          const currentLine = $createParagraphNode();

          previousLine.append($createTextNode("previous"));
          currentLine.append($createTextNode("current"));
          root.append(previousLine, currentLine);
          editorElement.lineMetaByKey.set(previousLine.getKey(), {
            id: "line-1",
          });
          currentLineKey = currentLine.getKey();
          editorElement.lineMetaByKey.set(currentLineKey, {
            id: "line-2",
          });
          editorElement.lineKeyById.set("line-1", previousLine.getKey());
          editorElement.lineKeyById.set("line-2", currentLineKey);
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

      expect(didMerge).toBe(true);
      expect(result).toEqual({
        count: 1,
        text: ["previouscurrent"],
      });
      expect(editorElement.focusLine).not.toHaveBeenCalled();
      expect(editorElement.restoreLineSelection).toHaveBeenCalledWith({
        lineId: "line-1",
        cursorPosition: 8,
      });
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("merges a whitespace line when Backspace resolves to line start", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

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
      editorElement.state = {
        selectedLineId: "line-2",
        lines: [],
        mentionTargets: [],
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.scheduleRender = vi.fn();
      editorElement.focusLine = vi.fn();

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
          editorElement.lineKeyById.set("line-1", previousLine.getKey());
          editorElement.lineKeyById.set("line-2", currentLineKey);
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

      expect(didMerge).toBe(true);
      expect(result).toEqual({
        count: 1,
        text: ["previous "],
      });
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("does not copy control actions when splitting a line", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(() => 1);

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = createEditor({
        namespace: "lexical-line-split-control-copy-test",
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      let lineKey;

      document.body.append(rootElement);
      editor.setRootElement(rootElement);
      editorElement.editor = editor;
      editorElement.state = {
        selectedLineId: "line-1",
        lines: [],
        mentionTargets: [],
        mentionMenu: {
          isOpen: false,
        },
      };
      editorElement.refs = {
        editor: rootElement,
        mentionMenu: {
          items: [],
          open: false,
          render: vi.fn(),
        },
      };
      editorElement.isEditorFocused = true;
      editorElement.isApplyingExternalLines = false;
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.scrollLineIntoView = vi.fn();
      editorElement.focusLine = vi.fn();
      editorElement.scheduleRender = vi.fn();
      editorElement.dispatchEvent = vi.fn();

      editor.update(
        () => {
          const root = $getRoot();
          const line = $createParagraphNode();

          line.append($createTextNode("Hello world"));
          root.append(line);
          lineKey = line.getKey();
          editorElement.lineMetaByKey.set(lineKey, {
            id: "line-1",
            sectionId: "section-1",
            actions: {
              dialogue: {
                content: [{ text: "Hello world" }],
              },
              control: {
                resourceId: "control-1",
                resourceType: "control",
              },
            },
          });
          editorElement.lineKeyById.set("line-1", lineKey);
        },
        { discrete: true },
      );

      editorElement.getLineSelectionContext = vi.fn(() => ({
        lineKey,
        lineId: "line-1",
        selection: {
          start: 5,
          end: 5,
        },
        lineContent: [{ text: "Hello world" }],
      }));

      editorElement.splitCurrentLine();

      const lines = editorElement.getLinesSnapshot();

      expect(lines).toHaveLength(2);
      expect(lines[0].actions.control).toEqual({
        resourceId: "control-1",
        resourceType: "control",
      });
      expect(lines[1].actions.control).toBeUndefined();
      expect(lines[1].actions.dialogue.content).toEqual([{ text: " world" }]);
      expect(editorElement.state.selectedLineId).toBe(lines[1].id);

      editorElement.syncFromEditorState(editor.getEditorState());

      const sceneLinesChangedEvent =
        editorElement.dispatchEvent.mock.calls.find(
          ([event]) => event.type === "scene-lines-changed",
        )?.[0];
      expect(sceneLinesChangedEvent?.detail.focusTarget).toEqual({
        lineId: lines[1].id,
        cursorPosition: 0,
      });
      expect(editorElement.pendingFocusTarget).toBeUndefined();
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });

  it("refreshes persisted reference chip labels when mention targets load after lines", async () => {
    const restoreDomGlobals = installDomGlobals();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const { MentionNode } = await import(
        "../../src/primitives/lexicalRichTextShared.js"
      );
      const editor = createEditor({
        namespace: "reference-label-refresh-test",
        nodes: [MentionNode],
        onError: (error) => {
          throw error;
        },
      });
      const rootElement = document.createElement("div");
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );

      editor.setRootElement(rootElement);
      Object.defineProperty(editorElement, "isConnected", {
        configurable: true,
        value: true,
      });
      editorElement.editor = editor;
      editorElement.refs = { editor: rootElement };
      editorElement.state = {
        lines: [],
        mentionTargets: [],
        selectedLineId: "line-1",
        mode: "block",
        mentionMenu: { isOpen: false },
        activeFormats: {},
        plainText: "",
      };
      editorElement.lineMetaByKey = new Map();
      editorElement.lineKeyById = new Map();
      editorElement.isComposing = false;
      editorElement.scheduleRender = vi.fn();

      editorElement.loadLines(
        [
          {
            id: "line-1",
            actions: {
              dialogue: {
                content: [
                  {
                    reference: {
                      resourceId: "playerName",
                    },
                  },
                ],
              },
            },
          },
        ],
        { emitChange: false },
      );

      const textBeforeTargets = editor
        .getEditorState()
        .read(() => $getRoot().getTextContent())
        .replaceAll(EDITOR_CARET_TEXT, "");

      editorElement.mentionTargets = [
        { id: "playerName", label: "Player Name", variableType: "string" },
      ];

      const textAfterTargets = editor
        .getEditorState()
        .read(() => $getRoot().getTextContent())
        .replaceAll(EDITOR_CARET_TEXT, "");

      expect(textBeforeTargets).toBe("playerName");
      expect(textAfterTargets).toBe("Player Name");
      expect(
        editorElement.getLinesSnapshot()[0].actions.dialogue.content,
      ).toEqual([
        {
          reference: {
            resourceId: "playerName",
          },
        },
      ]);
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
      restoreDomGlobals();
    }
  });
});
