import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setItems,
} from "../../src/pages/layouts/layouts.store.js";

describe("layouts.store", () => {
  it("uses a select for layout type selection", () => {
    const state = createInitialState();

    const viewData = selectViewData({ state });
    const layoutTypeField = viewData.layoutForm.fields.find(
      (field) => field.name === "layoutType",
    );

    expect(layoutTypeField.type).toBe("select");
  });

  it("uses segmented controls for fragment selection in create and edit forms", () => {
    const state = createInitialState();

    const viewData = selectViewData({ state });
    const createFragmentField = viewData.layoutForm.fields.find(
      (field) => field.name === "isFragment",
    );
    const editFragmentField = viewData.editForm.fields.find(
      (field) => field.name === "isFragment",
    );

    expect(createFragmentField).toMatchObject({
      type: "segmented-control",
      clearable: false,
      options: [
        { value: false, label: "No" },
        { value: true, label: "Yes" },
      ],
    });
    expect(editFragmentField).toMatchObject({
      type: "segmented-control",
      clearable: false,
      options: [
        { value: false, label: "No" },
        { value: true, label: "Yes" },
      ],
    });
    expect(viewData.layoutFormDefaults.isFragment).toBe(false);
    expect(viewData.editDefaultValues.isFragment).toBe(false);
  });

  it("shows fragment layouts with a trailing fragment icon instead of fragment text", () => {
    const state = createInitialState();

    setItems(
      { state },
      {
        data: {
          items: {
            folder1: {
              id: "folder1",
              type: "folder",
              name: "UI",
            },
            layout1: {
              id: "layout1",
              type: "layout",
              name: "Save Screen",
              layoutType: "save-load",
              isFragment: true,
              parentId: "folder1",
            },
          },
          tree: [
            {
              id: "folder1",
              children: [{ id: "layout1" }],
            },
          ],
        },
      },
    );

    const viewData = selectViewData({ state });
    const item = viewData.catalogGroups[0].children[0];

    expect(item.typeInfo).toBe("Save / Load");
    expect(item.typeInfoSvg).toBe("fragment");
  });
});
