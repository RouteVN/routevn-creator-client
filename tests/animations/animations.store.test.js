import { describe, expect, it } from "vitest";
import {
  createInitialState,
  openImportDestinationStep,
  openImportDialog,
  selectViewData,
  setAnimationPreviewVisible,
  setImagesData,
  setItems,
  setSelectedItemId,
} from "../../src/pages/animations/animations.store.js";
import { EN_I18N } from "../support/i18n.js";

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

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData).not.toHaveProperty("selectedAnimationPreviewFileId");
    expect(viewData.selectedAnimationPreviewAspectRatio).toBe("1920 / 1080");
    expect(viewData.animationPreviewOpacity).toBe(0);

    setAnimationPreviewVisible(
      { state },
      {
        visible: true,
      },
    );

    expect(
      selectViewData({ state, i18n: EN_I18N }).animationPreviewOpacity,
    ).toBe(1);
  });

  it("configures the import form for URL packages", () => {
    const state = createInitialState();
    openImportDialog({ state });

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const form = viewData.importForm;
    const urlField = form.fields.find((field) => field.name === "url");
    const continueButton = form.actions.buttons.find(
      (button) => button.id === "continue",
    );

    expect(urlField).toMatchObject({
      required: {
        message: "Import URL is required.",
      },
    });
    expect(viewData.importDialogDefaultValues).toEqual({
      url: "",
    });
    expect(continueButton).toMatchObject({
      label: "Continue",
      validate: true,
    });
  });

  it("configures destination folder selectors for animation and image dependencies", () => {
    const state = createInitialState();
    setItems(
      { state },
      {
        data: {
          items: {
            "folder-animation": {
              id: "folder-animation",
              type: "folder",
              name: "Animation Folder",
            },
          },
          tree: [{ id: "folder-animation" }],
        },
      },
    );
    setImagesData(
      { state },
      {
        imagesData: {
          items: {
            "folder-image": {
              id: "folder-image",
              type: "folder",
              name: "Image Folder",
            },
          },
          tree: [{ id: "folder-image" }],
        },
      },
    );

    openImportDestinationStep(
      { state },
      {
        importInput: {},
        sourceValues: {
          url: "http://localhost:3001/public/import-transform-sample.json",
        },
        includeImages: true,
      },
    );

    const form = selectViewData({ state, i18n: EN_I18N }).importForm;
    const animationFolderField = form.fields.find(
      (field) => field.name === "animationFolderId",
    );
    const imageFolderField = form.fields.find(
      (field) => field.name === "imageFolderId",
    );

    expect(animationFolderField.options).toEqual([
      { value: "folder-animation", label: "Animation Folder" },
    ]);
    expect(imageFolderField.options).toEqual([
      { value: "folder-image", label: "Image Folder" },
    ]);
  });
});
