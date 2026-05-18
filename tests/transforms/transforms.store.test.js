import { describe, expect, it } from "vitest";
import {
  applyPreviewImageSelectorSelection,
  closePreviewImageSelectorDialog,
  commitPreviewImageSelectorSelection,
  createInitialState,
  clearPreviewImage,
  closePreviewImageMenu,
  openPreviewImageSelectorDialog,
  openPreviewImageMenu,
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

    expect(selectViewData({ state }).previewPanel.items[0]).toMatchObject({
      target: "preview-background",
      image: expect.objectContaining({
        previewFileId: "thumb-bg",
      }),
    });

    closePreviewImageSelectorDialog({ state });

    expect(selectViewData({ state }).previewPanel.items[0]).toMatchObject({
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

    expect(selectViewData({ state }).previewPanel.items[0]).toMatchObject({
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
      },
    );

    expect(selectPreviewImageMenuTarget({ state })).toBe("preview-background");
    expect(selectViewData({ state }).previewImageMenu).toMatchObject({
      isOpen: true,
      x: 120,
      y: 240,
      items: [{ label: "Remove", type: "item", value: "remove" }],
    });

    clearPreviewImage(
      { state },
      {
        target: "preview-background",
      },
    );
    closePreviewImageMenu({ state });

    expect(selectDialogPreviewData({ state })).toBeUndefined();
    expect(selectViewData({ state }).previewPanel.items[0]).toMatchObject({
      target: "preview-background",
      image: undefined,
    });
    expect(selectViewData({ state }).previewImageMenu).toMatchObject({
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
    expect(selectViewData({ state }).previewPanel.items).toEqual([
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
    ]);
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

    expect(selectViewData({ state })).toMatchObject({
      fullImagePreviewVisible: true,
      fullImagePreviewImageId: "image-bg",
      fullImagePreviewFileId: "thumb-bg",
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

    expect(selectViewData({ state })).toMatchObject({
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
