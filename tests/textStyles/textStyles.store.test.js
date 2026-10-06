import { describe, expect, it } from "vitest";
import {
  createInitialState,
  openAddDialog,
  selectViewData,
  setItems,
  setSelectedItemId,
  setTagsData,
} from "../../src/pages/textStyles/textStyles.store.js";
import { EN_I18N } from "../support/i18n.js";

const menuValues = (items) => items.map((item) => item.value);

describe("textStyles.store", () => {
  it("marks groups that contain child folders", () => {
    const state = createInitialState();

    setItems(
      { state },
      {
        textStylesData: {
          items: {
            parentFolder: {
              id: "parentFolder",
              type: "folder",
              name: "Parent",
            },
            childFolder: {
              id: "childFolder",
              type: "folder",
              name: "Child",
            },
          },
          tree: [
            {
              id: "parentFolder",
              children: [{ id: "childFolder" }],
            },
          ],
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const parentGroup = viewData.flatGroups.find(
      (group) => group.id === "parentFolder",
    );
    const childGroup = viewData.flatGroups.find(
      (group) => group.id === "childFolder",
    );

    expect(parentGroup).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: true,
      }),
    );
    expect(childGroup).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: false,
      }),
    );
  });

  it("opens and duplicates text styles from the explorer and center menus", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      i18n: EN_I18N,
    });

    expect(menuValues(viewData.itemContextMenuItems)).toEqual([
      "edit-item",
      "rename-item",
      "duplicate-item",
      "delete-item",
    ]);
    expect(viewData.itemContextMenuItems[0].label).toBe("Open");
    expect(menuValues(viewData.centerItemContextMenuItems)).toEqual([
      "edit-item",
      "duplicate-item",
      "delete-item",
    ]);
    expect(viewData.centerItemContextMenuItems[0].label).toBe("Open");
    expect(viewData.openButton).toBe("Open");
  });

  it("adds and edits only the name, description and tags in dialogs", () => {
    const state = createInitialState();
    setTagsData(
      { state },
      {
        tagsData: {
          items: { "tag-1": { id: "tag-1", type: "tag", name: "Dialogue" } },
          tree: [{ id: "tag-1" }],
        },
      },
    );
    openAddDialog({ state }, { groupId: "_root" });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.isAddDialogOpen).toBe(true);
    expect(state.targetGroupId).toBeUndefined();
    for (const form of [viewData.addForm, viewData.editForm]) {
      expect(form.fields.map((field) => field.name)).toEqual([
        "name",
        "description",
        "tagIds",
      ]);
      expect(form.fields[2].options).toEqual([
        { label: "Dialogue", value: "tag-1" },
      ]);
    }
    expect(viewData.addForm).toMatchObject({
      title: "Add Text Style",
      actions: { buttons: [{ id: "submit", label: "Add Text Style" }] },
    });
    expect(viewData.editForm.title).toBe("Edit Text Style");
    expect(viewData.addFormDefaults).toEqual({
      name: "",
      description: "",
      tagIds: [],
    });
  });

  it("previews the selected text style's preview text, or its name", () => {
    const state = createInitialState();
    setItems(
      { state },
      {
        textStylesData: {
          items: {
            "text-style-1": {
              id: "text-style-1",
              type: "textStyle",
              name: "Text Style One",
              fontId: ["font-1"],
              colorId: "color-1",
              fontSize: 24,
              lineHeight: 1.5,
              fontWeight: "400",
              previewText: "Preview One",
            },
            "text-style-2": {
              id: "text-style-2",
              type: "textStyle",
              name: "Text Style Two",
              fontId: ["font-1"],
              colorId: "color-1",
              fontSize: 24,
              lineHeight: 1.5,
              fontWeight: "400",
            },
          },
          tree: [{ id: "text-style-1" }, { id: "text-style-2" }],
        },
      },
    );

    setSelectedItemId({ state }, { itemId: "text-style-1" });
    expect(selectViewData({ state, i18n: EN_I18N }).detailPreviewText).toBe(
      "Preview One",
    );
    setSelectedItemId({ state }, { itemId: "text-style-2" });
    expect(selectViewData({ state, i18n: EN_I18N }).detailPreviewText).toBe(
      "Text Style Two",
    );
  });
});
