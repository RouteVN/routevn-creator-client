import { describe, expect, it, vi } from "vitest";
import {
  handleAddPackageResourceButtonClick,
  handleAddSectionImageButtonClick,
  handleBeforeMount,
  handleCreatePackageButtonClick,
  handleCreatePackageDialogClose,
  handleFileExplorerClickItem,
  handleFolderNameDialogClose,
  handleFolderNameFormAction,
  handleImageSelected,
  handleImageSelectorCancel,
  handleImageSelectorSubmit,
  handleResourceTypeMenuClose,
  handleResourceTypeMenuItemClick,
} from "../../src/pages/assetPackage/assetPackage.handlers.js";

const createDeps = () => ({
  projectService: {
    getRepositoryState: vi.fn(() => ({ images: { items: {}, tree: [] } })),
  },
  refs: {
    imageSelector: {
      transformedHandlers: {
        handleScrollToItem: vi.fn(),
      },
    },
  },
  render: vi.fn(),
  store: {
    addResourceSection: vi.fn(),
    addSelectedImage: vi.fn(),
    closeCreatePackageDialog: vi.fn(),
    closeFolderNameDialog: vi.fn(),
    closeImageSelectorDialog: vi.fn(),
    closeResourceTypeMenu: vi.fn(),
    openCreatePackageDialog: vi.fn(),
    openFolderNameDialog: vi.fn(),
    openImageSelectorDialog: vi.fn(),
    openResourceTypeMenu: vi.fn(),
    selectImageSelectorDialog: vi.fn(() => ({
      open: true,
      sectionId: "images-1",
      selectedImageId: "image-1",
    })),
    selectFolderNameDialogType: vi.fn(() => "images"),
    setImagesData: vi.fn(),
    setImageSelectorSelectedImageId: vi.fn(),
    setUiConfig: vi.fn(),
  },
  uiConfig: { id: "desktop" },
});

describe("asset package handlers", () => {
  it("loads project images before the page mounts", () => {
    const deps = createDeps();

    handleBeforeMount(deps);

    expect(deps.store.setImagesData).toHaveBeenCalledWith({
      imagesData: { items: {}, tree: [] },
    });
  });

  it("opens the create package dialog", () => {
    const deps = createDeps();

    handleCreatePackageButtonClick(deps);

    expect(deps.store.openCreatePackageDialog).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("opens the resource menu below the plus button", () => {
    const deps = createDeps();

    handleAddPackageResourceButtonClick(deps, {
      _event: {
        currentTarget: {
          getBoundingClientRect: () => ({ left: 20, bottom: 60 }),
        },
      },
    });

    expect(deps.store.openResourceTypeMenu).toHaveBeenCalledWith({
      x: 20,
      y: 60,
    });
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("closes the dialog and menu surfaces", () => {
    const deps = createDeps();

    handleCreatePackageDialogClose(deps);
    handleResourceTypeMenuClose(deps);

    expect(deps.store.closeCreatePackageDialog).toHaveBeenCalledOnce();
    expect(deps.store.closeResourceTypeMenu).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("opens the folder name dialog from the Images menu item", () => {
    const deps = createDeps();

    handleResourceTypeMenuItemClick(deps, {
      _event: { detail: { item: { value: "images" } } },
    });

    expect(deps.store.closeResourceTypeMenu).toHaveBeenCalledOnce();
    expect(deps.store.openFolderNameDialog).toHaveBeenCalledWith({
      type: "images",
    });
    expect(deps.store.addResourceSection).not.toHaveBeenCalled();
    expect(deps.store.openImageSelectorDialog).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("creates a named image folder from the folder form", () => {
    const deps = createDeps();

    handleFolderNameFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: { name: "Backgrounds" },
        },
      },
    });

    expect(deps.store.addResourceSection).toHaveBeenCalledWith({
      type: "images",
      name: "Backgrounds",
    });
    expect(deps.store.closeFolderNameDialog).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("closes the folder name dialog without creating a folder", () => {
    const deps = createDeps();

    handleFolderNameDialogClose(deps);

    expect(deps.store.closeFolderNameDialog).toHaveBeenCalledOnce();
    expect(deps.store.addResourceSection).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("opens the image selector from an image section plus button", () => {
    const deps = createDeps();

    handleAddSectionImageButtonClick(deps, {
      _event: {
        currentTarget: { dataset: { sectionId: "images-1" } },
      },
    });

    expect(deps.store.openImageSelectorDialog).toHaveBeenCalledWith({
      sectionId: "images-1",
    });
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("adds the confirmed image and keeps the package dialog open", () => {
    const deps = createDeps();

    handleImageSelected(deps, {
      _event: { detail: { imageId: "image-1" } },
    });
    handleImageSelectorSubmit(deps);

    expect(deps.store.setImageSelectorSelectedImageId).toHaveBeenCalledWith({
      imageId: "image-1",
    });
    expect(deps.store.addSelectedImage).toHaveBeenCalledWith({
      sectionId: "images-1",
      imageId: "image-1",
    });
    expect(deps.store.closeImageSelectorDialog).toHaveBeenCalledOnce();
    expect(deps.store.closeCreatePackageDialog).not.toHaveBeenCalled();
  });

  it("supports selector cancellation and folder navigation", () => {
    const deps = createDeps();

    handleImageSelectorCancel(deps);
    handleFileExplorerClickItem(deps, {
      _event: { detail: { itemId: "folder-1" } },
    });

    expect(deps.store.closeImageSelectorDialog).toHaveBeenCalledOnce();
    expect(
      deps.refs.imageSelector.transformedHandlers.handleScrollToItem,
    ).toHaveBeenCalledWith({ itemId: "folder-1" });
  });
});
