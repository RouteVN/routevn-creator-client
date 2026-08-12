import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import {
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

  return {
    clearArrowRepeatState: () => {
      repeatState = {};
    },
    selectArrowRepeatState: () => repeatState,
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
      const pointerEvent = {
        currentTarget,
        pointerId: 12,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };

      handleToolbarItemPointerDown(
        { store },
        {
          _event: pointerEvent,
        },
      );

      expect(keydown).toHaveBeenCalledTimes(1);
      expect(keydown.mock.calls[0][0]).toMatchObject({
        key: "ArrowDown",
        code: "ArrowDown",
      });

      handleToolbarItemPointerUp(
        { store },
        {
          _event: pointerEvent,
        },
      );
    } finally {
      restoreDomGlobals();
    }
  });
});
