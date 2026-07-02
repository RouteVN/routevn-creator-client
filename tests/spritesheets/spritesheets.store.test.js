import { describe, expect, it } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  createInitialState,
  openPreviewDialog,
  selectViewData,
  setItems,
} from "../../src/pages/spritesheets/spritesheets.store.js";

describe("spritesheets store", () => {
  it("marks media groups that contain child folders", () => {
    const state = createInitialState();

    setItems(
      { state },
      {
        data: {
          tree: [
            {
              id: "parent-folder",
              children: [{ id: "child-folder" }],
            },
          ],
          items: {
            "parent-folder": {
              id: "parent-folder",
              type: "folder",
              name: "Parent",
            },
            "child-folder": {
              id: "child-folder",
              type: "folder",
              name: "Child",
            },
          },
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.mediaGroups[0]).toEqual(
      expect.objectContaining({
        id: "parent-folder",
        hasChildren: false,
        hasChildFolders: true,
      }),
    );
  });

  it("pauses the detail preview while the preview dialog is open", () => {
    const state = createInitialState();

    expect(selectViewData({ state, i18n: EN_I18N }).detailPreviewPaused).toBe(
      false,
    );

    openPreviewDialog({ state });

    expect(selectViewData({ state, i18n: EN_I18N }).detailPreviewPaused).toBe(
      true,
    );
  });
});
