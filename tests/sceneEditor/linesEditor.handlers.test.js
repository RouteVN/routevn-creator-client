import { afterEach, describe, expect, it, vi } from "vitest";
import { handleLineBlur } from "../../src/components/linesEditor/linesEditor.handlers.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalShadowRoot = globalThis.ShadowRoot;
const originalWindow = globalThis.window;

const createLine = (id, text) => ({
  id,
  actions: {
    dialogue: {
      content: [{ text }],
    },
  },
});

describe("linesEditor.handlers blur handling", () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.ShadowRoot = originalShadowRoot;
    globalThis.window = originalWindow;
  });

  it("clears content-sync suppression when focus moves to another line during navigation", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });
    globalThis.ShadowRoot = class {};
    globalThis.window = {
      getSelection: vi.fn(() => ({
        rangeCount: 0,
      })),
    };

    const nextLineElement = {
      dataset: {
        lineId: "line-2",
      },
    };
    const root = {
      activeElement: nextLineElement,
    };
    const blurredElement = {
      dataset: {
        lineId: "line-1",
      },
      __rvnIgnoreInputUntilFocus: true,
      __rvnIgnoreContentSyncUntilBlur: true,
      getContent: vi.fn(() => "kept text"),
      getRootNode: vi.fn(() => root),
      updateContent: vi.fn(),
    };
    const deps = {
      store: {
        selectIsNavigating: vi.fn(() => true),
      },
      render: vi.fn(),
      refs: {
        container: {},
        blurred: blurredElement,
      },
      dispatchEvent: vi.fn(),
      props: {
        lines: [createLine("line-1", "kept text")],
      },
    };

    handleLineBlur(deps, {
      _event: {
        currentTarget: blurredElement,
      },
    });

    expect(blurredElement.__rvnIgnoreInputUntilFocus).toBe(false);
    expect(blurredElement.__rvnIgnoreContentSyncUntilBlur).toBe(false);
  });
});
