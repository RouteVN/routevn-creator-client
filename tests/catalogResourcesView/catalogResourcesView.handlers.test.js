import { describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleItemContextMenu,
  handleItemDoubleClick,
  handleZoomOut,
} from "../../src/components/catalogResourcesView/catalogResourcesView.handlers.js";

const createMobileColumnZoomProps = () => ({
  mobileLayout: true,
  showZoomControls: true,
  zoomControlMode: "columns",
  itemsPerRowConfigKey: "groupControlsView.itemsPerRow",
});

const createItemEvent = (itemId) => ({
  currentTarget: {
    getAttribute: vi.fn((name) =>
      name === "data-item-id" ? itemId : undefined,
    ),
  },
});

const createProgressiveStore = (overrides = {}) => ({
  selectProgressiveFrameId: () => undefined,
  setProgressiveRenderSignature: vi.fn(),
  setProgressiveRenderedItemCount: vi.fn(),
  ...overrides,
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

  it("does not restore desktop column counts for mobile column zoom", () => {
    const getUserConfig = vi.fn((key) =>
      key === "groupControlsView.itemsPerRow" ? 8 : undefined,
    );
    const setItemsPerRow = vi.fn();

    handleBeforeMount({
      props: createMobileColumnZoomProps(),
      appService: {
        getUserConfig,
      },
      store: createProgressiveStore({
        setItemsPerRow,
      }),
    });

    expect(getUserConfig).toHaveBeenCalledWith(
      "groupControlsView.mobileItemsPerRow",
    );
    expect(getUserConfig).not.toHaveBeenCalledWith(
      "groupControlsView.itemsPerRow",
    );
    expect(setItemsPerRow).not.toHaveBeenCalled();
  });

  it("persists mobile column counts separately from desktop", () => {
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
      "groupControlsView.mobileItemsPerRow",
      6,
    );
    expect(render).toHaveBeenCalled();
  });
});
