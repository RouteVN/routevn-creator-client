import { describe, expect, it } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  closeEditDialog,
  createInitialState,
  openAddDialog,
  openEditDialog,
  selectDuplicateItemName,
  selectItemParentId,
  selectTargetGroupId,
  selectViewData,
  setItems,
  setSelectedItemId,
} from "../../src/pages/transforms/transforms.store.js";

const transformsData = {
  tree: [{ id: "transform-1" }],
  items: {
    "transform-1": {
      id: "transform-1",
      type: "transform",
      name: "Transform One",
      x: 960,
      y: 540,
      scaleX: 1.5,
      scaleY: 1.5,
      anchorX: 0.5,
      anchorY: 1,
      rotation: 30,
    },
  },
};

describe("transforms.store", () => {
  it("names a copy with a number and finds the folder it goes in", () => {
    const state = {
      data: {
        tree: [
          { id: "folder-1", children: [{ id: "transform-1" }] },
          { id: "transform-2" },
        ],
        items: {
          "folder-1": { id: "folder-1", type: "folder", name: "Folder One" },
          "transform-1": {
            id: "transform-1",
            type: "transform",
            name: "Transform One",
          },
          "transform-2": {
            id: "transform-2",
            type: "transform",
            name: "Transform Two",
          },
        },
      },
    };

    expect(selectDuplicateItemName({ state }, { itemId: "transform-1" })).toBe(
      "Transform One 2",
    );
    expect(selectItemParentId({ state }, { itemId: "transform-1" })).toBe(
      "folder-1",
    );
    expect(selectItemParentId({ state }, { itemId: "transform-2" })).toBeNull();
  });

  it("opens transforms from the menus and the mobile detail sheet", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      i18n: EN_I18N,
    });

    expect(viewData.openButton).toBe("Open");
    expect(
      viewData.centerItemContextMenuItems.map((item) => item.value),
    ).toEqual(["edit-item", "duplicate-item", "delete-item"]);
    expect(viewData.centerItemContextMenuItems[0].label).toBe("Open");
    expect(viewData.itemContextMenuItems.map((item) => item.value)).toEqual([
      "edit-item",
      "rename-item",
      "duplicate-item",
      "delete-item",
    ]);
  });

  it("asks only for the name, description, and tags in its dialogs", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      i18n: EN_I18N,
    });

    for (const form of [viewData.addForm, viewData.editForm]) {
      expect(form.fields.map((field) => field.name)).toEqual([
        "name",
        "description",
        "tagIds",
      ]);
    }
    expect(viewData.addForm.title).toBe("Add Transform");
    expect(viewData.addForm.actions.buttons[0].label).toBe("Add Transform");
    expect(viewData.editForm.title).toBe("Edit Transform");
    expect(viewData.editForm.actions.buttons[0].label).toBe("Update");
  });

  it("keeps the add dialog's folder and the edit dialog's values", () => {
    const state = createInitialState();

    openAddDialog({ state }, { groupId: "folder-1" });
    expect(state.isAddDialogOpen).toBe(true);
    expect(selectTargetGroupId({ state })).toBe("folder-1");

    openAddDialog({ state }, { groupId: "_root" });
    expect(selectTargetGroupId({ state })).toBeUndefined();

    openEditDialog(
      { state },
      {
        itemId: "transform-1",
        defaultValues: { name: "One", description: "", tagIds: ["tag-1"] },
      },
    );
    expect(selectViewData({ state, i18n: EN_I18N }).editDefaultValues).toEqual({
      name: "One",
      description: "",
      tagIds: ["tag-1"],
    });

    closeEditDialog({ state });
    expect(state.isEditDialogOpen).toBe(false);
    expect(state.editDefaultValues).toEqual({
      name: "",
      description: "",
      tagIds: [],
    });
  });

  it("shows the saved values, rotation included, in the detail panel", () => {
    const state = createInitialState();
    setItems({ state }, { data: transformsData });
    setSelectedItemId({ state }, { itemId: "transform-1" });

    const fields = selectViewData({ state, i18n: EN_I18N }).detailFields;

    expect(
      fields
        .filter((field) => field.type === "text")
        .map((field) => [field.label, field.value]),
    ).toEqual([
      ["Position X", "960"],
      ["Position Y", "540"],
      ["Scale X", "1.5"],
      ["Scale Y", "1.5"],
      ["Anchor X", "0.5"],
      ["Anchor Y", "1"],
      ["Rotation", "30"],
    ]);
  });
});
