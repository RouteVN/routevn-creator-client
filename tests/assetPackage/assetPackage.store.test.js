import { describe, expect, it } from "vitest";
import {
  addResourceSection,
  addSelectedImage,
  closeCreatePackageDialog,
  closeFolderNameDialog,
  closeImageSelectorDialog,
  closeResourceTypeMenu,
  createInitialState,
  openCreatePackageDialog,
  openFolderNameDialog,
  openImageSelectorDialog,
  openResourceTypeMenu,
  setImagesData,
  setImageSelectorSelectedImageId,
  selectViewData,
  setUiConfig,
} from "../../src/pages/assetPackage/assetPackage.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("asset package store", () => {
  it("exposes the settings navigation and create package action", () => {
    const state = createInitialState();

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      resourceCategory: "settings",
      selectedResourceId: "assetPackage",
      showExplorerPanel: true,
      title: "Asset Package",
      description:
        "This is a tool to create a package to be uploaded to the RouteVN Asset Library.",
      createPackageButton: "Create Package",
      createPackageDialogOpen: false,
      createPackageForm: {
        title: "Create Asset Package",
        fields: [{ type: "slot", slot: "resources" }],
      },
      folderNameForm: {
        title: "Add Images Folder",
        fields: [
          {
            name: "name",
            type: "input-text",
            label: "Folder Name",
            required: true,
          },
        ],
      },
      resourceTypeMenuItems: [
        { label: "Images", type: "item", value: "images" },
        { label: "Audio", type: "item", value: "audio" },
        { label: "Videos", type: "item", value: "videos" },
      ],
    });
  });

  it("opens and closes the creation dialog and resource type menu", () => {
    const state = createInitialState();

    openCreatePackageDialog({ state });
    openResourceTypeMenu({ state }, { x: 24, y: 48 });

    expect(state.createPackageDialogOpen).toBe(true);
    expect(state.resourceTypeMenu).toEqual({
      isOpen: true,
      x: 24,
      y: 48,
    });

    closeResourceTypeMenu({ state });
    expect(state.resourceTypeMenu.isOpen).toBe(false);

    openResourceTypeMenu({ state }, { x: 24, y: 48 });
    closeCreatePackageDialog({ state });
    expect(state.createPackageDialogOpen).toBe(false);
    expect(state.resourceTypeMenu.isOpen).toBe(false);
  });

  it("adds selected images once and exposes project folders to the selector", () => {
    const state = createInitialState();
    setImagesData(
      { state },
      {
        imagesData: {
          items: {
            "folder-1": { type: "folder", name: "Images" },
            "image-1": {
              type: "image",
              name: "Background",
              description: "A rainy city background.",
            },
          },
          tree: [
            {
              id: "folder-1",
              children: [{ id: "image-1" }],
            },
          ],
        },
      },
    );

    addResourceSection({ state }, { type: "images", name: "Backgrounds" });
    openImageSelectorDialog({ state }, { sectionId: "images-1" });
    setImageSelectorSelectedImageId({ state }, { imageId: "image-1" });
    addSelectedImage({ state }, { sectionId: "images-1", imageId: "image-1" });
    addSelectedImage({ state }, { sectionId: "images-1", imageId: "image-1" });
    closeImageSelectorDialog({ state });

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      fileExplorerItems: [
        expect.objectContaining({ id: "folder-1", type: "folder" }),
      ],
      resourceSections: [
        {
          id: "images-1",
          type: "images",
          name: "Backgrounds",
          typeLabel: "Images",
          itemIds: ["image-1"],
          images: [
            {
              imageId: "image-1",
              title: "Background",
              description: "A rainy city background.",
            },
          ],
        },
      ],
      imageSelectorDialog: {
        open: false,
        sectionId: undefined,
        selectedImageId: undefined,
      },
    });
  });

  it("creates separate image sections and resets them with the dialog", () => {
    const state = createInitialState();

    addResourceSection({ state }, { type: "images", name: "Backgrounds" });
    addResourceSection({ state }, { type: "images", name: "Characters" });

    expect(
      state.resourceSections.map((section) => ({
        id: section.id,
        name: section.name,
      })),
    ).toEqual([
      { id: "images-1", name: "Backgrounds" },
      { id: "images-2", name: "Characters" },
    ]);

    closeCreatePackageDialog({ state });

    expect(state.resourceSections).toEqual([]);
    expect(state.nextResourceSectionNumber).toBe(1);
  });

  it("requires a folder name before creating an image section", () => {
    const state = createInitialState();

    openFolderNameDialog({ state }, { type: "images" });
    expect(state.folderNameDialog).toMatchObject({
      open: true,
      type: "images",
      formKey: 1,
    });

    addResourceSection({ state }, { type: "images", name: "   " });
    expect(state.resourceSections).toEqual([]);

    closeFolderNameDialog({ state });
    expect(state.folderNameDialog).toMatchObject({
      open: false,
      type: undefined,
    });
  });

  it("supports multiple named folders for every asset type", () => {
    const state = createInitialState();

    addResourceSection({ state }, { type: "audio", name: "Music" });
    addResourceSection({ state }, { type: "audio", name: "Sound Effects" });
    addResourceSection({ state }, { type: "videos", name: "Cutscenes" });

    expect(
      selectViewData({ state, i18n: EN_I18N }).resourceSections.map(
        (section) => ({
          type: section.type,
          name: section.name,
          typeLabel: section.typeLabel,
        }),
      ),
    ).toEqual([
      { type: "audio", name: "Music", typeLabel: "Audio" },
      { type: "audio", name: "Sound Effects", typeLabel: "Audio" },
      { type: "videos", name: "Cutscenes", typeLabel: "Videos" },
    ]);
  });

  it("uses the compact page shell in touch mode", () => {
    const state = createInitialState();

    setUiConfig({ state }, { uiConfig: { id: "touch" } });

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      isTouchMode: true,
      showExplorerPanel: false,
      contentPadding: "0",
      contentBodyPadding: "md",
      contentBodyMarginTop: "0",
    });
  });
});
