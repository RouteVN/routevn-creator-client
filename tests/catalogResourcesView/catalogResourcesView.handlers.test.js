import { describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleContextMenuClickItem,
  handleItemContextMenu,
  handleItemLongPress,
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

  it("runs the primary action on an explicit long press", () => {
    const dispatchEvent = vi.fn();
    const showContextMenu = vi.fn();
    const render = vi.fn();
    const preventDefault = vi.fn();

    handleItemLongPress(
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

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-dblclick",
        detail: {
          itemId: "color-1",
          source: "long-press",
        },
      }),
    );
    expect(showContextMenu).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("selects the item when opening its desktop context menu", () => {
    const dispatchEvent = vi.fn();
    const showContextMenu = vi.fn();
    const render = vi.fn();

    handleItemContextMenu(
      {
        props: {
          mobileLayout: false,
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
          preventDefault: vi.fn(),
          clientX: 10,
          clientY: 20,
        },
      },
    );

    expect(showContextMenu).toHaveBeenCalledWith({
      itemId: "color-1",
      x: 10,
      y: 20,
    });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-click",
        detail: { itemId: "color-1", source: "context-menu" },
      }),
    );
  });

  it("uses the mobile column default instead of restoring desktop column counts", () => {
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
    expect(setItemsPerRow).toHaveBeenCalledWith({ itemsPerRow: 2 });
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

it("forwards custom catalog menu actions with the context-menu target", () => {
  const dispatchEvent = vi.fn();
  const hideContextMenu = vi.fn();
  handleContextMenuClickItem(
    {
      store: {
        selectDropdownMenu: () => ({ targetItemId: "transform-two" }),
        hideContextMenu,
      },
      render: vi.fn(),
      dispatchEvent,
    },
    { _event: { detail: { item: { value: "set-default-dialogue-avatar" } } } },
  );
  expect(dispatchEvent).toHaveBeenCalledOnce();
  expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
    type: "item-action",
    detail: { itemId: "transform-two", action: "set-default-dialogue-avatar" },
  });
  expect(hideContextMenu).toHaveBeenCalled();
});
