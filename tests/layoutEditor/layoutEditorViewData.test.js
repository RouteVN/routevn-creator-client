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
      anchorX: 0,
      anchorY: 0,
    });
  });

  it("builds input create actions with the form field binding", () => {
    const [inputItem] = toLayoutEditorContextMenuItems([
      {
        label: "Input",
        type: "item",
        createType: "input",
      },
    ]);

    expect(inputItem.value).toMatchObject({
      action: "new-child-item",
      type: "input",
      field: "field",
      width: 330,
      height: 52,
    });
  });

  it("builds image create actions with the image default name", () => {
    const [imageItem] = toLayoutEditorContextMenuItems([
      {
        label: "Image",
        type: "item",
        createType: "sprite",
      },
    ]);

    expect(imageItem.value).toMatchObject({
      action: "new-child-item",
      type: "sprite",
      name: "Image",
      anchorX: 0,
      anchorY: 0,
    });
  });

  it("builds rect create actions with top-left anchor coordinates", () => {
    const [rectItem] = toLayoutEditorContextMenuItems([
      {
        label: "Rect",
        type: "item",
        createType: "rect",
      },
    ]);

    expect(rectItem.value).toMatchObject({
      action: "new-child-item",
      type: "rect",
      name: "Rect",
      anchorX: 0,
      anchorY: 0,
    });
  });

  it("builds form submit button create actions as containers with a static form role", () => {
    const [submitItem] = toLayoutEditorContextMenuItems([
      {
        label: "Input Submit Container",
        type: "item",
        createType: "form-submit-button",
      },
    ]);

    expect(submitItem.value).toMatchObject({
      action: "new-child-item",
      type: "container",
      name: "Input Submit Container",
      direction: "absolute",
      gapX: 0,
      gapY: 0,
      formRole: "submit",
    });
    expect(submitItem.value).not.toHaveProperty("width");
    expect(submitItem.value).not.toHaveProperty("height");
  });

  it("builds choice single item container create actions", () => {
    const [choiceSingleItem] = toLayoutEditorContextMenuItems([
      {
        label: "Container (Single Choice Item)",
        type: "item",
        createType: "container-choice-single-item",
      },
    ]);

    expect(choiceSingleItem.value).toMatchObject({
      action: "new-child-item",
      type: "container-ref-choice-single-item",
      direction: "absolute",
      choiceItemIndex: 0,
      click: {
        inheritToChildren: true,
      },
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
        label: "Image",
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

  it("keeps add actions available for folders", () => {
    const contextMenuItems = toLayoutEditorContextMenuItems([
      {
        label: "Add Element",
        type: "label",
      },
      {
        label: "Container (Single Choice Item)",
        type: "item",
        createType: "container-choice-single-item",
      },
      {
        label: "Text (Choice Content)",
        type: "item",
        createType: "text-choice-item-content",
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
    ]);

    const [folderItem] = toLayoutEditorExplorerItems(
      [
        {
          id: "folder-1",
          type: "folder",
          name: "Group",
        },
      ],
      {
        contextMenuItems,
      },
    );

    expect(folderItem.dragOptions.canReceiveChildren).toBe(true);
    expect(folderItem.contextMenuItems).toContainEqual(
      expect.objectContaining({
        label: "Container (Single Choice Item)",
        value: expect.objectContaining({
          action: "new-child-item",
          type: "container-ref-choice-single-item",
        }),
      }),
    );
    expect(folderItem.contextMenuItems).not.toContainEqual(
      expect.objectContaining({
        label: "Text (Choice Content)",
      }),
    );
  });

  it("only allows choice content text inside choice item containers", () => {
    const contextMenuItems = toLayoutEditorContextMenuItems([
      {
        label: "Add Element",
        type: "label",
      },
      {
        label: "Text (Choice Content)",
        type: "item",
        createType: "text-choice-item-content",
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
    ]);

    const [normalContainer, repeatedChoiceItem, singleChoiceItem] =
      toLayoutEditorExplorerItems(
        [
          {
            id: "container-1",
            type: "container",
            name: "Container",
          },
          {
            id: "choice-item-1",
            type: "container-ref-choice-item",
            name: "Repeated",
          },
          {
            id: "choice-single-item-1",
            type: "container-ref-choice-single-item",
            name: "Single",
          },
        ],
        {
          contextMenuItems,
        },
      );

    expect(normalContainer.contextMenuItems).not.toContainEqual(
      expect.objectContaining({
        label: "Text (Choice Content)",
      }),
    );
    expect(repeatedChoiceItem.contextMenuItems).toContainEqual(
      expect.objectContaining({
        label: "Text (Choice Content)",
        value: expect.objectContaining({
          action: "new-child-item",
          type: "text-ref-choice-item-content",
        }),
      }),
    );
    expect(singleChoiceItem.contextMenuItems).toContainEqual(
      expect.objectContaining({
        label: "Text (Choice Content)",
        value: expect.objectContaining({
          action: "new-child-item",
          type: "text-ref-choice-item-content",
        }),
      }),
    );
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
