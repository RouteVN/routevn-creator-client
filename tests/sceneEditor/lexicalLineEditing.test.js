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
      editorElement.debugInputEvent = vi.fn();
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
      expect(calls).toEqual(["focus", "restore", "restore"]);
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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

  it("focuses before restoring selection in focusLine recovery", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorElement = Object.create(
        LexicalSceneDocumentEditorElement.prototype,
      );
      const calls = [];

      editorElement.debugInputEvent = vi.fn();
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
      expect(calls).toEqual(["focus", "restore"]);
      expect(editorElement.markProgrammaticFocusRestore).toHaveBeenCalledTimes(
        2,
      );
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
      editorElement.commitNativeBlur = vi.fn();

      editorElement.handleNativeBlur({
        target: editorNode,
        currentTarget: editorNode,
      });

      expect(editorElement.commitNativeBlur).not.toHaveBeenCalled();
      expect(editorElement.isEditorFocused).toBe(true);
      expect(editorElement.state.mode).toBe("text-editor");
      expect(editorElement.debugInputEvent).toHaveBeenCalledWith(
        "editor-blur-ignored-active-editor",
        expect.any(Object),
      );
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
      expect(editorElement.debugInputEvent).toHaveBeenCalledWith(
        "editor-blur-ignored-programmatic-focus",
        expect.any(Object),
        expect.objectContaining({
          focusTarget,
        }),
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
      editorElement.debugInputEvent = vi.fn();
      editorElement.commitNativeBlur = vi.fn();
      editorElement.focusLine = vi.fn();

      editorElement.handleNativeBlur({
        target: editorNode,
        currentTarget: editorNode,
      });

      expect(editorElement.commitNativeBlur).not.toHaveBeenCalled();
      expect(editorElement.state.mode).toBe("text-editor");
      expect(editorElement.focusLine).toHaveBeenCalledWith(focusTarget);
      expect(editorElement.debugInputEvent).toHaveBeenCalledWith(
        "editor-blur-ignored-programmatic-body",
        expect.any(Object),
        expect.objectContaining({
          focusTarget,
        }),
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
        source: "keydown",
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();

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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
      editorElement.debugInputEvent = vi.fn();
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
});
