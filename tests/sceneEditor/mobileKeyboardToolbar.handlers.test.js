import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import {
  handleToolbarItemLostPointerCapture,
  handleToolbarItemPointerCancel,
  handleToolbarItemPointerDown,
  handleToolbarItemPointerUp,
} from "../../src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.handlers.js";

const installDomGlobals = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const previousGlobals = {
    document: globalThis.document,
    KeyboardEvent: globalThis.KeyboardEvent,
    ShadowRoot: globalThis.ShadowRoot,
    window: globalThis.window,
  };

  globalThis.document = dom.window.document;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.ShadowRoot = dom.window.ShadowRoot;
  globalThis.window = dom.window;

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

const createStore = () => {
  let repeatState = {};
  let pressedActionId;

  return {
    clearPressedActionId: () => {
      pressedActionId = undefined;
    },
    clearArrowRepeatState: () => {
      repeatState = {};
    },
    selectPressedActionId: () => pressedActionId,
    selectArrowRepeatState: () => repeatState,
    setPressedActionId: ({ actionId }) => {
      pressedActionId = actionId;
    },
    setArrowRepeatIntervalId: ({ intervalTimerId }) => {
      repeatState.intervalTimerId = intervalTimerId;
    },
    setArrowRepeatState: (nextState) => {
      repeatState = nextState;
    },
  };
};

describe("mobileKeyboardToolbar.handlers", () => {
  it("dispatches arrow keys to the focused non-editable block surface", () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const surface = document.createElement("div");
      surface.tabIndex = 0;
      document.body.append(surface);
      surface.focus();

      const keydown = vi.fn((event) => event.preventDefault());
      surface.addEventListener("keydown", keydown);

      const currentTarget = document.createElement("div");
      currentTarget.dataset.actionId = "arrow-down";
      currentTarget.setPointerCapture = vi.fn();
      currentTarget.releasePointerCapture = vi.fn();
      const store = createStore();
      const render = vi.fn();
      const pointerEvent = {
        currentTarget,
        pointerId: 12,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };

      handleToolbarItemPointerDown(
        { store, render },
        {
          _event: pointerEvent,
        },
      );

      expect(keydown).toHaveBeenCalledTimes(1);
      expect(keydown.mock.calls[0][0]).toMatchObject({
        key: "ArrowDown",
        code: "ArrowDown",
      });
      expect(store.selectPressedActionId()).toBe("arrow-down");
      expect(render).toHaveBeenCalledTimes(1);

      handleToolbarItemPointerUp(
        { store, render },
        {
          _event: pointerEvent,
        },
      );
      expect(store.selectPressedActionId()).toBeUndefined();
      expect(render).toHaveBeenCalledTimes(2);
    } finally {
      restoreDomGlobals();
    }
  });

  it("shows press feedback for non-arrow toolbar actions", () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const currentTarget = document.createElement("div");
      currentTarget.dataset.actionId = "preview";
      currentTarget.setPointerCapture = vi.fn();
      currentTarget.releasePointerCapture = vi.fn();
      const store = createStore();
      const render = vi.fn();
      const pointerEvent = {
        currentTarget,
        pointerId: 14,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };

      handleToolbarItemPointerDown(
        { store, render },
        {
          _event: pointerEvent,
        },
      );

      expect(currentTarget.setPointerCapture).toHaveBeenCalledWith(14);
      expect(store.selectPressedActionId()).toBe("preview");

      handleToolbarItemPointerUp(
        { store, render },
        {
          _event: pointerEvent,
        },
      );

      expect(currentTarget.releasePointerCapture).toHaveBeenCalledWith(14);
      expect(store.selectPressedActionId()).toBeUndefined();
      expect(render).toHaveBeenCalledTimes(2);
    } finally {
      restoreDomGlobals();
    }
  });

  it("clears press feedback when the pointer is cancelled or capture is lost", () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const currentTarget = document.createElement("div");
      currentTarget.dataset.actionId = "actions";
      currentTarget.releasePointerCapture = vi.fn();
      const store = createStore();
      const render = vi.fn();
      const pointerEvent = {
        currentTarget,
        pointerId: 18,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };

      store.setPressedActionId({ actionId: "actions" });
      handleToolbarItemPointerCancel(
        { store, render },
        { _event: pointerEvent },
      );

      expect(store.selectPressedActionId()).toBeUndefined();

      store.setPressedActionId({ actionId: "actions" });
      handleToolbarItemLostPointerCapture({ store, render });

      expect(store.selectPressedActionId()).toBeUndefined();
      expect(render).toHaveBeenCalledTimes(2);
    } finally {
      restoreDomGlobals();
    }
  });
});
