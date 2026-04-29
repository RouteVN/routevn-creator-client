import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setItems,
  setSelectedItemId,
} from "../../src/pages/animations/animations.store.js";

describe("animations.store", () => {
  it("exposes the selected animation thumbnail for the detail panel", () => {
    const state = createInitialState();
    setItems(
      { state },
      {
        data: {
          items: {
            "fade-in": {
              id: "fade-in",
              type: "animation",
              name: "Fade In",
              thumbnailFileId: "file-preview",
              animation: {
                type: "update",
              },
            },
          },
          tree: [{ id: "fade-in" }],
        },
      },
    );
    setSelectedItemId(
      { state },
      {
        itemId: "fade-in",
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.selectedAnimationPreviewFileId).toBe("file-preview");
  });
});
