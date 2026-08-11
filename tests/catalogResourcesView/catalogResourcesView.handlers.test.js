import { describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleImportActionsMenuButtonClick,
  handleImportActionsMenuClose,
  handleImportActionsMenuItemClick,
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
  it("opens the import actions menu and dispatches its import action", () => {
    const dispatchEvent = vi.fn();
    const render = vi.fn();
    const store = {
      closeImportActionsMenu: vi.fn(),
      openImportActionsMenu: vi.fn(),
      selectImportActionsMenu: vi.fn(() => ({ x: 24, y: 48 })),
    };
    const deps = { dispatchEvent, render, store };
    const stopPropagation = vi.fn();

    handleImportActionsMenuButtonClick(deps, {
      _event: {
        currentTarget: {
          getBoundingClientRect: () => ({ right: 24, bottom: 48 }),
        },
        stopPropagation,
      },
    });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(store.openImportActionsMenu).toHaveBeenCalledWith({
      x: 24,
      y: 48,
    });

    handleImportActionsMenuItemClick(deps, {
      _event: { detail: { item: { value: "import" } } },
    });
    expect(store.closeImportActionsMenu).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "import-click",
        detail: { x: 24, y: 48 },
      }),
    );

    handleImportActionsMenuClose(deps);
    expect(store.closeImportActionsMenu).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(3);
  });

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
