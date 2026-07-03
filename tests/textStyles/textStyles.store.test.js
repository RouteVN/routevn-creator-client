import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setItems,
} from "../../src/pages/textStyles/textStyles.store.js";
import { EN_I18N } from "../support/i18n.js";

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

  it("exposes edit actions for text style item surfaces", () => {
    const state = createInitialState();

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.editButton).toBe("Edit");
    expect(viewData.centerItemContextMenuItems[0]).toEqual({
      label: "Edit",
      type: "item",
      value: "edit-item",
    });
  });
});
