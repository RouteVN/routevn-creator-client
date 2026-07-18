import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
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
import { handleDialogTextureImageKeyDown } from "../../src/pages/particles/particles.handlers.js";
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
  it("uses the same no-padding image card for texture and preview background", () => {
    const view = readFileSync(
      new URL("../../src/pages/particles/particles.view.yaml", import.meta.url),
      "utf8",
    );
    const previewBackgroundBlock = view.slice(
      view.indexOf("$if dialogPreviewBackgroundImage:"),
      view.indexOf("rtgl-dialog#createTagDialog"),
    );
    const textureCard = `                                      - 'rtgl-view#dialogTextureImageButton role=button tabindex=0 aria-haspopup=dialog aria-label="\${textureImageLabel}" cur=pointer bw=xs bc=\${dialogTextureImage.itemBorderColor} h-bc=\${dialogTextureImage.itemHoverBorderColor} br=md w=160 overflow=hidden style="max-width: 100%; box-sizing: border-box;"':
                                          - 'div.particleImageThumbnailTransparencyGrid style="display: block; width: 100%; aspect-ratio: \${dialogTextureImage.previewAspectRatio}; overflow: hidden;"':
                                              - rvn-file-image w=f h=f fileId=\${dialogTextureImage.previewFileId}: null
                                          - rtgl-view w=f p=md:`;

    expect(view).toContain(textureCard);
    expect(previewBackgroundBlock).toContain(
      "dialogPreviewBackgroundImageButton cur=pointer",
    );
    expect(previewBackgroundBlock).toContain("w=160 overflow=hidden");
    expect(previewBackgroundBlock).toContain(
      'div.particleImageThumbnailTransparencyGrid style="display: block; width: 100%; aspect-ratio: ${dialogPreviewBackgroundImage.previewAspectRatio}; overflow: hidden;"',
    );
    expect(previewBackgroundBlock).toContain("rtgl-view w=f p=md");
    expect(previewBackgroundBlock).not.toContain("rtgl-view p=md g=md br=md");
  });

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
        previewAspectRatio: "16 / 9",
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

  it.each(["Enter", " "])(
    "opens the texture image selector with the %s key",
    (key) => {
      const preventDefault = vi.fn();
      const render = vi.fn();
      const showTextureImageSelectorDialog = vi.fn();

      handleDialogTextureImageKeyDown(
        {
          render,
          store: {
            showTextureImageSelectorDialog,
          },
        },
        {
          _event: {
            key,
            preventDefault,
          },
        },
      );

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(showTextureImageSelectorDialog).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledTimes(1);
    },
  );
});
