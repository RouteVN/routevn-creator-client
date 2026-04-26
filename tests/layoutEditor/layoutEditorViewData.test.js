import { describe, expect, it } from "vitest";
import {
  toLayoutEditorContextMenuItems,
  toLayoutEditorExplorerItems,
} from "../../src/pages/layoutEditor/support/layoutEditorViewData.js";

describe("layoutEditorViewData", () => {
  it("builds container create actions with absolute direction", () => {
    const [containerItem] = toLayoutEditorContextMenuItems([
      {
        label: "Container",
        type: "item",
        createType: "container",
      },
    ]);

    expect(containerItem.value).toMatchObject({
      action: "new-child-item",
      type: "container",
      direction: "absolute",
    });
  });

  it("keeps grouped edit actions for leaf items without an empty add section", () => {
    const contextMenuItems = toLayoutEditorContextMenuItems([
      {
        label: "Add Element",
        type: "label",
      },
      {
        label: "Container",
        type: "item",
        createType: "container",
      },
      {
        label: "Sprite",
        type: "item",
        createType: "sprite",
      },
      {
        type: "separator",
      },
      {
        label: "Edit",
        type: "label",
      },
      {
        label: "Rename",
        type: "item",
        value: "rename-item",
      },
      {
        label: "Delete",
        type: "item",
        value: "delete-item",
      },
    ]);

    const [leafItem] = toLayoutEditorExplorerItems(
      [
        {
          id: "text-1",
          type: "text",
          name: "Label",
        },
      ],
      {
        contextMenuItems,
      },
    );

    expect(leafItem.contextMenuItems).toEqual([
      {
        label: "Edit",
        type: "label",
      },
      {
        label: "Rename",
        type: "item",
        value: "rename-item",
      },
      {
        label: "Delete",
        type: "item",
        value: "delete-item",
      },
    ]);
  });

  it("uses the spritesheets icon for spritesheet animation elements", () => {
    const [item] = toLayoutEditorExplorerItems([
      {
        id: "spritesheet-animation-1",
        type: "spritesheet-animation",
        name: "Idle",
      },
    ]);

    expect(item.svg).toBe("spritesheets");
  });
});
