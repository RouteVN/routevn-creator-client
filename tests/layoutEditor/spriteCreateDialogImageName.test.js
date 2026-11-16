import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setImageId,
  setImages,
} from "../../src/components/layoutEditorSpriteCreateDialog/layoutEditorSpriteCreateDialog.store.js";

describe("layout editor create image dialog", () => {
  it("names the selected image under its preview", () => {
    const state = createInitialState();
    const constants = { spriteCreateForm: { fields: [] } };
    expect(selectViewData({ state, constants }).imageName).toBe("");

    setImages(
      { state },
      {
        images: {
          items: { "image-1": { id: "image-1", type: "image", name: "Sky" } },
          tree: [{ id: "image-1" }],
        },
      },
    );
    setImageId({ state }, { imageId: "image-1" });

    expect(selectViewData({ state, constants }).imageName).toBe("Sky");
  });
});
