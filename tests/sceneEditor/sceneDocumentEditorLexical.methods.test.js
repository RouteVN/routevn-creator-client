import { describe, expect, it, vi } from "vitest";
import {
  blurEditor,
  focusLine,
} from "../../src/components/sceneDocumentEditorLexical/sceneDocumentEditorLexical.methods.js";

const createHostElement = (editor) => {
  return {
    isConnected: true,
    shadowRoot: {
      querySelector: vi.fn((selector) => {
        return selector === "#editor" ? editor : undefined;
      }),
    },
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

describe("sceneDocumentEditorLexical methods", () => {
  it("focuses a mounted line immediately", () => {
    const payload = {
      lineId: "line-1",
      cursorPosition: 0,
    };
    const editor = {
      hasLine: vi.fn(() => true),
      focusLine: vi.fn(() => true),
    };
    const hostElement = createHostElement(editor);

    const didFocus = focusLine.call(hostElement, payload);

    expect(didFocus).toBe(true);
    expect(editor.hasLine).toHaveBeenCalledWith("line-1");
    expect(editor.focusLine).toHaveBeenCalledWith(payload);
  });

  it("waits for a freshly rendered line before forwarding focus", () => {
    const animationFrame = installAnimationFrameQueue();
    try {
      const payload = {
        lineId: "line-2",
        cursorPosition: 0,
      };
      let isLineMounted = false;
      const editor = {
        hasLine: vi.fn(() => isLineMounted),
        focusLine: vi.fn(() => true),
      };
      const hostElement = createHostElement(editor);

      const didFocus = focusLine.call(hostElement, payload);

      expect(didFocus).toBe(false);
      expect(editor.focusLine).not.toHaveBeenCalled();
      expect(animationFrame.callbacks).toHaveLength(1);

      isLineMounted = true;
      animationFrame.callbacks.shift()();

      expect(editor.focusLine).toHaveBeenCalledWith(payload);
    } finally {
      animationFrame.restore();
    }
  });

  it("does not forward focus after the host disconnects during retry", () => {
    const animationFrame = installAnimationFrameQueue();
    try {
      const payload = {
        lineId: "line-3",
        cursorPosition: 0,
      };
      const editor = {
        hasLine: vi.fn(() => false),
        focusLine: vi.fn(() => true),
      };
      const hostElement = createHostElement(editor);

      focusLine.call(hostElement, payload);
      hostElement.isConnected = false;
      animationFrame.callbacks.shift()();

      expect(editor.focusLine).not.toHaveBeenCalled();
    } finally {
      animationFrame.restore();
    }
  });

  it("forwards blur requests to the mounted primitive editor", () => {
    const payload = {
      lineId: "line-1",
    };
    const editor = {
      blurEditor: vi.fn(),
    };
    const hostElement = createHostElement(editor);

    blurEditor.call(hostElement, payload);

    expect(editor.blurEditor).toHaveBeenCalledWith(payload);
  });
});
