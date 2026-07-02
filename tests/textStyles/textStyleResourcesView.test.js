import { describe, expect, it, vi } from "vitest";
import {
  handleContextMenuClickItem,
  handleItemContextMenu,
  handleItemDoubleClick,
} from "../../src/components/textStyleResourcesView/textStyleResourcesView.handlers.js";
import {
  createInitialState,
  selectViewData,
  showContextMenu,
  setProgressiveRenderedItemCount,
} from "../../src/components/textStyleResourcesView/textStyleResourcesView.store.js";

describe("textStyleResourcesView", () => {
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
              name === "data-item-id" ? "text-style-1" : undefined,
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
              name === "data-item-id" ? "text-style-1" : undefined,
            ),
          },
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-dblclick",
        detail: {
          itemId: "text-style-1",
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
          currentTarget: {
            getAttribute: vi.fn((name) =>
              name === "data-item-id" ? "text-style-1" : undefined,
            ),
          },
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
          itemId: "text-style-1",
          source: "mobile-context-menu",
        },
      }),
    );
    expect(showContextMenu).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("uses provided item context menu items for text style cards", () => {
    const state = createInitialState();
    const props = {
      itemContextMenuItems: [
        { label: "Duplicate", type: "item", value: "duplicate-item" },
        { label: "Delete", type: "item", value: "delete-item" },
      ],
    };

    showContextMenu({ state, props }, { itemId: "text-style-1", x: 10, y: 20 });

    expect(state.dropdownMenu.items).toEqual(props.itemContextMenuItems);
  });

  it("dispatches item-duplicate from the card context menu", () => {
    const dispatchEvent = vi.fn();
    const hideContextMenu = vi.fn();
    const render = vi.fn();

    handleContextMenuClickItem(
      {
        store: {
          selectDropdownMenu: () => ({
            targetItemId: "text-style-1",
          }),
          hideContextMenu,
        },
        dispatchEvent,
        render,
      },
      {
        _event: {
          detail: {
            item: {
              value: "duplicate-item",
            },
          },
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe("item-duplicate");
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      itemId: "text-style-1",
    });
    expect(hideContextMenu).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
  });

  it("uses a two-column mobile default with a six-column maximum", () => {
    const props = {
      mobileLayout: true,
      showZoomControls: true,
      zoomControlMode: "columns",
      groups: [
        {
          id: "folder-1",
          children: [{ id: "text-style-1" }],
        },
      ],
    };
    const state = createInitialState({ props });
    const viewData = selectViewData({ state, props });

    expect(viewData.showZoomControls).toBe(true);
    expect(viewData.itemsPerRow).toBe(2);
    expect(viewData.cardGridColumns).toBe("2");
    expect(viewData.zoomControlMax).toBe(6);
    expect(viewData.groups[0].children[0]).toEqual(
      expect.objectContaining({
        itemContainerStyle: "width: 100%; box-sizing: border-box;",
        itemWidth: "f",
      }),
    );
  });

  it("clamps saved mobile text style columns to six", () => {
    const props = {
      mobileLayout: true,
      showZoomControls: true,
      zoomControlMode: "columns",
      defaultItemsPerRow: 12,
    };
    const state = createInitialState({ props });
    const viewData = selectViewData({ state, props });

    expect(state.itemsPerRow).toBe(6);
    expect(viewData.itemsPerRow).toBe(6);
    expect(viewData.cardGridColumns).toBe("6");
    expect(viewData.zoomControlMax).toBe(6);
  });

  it("reserves text style placeholders before progressive hydration", () => {
    const state = createInitialState();
    const props = {
      progressiveRender: true,
      groups: [
        {
          id: "folder-1",
          hasChildren: true,
          children: [{ id: "text-style-1" }, { id: "text-style-2" }],
        },
      ],
    };

    setProgressiveRenderedItemCount({ state }, { itemCount: 0 });
    const viewData = selectViewData({ state, props });

    expect(viewData.groups[0].children).toEqual([
      expect.objectContaining({
        isPlaceholder: true,
        domItemId: "",
        cursor: "default",
      }),
      expect.objectContaining({ isPlaceholder: true }),
    ]);
    expect(viewData.groups[0].hasChildren).toBe(true);
  });
});
