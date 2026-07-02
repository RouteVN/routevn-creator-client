import { describe, expect, it } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  applyPreviewImageSelectorSelection,
  closePreviewImageSelectorDialog,
  commitPreviewImageSelectorSelection,
  createInitialState,
  clearPreviewImage,
  closePreviewImageMenu,
  openPreviewImageSelectorDialog,
  openPreviewImageMenu,
  openImportDialog,
  openImportDestinationStep,
  openTransformFormDialog,
  openTransformPreviewDialog,
  selectDialogPreviewData,
  selectPreviewImageMenuTarget,
  selectViewData,
  setImagesData,
  showFullImagePreview,
} from "../../src/pages/transforms/transforms.store.js";

const imagesData = {
  tree: [{ id: "image-bg" }],
  items: {
    "image-bg": {
      id: "image-bg",
      type: "image",
      name: "Background",
      fileId: "file-bg",
      thumbnailFileId: "thumb-bg",
    },
  },
};

describe("transforms.store", () => {
  it("applies preview image selections immediately and restores them on cancel", () => {
    const state = createInitialState();
    setImagesData({ state }, { imagesData });
    openTransformFormDialog({ state });
    openPreviewImageSelectorDialog(
      { state },
      {
        target: "preview-background",
      },
    );

    applyPreviewImageSelectorSelection(
      { state },
      {
        imageId: "image-bg",
      },
    );

    expect(
      selectViewData({ state, i18n: EN_I18N }).previewPanel.items[0],
    ).toMatchObject({
      target: "preview-background",
      image: expect.objectContaining({
        previewFileId: "thumb-bg",
      }),
    });

    closePreviewImageSelectorDialog({ state });

    expect(
      selectViewData({ state, i18n: EN_I18N }).previewPanel.items[0],
    ).toMatchObject({
      target: "preview-background",
      image: undefined,
    });
  });

  it("keeps preview image selections after confirmation", () => {
    const state = createInitialState();
    setImagesData({ state }, { imagesData });
    openTransformFormDialog({ state });
    openPreviewImageSelectorDialog(
      { state },
      {
        target: "preview-background",
      },
    );
    applyPreviewImageSelectorSelection(
      { state },
      {
        imageId: "image-bg",
      },
    );

    commitPreviewImageSelectorSelection({ state });

    expect(
      selectViewData({ state, i18n: EN_I18N }).previewPanel.items[0],
    ).toMatchObject({
      target: "preview-background",
      image: expect.objectContaining({
        previewFileId: "thumb-bg",
      }),
    });
  });

  it("opens a remove menu for selected preview images and clears the slot", () => {
    const state = createInitialState();
    setImagesData({ state }, { imagesData });
    openTransformFormDialog({ state });
    openPreviewImageSelectorDialog(
      { state },
      {
        target: "preview-background",
      },
    );
    applyPreviewImageSelectorSelection(
      { state },
      {
        imageId: "image-bg",
      },
    );
    commitPreviewImageSelectorSelection({ state });

    openPreviewImageMenu(
      { state },
      {
        target: "preview-background",
        x: 120,
        y: 240,
        items: [
          {
            label: EN_I18N.resourcePages.removeMenuItem,
            type: "item",
            value: "remove",
          },
        ],
      },
    );

    expect(selectPreviewImageMenuTarget({ state })).toBe("preview-background");
    expect(
      selectViewData({ state, i18n: EN_I18N }).previewImageMenu,
    ).toMatchObject({
      isOpen: true,
      x: 120,
      y: 240,
      items: [
        {
          label: EN_I18N.resourcePages.removeMenuItem,
          type: "item",
          value: "remove",
        },
      ],
    });

    clearPreviewImage(
      { state },
      {
        target: "preview-background",
      },
    );
    closePreviewImageMenu({ state });

    expect(selectDialogPreviewData({ state })).toBeUndefined();
    expect(
      selectViewData({ state, i18n: EN_I18N }).previewPanel.items[0],
    ).toMatchObject({
      target: "preview-background",
      image: undefined,
    });
    expect(
      selectViewData({ state, i18n: EN_I18N }).previewImageMenu,
    ).toMatchObject({
      isOpen: false,
      items: [],
    });
  });

  it("prefills and exposes saved preview images for editing", () => {
    const state = createInitialState();
    setImagesData({ state }, { imagesData });

    openTransformFormDialog(
      { state },
      {
        itemData: {
          type: "transform",
          name: "Move",
          preview: {
            background: {
              imageId: "image-bg",
            },
            target: {
              imageId: "image-bg",
            },
          },
        },
      },
    );

    expect(selectDialogPreviewData({ state })).toEqual({
      background: {
        imageId: "image-bg",
      },
      target: {
        imageId: "image-bg",
      },
    });
    expect(selectViewData({ state, i18n: EN_I18N }).previewPanel.items).toEqual(
      [
        expect.objectContaining({
          target: "preview-background",
          image: expect.objectContaining({
            previewFileId: "thumb-bg",
          }),
        }),
        expect.objectContaining({
          target: "preview-target",
          image: expect.objectContaining({
            previewFileId: "thumb-bg",
          }),
        }),
      ],
    );
  });

  it("resolves double-click preview images to thumbnail file ids", () => {
    const state = createInitialState();
    setImagesData({ state }, { imagesData });

    showFullImagePreview(
      { state },
      {
        imageId: "image-bg",
      },
    );

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      fullImagePreviewVisible: true,
      fullImagePreviewImageId: "image-bg",
      fullImagePreviewFileId: "thumb-bg",
    });
  });

  it("configures the import form for URL packages", () => {
    const state = createInitialState();
    openImportDialog(
      { state },
      {
        targetGroupId: "folder-1",
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const form = viewData.importForm;
    const urlField = form.fields.find((field) => field.name === "url");
    const sourceField = form.fields.find(
      (field) => field.name === "sourceType",
    );
    const jsonField = form.fields.find((field) => field.name === "json");
    const continueButton = form.actions.buttons.find(
      (button) => button.id === "continue",
    );

    expect(sourceField).toBeUndefined();
    expect(jsonField).toBeUndefined();
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

  it("configures destination folder selectors for transform and image dependencies", () => {
    const state = createInitialState();
    state.data = {
      items: {
        "folder-transform": {
          id: "folder-transform",
          type: "folder",
          name: "Transform Folder",
        },
      },
      tree: [{ id: "folder-transform" }],
    };
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
        includeImages: true,
      },
    );

    const form = selectViewData({ state, i18n: EN_I18N }).importForm;
    const transformFolderField = form.fields.find(
      (field) => field.name === "transformFolderId",
    );
    const imageFolderField = form.fields.find(
      (field) => field.name === "imageFolderId",
    );
    const importButton = form.actions.buttons.find(
      (button) => button.id === "import",
    );

    expect(transformFolderField.options).toEqual([
      { value: "folder-transform", label: "Transform Folder" },
    ]);
    expect(imageFolderField.options).toEqual([
      { value: "folder-image", label: "Image Folder" },
    ]);
    expect(importButton).toMatchObject({
      label: "Import Transform",
      validate: true,
    });
  });

  it("exposes saved transform thumbnails for the item double-click preview dialog", () => {
    const state = createInitialState();

    openTransformPreviewDialog(
      { state },
      {
        itemId: "transform-1",
        itemData: {
          id: "transform-1",
          type: "transform",
          name: "Move",
          previewFileId: "preview-transform",
          thumbnailFileId: "thumb-transform",
        },
      },
    );

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      isDialogOpen: true,
      isPreviewOnlyDialog: true,
      dialogPreviewFileId: "preview-transform",
      dialogPreviewThumbnailFileId: "thumb-transform",
      dialogPreviewItem: expect.objectContaining({
        id: "transform-1",
      }),
    });
  });
});
