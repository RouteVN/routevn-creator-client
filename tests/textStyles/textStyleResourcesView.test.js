import { describe, expect, it, vi } from "vitest";
import { handleContextMenuClickItem } from "../../src/components/textStyleResourcesView/textStyleResourcesView.handlers.js";
import {
  createInitialState,
  showContextMenu,
} from "../../src/components/textStyleResourcesView/textStyleResourcesView.store.js";

describe("textStyleResourcesView", () => {
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
});
