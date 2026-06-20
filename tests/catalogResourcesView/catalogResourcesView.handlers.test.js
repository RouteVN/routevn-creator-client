import { describe, expect, it, vi } from "vitest";
import {
  handleItemContextMenu,
  handleItemDoubleClick,
} from "../../src/components/catalogResourcesView/catalogResourcesView.handlers.js";

const createItemEvent = (itemId) => ({
  currentTarget: {
    getAttribute: vi.fn((name) =>
      name === "data-item-id" ? itemId : undefined,
    ),
  },
});

describe("catalogResourcesView.handlers", () => {
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
        _event: createItemEvent("color-1"),
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
        _event: createItemEvent("color-1"),
      },
    );

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-dblclick",
        detail: {
          itemId: "color-1",
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
          ...createItemEvent("color-1"),
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
          itemId: "color-1",
          source: "mobile-context-menu",
        },
      }),
    );
    expect(showContextMenu).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
});
