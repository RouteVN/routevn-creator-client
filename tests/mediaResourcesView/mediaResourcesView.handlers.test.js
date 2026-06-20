import { describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleItemContextMenu,
  handleItemDoubleClick,
  handleZoomOut,
} from "../../src/components/mediaResourcesView/mediaResourcesView.handlers.js";

const createMobileColumnZoomProps = () => ({
  mobileLayout: true,
  showZoomControls: true,
  zoomControlMode: "columns",
  itemsPerRowConfigKey: "groupImagesView.itemsPerRow",
});

describe("mediaResourcesView.handlers", () => {
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
        _event: {
          currentTarget: {
            getAttribute: vi.fn((name) =>
              name === "data-item-id" ? "image-1" : undefined,
            ),
          },
        },
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
        _event: {
          currentTarget: {
            getAttribute: vi.fn((name) =>
              name === "data-item-id" ? "image-1" : undefined,
            ),
          },
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-dblclick",
        detail: {
          itemId: "image-1",
        },
      }),
    );
  });

  it("runs the double-click action instead of opening the context menu for mobile contextmenu gestures", () => {
    const dispatchEvent = vi.fn();
    const preventDefault = vi.fn();
    const showContextMenu = vi.fn();
    const render = vi.fn();

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
          preventDefault,
          currentTarget: {
            getAttribute: vi.fn((name) =>
              name === "data-item-id" ? "image-1" : undefined,
            ),
          },
          clientX: 10,
          clientY: 20,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-dblclick",
        detail: {
          itemId: "image-1",
          source: "mobile-context-menu",
        },
      }),
    );
    expect(showContextMenu).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("keeps the context menu on desktop contextmenu gestures", () => {
    const showContextMenu = vi.fn();
    const render = vi.fn();

    handleItemContextMenu(
      {
        props: {
          mobileLayout: false,
        },
        dispatchEvent: vi.fn(),
        store: {
          showContextMenu,
        },
        render,
      },
      {
        _event: {
          preventDefault: vi.fn(),
          currentTarget: {
            getAttribute: vi.fn((name) =>
              name === "data-item-id" ? "image-1" : undefined,
            ),
          },
          clientX: 10,
          clientY: 20,
        },
      },
    );

    expect(showContextMenu).toHaveBeenCalledWith({
      itemId: "image-1",
      x: 10,
      y: 20,
    });
    expect(render).toHaveBeenCalled();
  });

  it("clamps restored mobile column counts to six", () => {
    const setItemsPerRow = vi.fn();

    handleBeforeMount({
      props: createMobileColumnZoomProps(),
      appService: {
        getUserConfig: vi.fn(() => 12),
      },
      store: {
        setItemsPerRow,
        selectProgressiveFrameId: () => undefined,
        setProgressiveRenderSignature: vi.fn(),
        setProgressiveRenderedItemCount: vi.fn(),
      },
    });

    expect(setItemsPerRow).toHaveBeenCalledWith({ itemsPerRow: 6 });
  });

  it("does not persist mobile column counts above six", () => {
    let itemsPerRow = 6;
    const setUserConfig = vi.fn();
    const render = vi.fn();

    const handled = handleZoomOut({
      props: createMobileColumnZoomProps(),
      appService: {
        setUserConfig,
      },
      store: {
        selectItemsPerRow: () => itemsPerRow,
        setItemsPerRow: ({ itemsPerRow: nextItemsPerRow }) => {
          itemsPerRow = nextItemsPerRow;
        },
      },
      render,
    });

    expect(handled).toBe(true);
    expect(itemsPerRow).toBe(6);
    expect(setUserConfig).toHaveBeenCalledWith(
      "groupImagesView.itemsPerRow",
      6,
    );
    expect(render).toHaveBeenCalled();
  });
});
