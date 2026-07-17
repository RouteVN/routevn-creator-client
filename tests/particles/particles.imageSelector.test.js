import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectPreviewImageSelectorDialog,
  selectViewData,
  setDialogFormValues,
  setDialogTextureImage,
  setImagesData,
  showTextureImageSelectorDialog,
} from "../../src/pages/particles/particles.store.js";
import {
  createParticleCreateSetupForm,
  createParticleForm,
} from "../../src/pages/particles/support/particleForm.js";
import { EN_I18N } from "../support/i18n.js";

const IMAGE_ID = "image-one";

const createImagesData = () => ({
  items: {
    [IMAGE_ID]: {
      id: IMAGE_ID,
      type: "image",
      name: "Image One",
      fileId: "file-one",
      thumbnailFileId: "thumbnail-one",
      width: 64,
      height: 32,
    },
  },
  tree: [],
});

describe("particle texture image selector", () => {
  it("uses the image selector slot in setup and appearance forms", () => {
    const setupForm = createParticleCreateSetupForm();
    const appearanceForm = createParticleForm({ activeTab: "appearance" });

    expect(setupForm.fields).toContainEqual({
      type: "slot",
      slot: "particle-texture-image",
    });
    expect(appearanceForm.fields).toContainEqual({
      type: "slot",
      slot: "particle-texture-image",
    });
    expect(
      setupForm.fields.find((field) => field.name === "textureImageId"),
    ).toBeUndefined();
    expect(
      appearanceForm.fields.find((field) => field.name === "textureImageId"),
    ).toBeUndefined();
    expect(setupForm.actions.buttons.map((button) => button.id)).toEqual([
      "submit",
    ]);
  });

  it("opens with the current texture selected and builds its image card", () => {
    const state = createInitialState();
    setImagesData({ state }, { imagesData: createImagesData() });
    setDialogFormValues({ state }, { values: { textureImageId: IMAGE_ID } });

    showTextureImageSelectorDialog({ state });

    expect(selectPreviewImageSelectorDialog({ state })).toEqual({
      open: true,
      target: "texture",
      selectedImageId: IMAGE_ID,
    });
    expect(selectViewData({ state, i18n: EN_I18N }).dialogTextureImage).toEqual(
      {
        imageId: IMAGE_ID,
        previewFileId: "thumbnail-one",
        previewAspectRatio: "64 / 32",
        name: "Image One",
        itemBorderColor: "bo",
        itemHoverBorderColor: "ac",
      },
    );
  });

  it("stores a texture selected from the image selector", () => {
    const state = createInitialState();

    setDialogTextureImage({ state }, { imageId: IMAGE_ID });

    expect(state.dialogFormValues.textureImageId).toBe(IMAGE_ID);
  });
});
