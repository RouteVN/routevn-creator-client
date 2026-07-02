import { describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleItemContextMenu,
  handleItemDoubleClick,
} from "../../src/components/charactersResourcesView/charactersResourcesView.handlers.js";

const createItemEvent = (itemId) => ({
  currentTarget: {
    getAttribute: vi.fn((name) =>
      name === "data-item-id" ? itemId : undefined,
    ),
  },
});

describe("charactersResourcesView.handlers", () => {
  it("ignores mobile item double clicks", () => {
    const dispatchEvent = vi.fn();

    handleItemDoubleClick(
      {
        props: {
          mobileLayout: true,
        },
        dispatchEvent,
      },
      {
        _event: createItemEvent("character-1"),
      },
    );

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("keeps desktop item double clicks", () => {
    const dispatchEvent = vi.fn();

    handleItemDoubleClick(
      {
        props: {
          mobileLayout: false,
        },
        dispatchEvent,
      },
      {
        _event: createItemEvent("character-1"),
      },
    );

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-dblclick",
        detail: {
          itemId: "character-1",
        },
      }),
    );
  });

  it("runs the double-click action instead of opening the context menu for mobile contextmenu gestures", () => {
    const dispatchEvent = vi.fn();
    const showContextMenu = vi.fn();
    const render = vi.fn();
    const preventDefault = vi.fn();

    handleItemContextMenu(
      {
        props: {
          mobileLayout: true,
        },
        dispatchEvent,
        store: {
          showContextMenu,
        },
        render,
      },
      {
        _event: {
          ...createItemEvent("character-1"),
          preventDefault,
          clientX: 10,
          clientY: 20,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-dblclick",
        detail: {
          itemId: "character-1",
          source: "mobile-context-menu",
        },
      }),
    );
    expect(showContextMenu).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("progressively renders character cards after the first batch", () => {
    const frameCallbacks = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    let renderedItemCount = 0;
    let renderSignature = "";
    let frameId;
    const render = vi.fn();

    try {
      handleBeforeMount({
        props: {
          progressiveRender: true,
          progressiveInitialItemCount: 2,
          progressiveHydrationDelayFrameCount: 3,
          groups: [
            {
              id: "folder-1",
              children: [
                { id: "character-1" },
                { id: "character-2" },
                { id: "character-3" },
              ],
            },
          ],
        },
        store: {
          selectProgressiveFrameId: () => frameId,
          setProgressiveFrameId: ({ frameId: nextFrameId }) => {
            frameId = nextFrameId;
          },
          clearProgressiveFrameId: () => {
            frameId = undefined;
          },
          selectProgressiveRenderedItemCount: () => renderedItemCount,
          setProgressiveRenderedItemCount: ({ itemCount }) => {
            renderedItemCount = itemCount;
          },
          selectProgressiveRenderSignature: () => renderSignature,
          setProgressiveRenderSignature: ({ signature }) => {
            renderSignature = signature;
          },
        },
        render,
      });

      expect(renderedItemCount).toBe(2);
      expect(render).not.toHaveBeenCalled();

      frameCallbacks.shift()();
      expect(renderedItemCount).toBe(2);
      expect(render).not.toHaveBeenCalled();

      frameCallbacks.shift()();
      expect(renderedItemCount).toBe(2);
      expect(render).not.toHaveBeenCalled();

      frameCallbacks.shift()();

      expect(renderedItemCount).toBe(3);
      expect(render).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
