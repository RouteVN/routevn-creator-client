import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setAnimationPreviewVisible,
  setItems,
  setSelectedItemId,
} from "../../src/pages/animations/animations.store.js";

describe("animations.store", () => {
  it("exposes the selected animation preview metadata for the detail panel", () => {
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

    expect(viewData).not.toHaveProperty("selectedAnimationPreviewFileId");
    expect(viewData.selectedAnimationPreviewAspectRatio).toBe("1920 / 1080");
    expect(viewData.animationPreviewOpacity).toBe(0);

    setAnimationPreviewVisible(
      { state },
      {
        visible: true,
      },
    );

    expect(selectViewData({ state }).animationPreviewOpacity).toBe(1);
  });
});
