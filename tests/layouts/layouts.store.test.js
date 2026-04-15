import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setItems,
} from "../../src/pages/layouts/layouts.store.js";

describe("layouts.store", () => {
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
