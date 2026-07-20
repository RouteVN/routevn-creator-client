import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";

const { generateIdMock, processPendingUploadsMock } = vi.hoisted(() => ({
  generateIdMock: vi.fn(() => "image-123"),
  processPendingUploadsMock: vi.fn(),
}));

vi.mock("../../src/internal/id.js", () => ({
  generateId: generateIdMock,
}));

vi.mock(
  "../../src/internal/ui/resourcePages/media/processPendingUploads.js",
  () => ({
    processPendingUploads: processPendingUploadsMock,
  }),
);

import {
  handleCreateTagFormAction,
  handleCreateTagDialogClose,
  handleDetailTagAddOptionClick,
  handleDetailTagValueChange,
  handleDeleteDialogConfirm,
  handleFileExplorerAction,
  handleFileExplorerKeyboardScopeKeyDown,
  handleFileExplorerSelectionChanged,
  handleImageItemPreview,
  handleResourceViewBackgroundClick,
  handleMobileDetailDeleteClick,
  handleMobileDetailPreviewClick,
  handlePreviewCanvasModeClick,
  handlePreviewFitModeClick,
  handlePreviewOverlayClick,
  handlePreviewOverlayKeyDown,
  handlePreviewOverlayTouchEnd,
  handlePreviewOverlayTouchStart,
  handleItemDelete,
  handleUploadClick,
} from "../../src/pages/images/images.handlers.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

describe("images handlers", () => {
  beforeEach(() => {
    generateIdMock.mockClear();
    processPendingUploadsMock.mockReset();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("clears image, folder, and explorer selection from a grid background click", () => {
    const deps = {
      store: {
        setSelectedFolderId: vi.fn(),
        setSelectedItemId: vi.fn(),
      },
      refs: {
        fileExplorer: {
          clearSelection: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleResourceViewBackgroundClick(deps);

    expect(deps.store.setSelectedFolderId).toHaveBeenCalledWith({
      folderId: undefined,
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(deps.refs.fileExplorer.clearSelection).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("opens the selected image edit dialog when e is pressed", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const deps = {
      store: {
        selectFullImagePreviewVisible: vi.fn(() => false),
        selectImageItemById: vi.fn(() => ({
          id: "image-1",
          name: "Background",
          description: "Scene background",
          tagIds: ["tag-1"],
          thumbnailFileId: "thumbnail-1",
          fileId: "image-file-1",
        })),
        setSelectedItemId: vi.fn(),
        openEditDialog: vi.fn(),
      },
      refs: {
        fileExplorer: {
          getSelectedItem: vi.fn(() => ({
            itemId: "image-1",
            isFolder: false,
          })),
          selectItem: vi.fn(),
        },
        editForm: {
          reset: vi.fn(),
          setValues: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleFileExplorerKeyboardScopeKeyDown(deps, {
      _event: {
        key: "e",
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault,
        stopPropagation,
      },
    });

    expect(deps.store.openEditDialog).toHaveBeenCalledWith({
      itemId: "image-1",
      defaultValues: {
        name: "Background",
        description: "Scene background",
        tagIds: ["tag-1"],
      },
      previewFileId: "thumbnail-1",
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("opens the selected image folder dialog when e is pressed", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const deps = {
      store: {
        selectFullImagePreviewVisible: vi.fn(() => false),
        selectFolderById: vi.fn(() => ({
          id: "folder-1",
          name: "Backgrounds",
          description: "Scene backgrounds",
        })),
        setSelectedFolderId: vi.fn(),
        openFolderNameDialog: vi.fn(),
      },
      refs: {
        fileExplorer: {
          getSelectedItem: vi.fn(() => ({
            itemId: "folder-1",
            isFolder: true,
          })),
          selectItem: vi.fn(),
        },
        folderNameForm: {
          reset: vi.fn(),
          setValues: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleFileExplorerKeyboardScopeKeyDown(deps, {
      _event: {
        key: "e",
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault,
        stopPropagation,
      },
    });

    expect(deps.store.openFolderNameDialog).toHaveBeenCalledWith({
      folderId: "folder-1",
      defaultValues: {
        name: "Backgrounds",
        description: "Scene backgrounds",
      },
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("jumps from the mobile file explorer without opening the detail sheet", () => {
    globalThis.requestAnimationFrame = (callback) => callback();
    const state = {
      isTouchMode: true,
      isMobileFileExplorerOpen: true,
    };
    const deps = {
      i18n: EN_I18N,
      store: {
        getState: vi.fn(() => state),
        selectIsTouchMode: vi.fn(() => state.isTouchMode),
        selectIsMobileFileExplorerOpen: vi.fn(
          () => state.isMobileFileExplorerOpen,
        ),
        setSelectedFolderId: vi.fn(),
        setSelectedItemId: vi.fn(),
        closeMobileFileExplorer: vi.fn(() => {
          state.isMobileFileExplorerOpen = false;
        }),
      },
      refs: {
        groupview: {
          scrollItemIntoView: vi.fn(),
        },
        fileExplorerKeyboardScope: {
          focus: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleFileExplorerSelectionChanged(deps, {
      _event: {
        detail: {
          itemId: "image-1",
          isFolder: false,
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-1",
      suppressMobileDetailSheet: true,
    });
    expect(deps.store.closeMobileFileExplorer).toHaveBeenCalledTimes(1);
    expect(deps.refs.groupview.scrollItemIntoView).toHaveBeenCalledWith({
      itemId: "image-1",
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("clears image and folder selection after clicking empty explorer space", () => {
    globalThis.requestAnimationFrame = (callback) => callback();
    const deps = {
      store: {
        selectIsTouchMode: vi.fn(() => false),
        setSelectedFolderId: vi.fn(),
        setSelectedItemId: vi.fn(),
      },
      refs: {
        fileExplorerKeyboardScope: {
          focus: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleFileExplorerSelectionChanged(deps, {
      _event: {
        detail: {
          itemId: undefined,
          isFolder: false,
        },
      },
    });

    expect(deps.store.setSelectedFolderId).toHaveBeenCalledWith({
      folderId: undefined,
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("opens mobile long-press previews without opening the detail sheet", () => {
    globalThis.requestAnimationFrame = (callback) => callback();
    const deps = {
      i18n: EN_I18N,
      store: {
        selectImageItemById: vi.fn(({ itemId }) => ({
          id: itemId,
          type: "image",
          fileId: "image-file-1",
        })),
        setSelectedItemId: vi.fn(),
        showFullImagePreview: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
        groupview: {
          scrollItemIntoView: vi.fn(),
        },
        previewOverlay: {
          focus: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleImageItemPreview(deps, {
      _event: {
        detail: {
          itemId: "image-1",
          source: "mobile-context-menu",
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-1",
      suppressMobileDetailSheet: true,
    });
    expect(deps.store.showFullImagePreview).toHaveBeenCalledWith({
      itemId: "image-1",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "image-1",
    });
    expect(deps.refs.groupview.scrollItemIntoView).toHaveBeenCalledWith({
      itemId: "image-1",
    });
  });

  it("opens selected mobile detail images in preview without reopening the detail sheet", () => {
    globalThis.requestAnimationFrame = (callback) => callback();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const deps = {
      i18n: EN_I18N,
      store: {
        selectSelectedItemId: vi.fn(() => "image-1"),
        selectImageItemById: vi.fn(({ itemId }) => ({
          id: itemId,
          type: "image",
          fileId: "image-file-1",
        })),
        setSelectedItemId: vi.fn(),
        showFullImagePreview: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
        groupview: {
          scrollItemIntoView: vi.fn(),
        },
        previewOverlay: {
          focus: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleMobileDetailPreviewClick(deps, {
      _event: {
        preventDefault,
        stopPropagation,
      },
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-1",
      suppressMobileDetailSheet: true,
    });
    expect(deps.store.showFullImagePreview).toHaveBeenCalledWith({
      itemId: "image-1",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "image-1",
    });
  });

  it("opens a confirmation dialog for selected mobile detail image deletes", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const deps = {
      i18n: EN_I18N,
      store: {
        selectSelectedItemId: vi.fn(() => "image-1"),
        openDeleteDialog: vi.fn(),
      },
      render: vi.fn(),
    };

    handleMobileDetailDeleteClick(deps, {
      _event: {
        preventDefault,
        stopPropagation,
      },
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.store.openDeleteDialog).toHaveBeenCalledWith({
      itemId: "image-1",
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("opens a confirmation dialog instead of deleting an image directly", () => {
    const deps = {
      projectService: {
        deleteImageIfUnused: vi.fn(),
      },
      store: {
        openDeleteDialog: vi.fn(),
      },
      render: vi.fn(),
    };

    handleItemDelete(deps, {
      _event: {
        detail: {
          itemId: "image-1",
        },
      },
    });

    expect(deps.store.openDeleteDialog).toHaveBeenCalledWith({
      itemId: "image-1",
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.projectService.deleteImageIfUnused).not.toHaveBeenCalled();
  });

  it("opens the same confirmation dialog for file explorer image deletes", async () => {
    const deps = {
      store: {
        selectImageItemById: vi.fn(() => ({
          id: "image-1",
          type: "image",
        })),
        openDeleteDialog: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleFileExplorerAction(deps, {
      _event: {
        detail: {
          item: { value: "delete-item" },
          itemId: "image-1",
        },
      },
    });

    expect(deps.store.openDeleteDialog).toHaveBeenCalledWith({
      itemId: "image-1",
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("deletes confirmed images and clears the selection", async () => {
    globalThis.requestAnimationFrame = (callback) => callback();
    const repositoryState = {
      images: {
        tree: [],
        items: {},
      },
      files: {
        tree: [],
        items: {},
      },
      project: {
        resolution: {
          width: 1920,
          height: 1080,
        },
      },
      tags: {},
    };
    let selectedItemId = "image-1";
    const deps = {
      i18n: EN_I18N,
      projectService: {
        deleteImageIfUnused: vi.fn(async () => ({
          deleted: true,
        })),
        getRepositoryState: vi.fn(() => repositoryState),
      },
      appService: {
        showAlert: vi.fn(),
      },
      store: {
        selectDeleteDialogItemId: vi.fn(() => "image-1"),
        closeDeleteDialog: vi.fn(),
        selectSelectedItemId: vi.fn(() => selectedItemId),
        setSelectedItemId: vi.fn(({ itemId }) => {
          selectedItemId = itemId;
        }),
        setTagsData: vi.fn(),
        setItems: vi.fn(),
        setProjectResolution: vi.fn(),
      },
      render: vi.fn(),
      refs: {},
    };

    await handleDeleteDialogConfirm(deps);

    expect(deps.store.closeDeleteDialog).toHaveBeenCalledTimes(1);
    expect(deps.projectService.deleteImageIfUnused).toHaveBeenCalledWith({
      imageId: "image-1",
      checkTargets: ["scenes", "layouts", "controls"],
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(selectedItemId).toBeUndefined();
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("shows a failure alert when deleteImageIfUnused fails without usage", async () => {
    globalThis.requestAnimationFrame = (callback) => callback();
    const deps = {
      i18n: EN_I18N,
      projectService: {
        deleteImageIfUnused: vi.fn(async () => ({
          deleted: false,
          usage: {
            isUsed: false,
          },
        })),
      },
      appService: {
        showAlert: vi.fn(),
      },
      store: {
        selectDeleteDialogItemId: vi.fn(() => "image-1"),
        closeDeleteDialog: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleDeleteDialogConfirm(deps);

    expect(deps.projectService.deleteImageIfUnused).toHaveBeenCalledWith({
      imageId: "image-1",
      checkTargets: ["scenes", "layouts", "controls"],
    });
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Failed to delete resource.",
    });
    expect(deps.render).toHaveBeenCalled();
  });

  it("marks pending uploads with the created image id before importing", async () => {
    const file = new File(["image"], "hero.png", {
      type: "image/png",
    });
    const removePendingUpload = vi.fn();
    processPendingUploadsMock.mockImplementation(
      async ({ files, processFile }) => {
        await processFile({
          file: files[0],
          pendingUploadId: "pending-image-1",
          removePendingUpload,
        });
        return { status: "ok", successfulUploadCount: 1 };
      },
    );

    const deps = {
      i18n: EN_I18N,
      appService: {
        pickFiles: vi.fn(async () => [file]),
        showAlert: vi.fn(),
      },
      projectService: {
        importImageFile: vi.fn(async () => ({
          valid: true,
          imageId: "image-123",
        })),
        getState: vi.fn(() => ({
          images: {
            tree: [],
            items: {
              "image-123": {
                id: "image-123",
                type: "image",
                name: "hero",
              },
            },
          },
        })),
        subscribeProjectState: vi.fn(() => () => {}),
      },
      store: {
        updatePendingUpload: vi.fn(),
        setTagsData: vi.fn(),
        setItems: vi.fn(),
        setProjectResolution: vi.fn(),
        setSelectedItemId: vi.fn(),
        setSelectedFolderId: vi.fn(),
      },
      render: vi.fn(),
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
    };

    await handleUploadClick(deps, {
      _event: {
        detail: {
          groupId: "folder-1",
        },
      },
    });

    expect(deps.store.updatePendingUpload).toHaveBeenCalledWith({
      itemId: "pending-image-1",
      updates: {
        resolvedItemId: "image-123",
      },
    });
    expect(deps.projectService.importImageFile).toHaveBeenCalledWith({
      file,
      parentId: "folder-1",
      imageId: "image-123",
    });
    expect(removePendingUpload).toHaveBeenCalledTimes(1);
    expect(deps.store.setItems).toHaveBeenCalledWith({
      data: {
        tree: [],
        items: {
          "image-123": {
            id: "image-123",
            type: "image",
            name: "hero",
            resolvedTags: [],
          },
        },
      },
    });
  });

  it("creates a new tag from the detail-panel flow and keeps the draft open", async () => {
    const deps = {
      i18n: EN_I18N,
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        createTag: vi.fn(async () => ({ valid: true })),
        updateImage: vi.fn(async () => ({ valid: true })),
        getRepositoryState: vi.fn(() => ({
          files: { items: {}, tree: [] },
          images: {
            tree: [],
            items: {
              "image-1": {
                id: "image-1",
                type: "image",
                name: "Hero",
                tagIds: [],
              },
            },
          },
          tags: {
            images: {
              tree: [{ id: "image-tag-1" }],
              items: {
                "image-tag-1": {
                  id: "image-tag-1",
                  type: "tag",
                  name: "Background",
                },
              },
            },
          },
        })),
        subscribeProjectState: vi.fn(() => () => {}),
      },
      store: {
        selectCreateTagContext: vi.fn(() => ({
          mode: "item",
          itemId: "image-1",
          draftTagIds: [],
        })),
        selectTagsData: vi.fn(() => ({
          tree: [{ id: "image-tag-1" }],
          items: {
            "image-tag-1": {
              id: "image-tag-1",
              type: "tag",
              name: "Background",
            },
          },
        })),
        getState: vi.fn(() => ({
          createTagContext: {
            mode: "item",
            itemId: "image-1",
            draftTagIds: [],
          },
          tagsData: {
            tree: [{ id: "image-tag-1" }],
            items: {
              "image-tag-1": {
                id: "image-tag-1",
                type: "tag",
                name: "Background",
              },
            },
          },
          detailTagIds: [],
        })),
        closeCreateTagDialog: vi.fn(),
        setTagsData: vi.fn(),
        setItems: vi.fn(),
        setProjectResolution: vi.fn(),
        setDetailTagIds: vi.fn(),
        setDetailTagPopoverOpen: vi.fn(),
        selectSelectedItemId: vi.fn(() => "image-1"),
        selectImageItemById: vi.fn(({ itemId }) => ({
          id: itemId,
          type: "image",
          name: "Hero",
          tagIds: [],
        })),
      },
      refs: {
        editForm: {
          getValues: vi.fn(() => ({})),
          setValues: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    await handleCreateTagFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Background",
          },
        },
      },
    });

    expect(deps.projectService.createTag).toHaveBeenCalledWith({
      scopeKey: "images",
      tagId: "image-123",
      data: {
        type: "tag",
        name: "Background",
      },
    });
    expect(deps.store.setItems).not.toHaveBeenCalled();
    expect(deps.store.setTagsData).toHaveBeenCalledWith({
      tagsData: {
        tree: [{ id: "image-tag-1" }, { id: "image-123" }],
        items: {
          "image-tag-1": {
            id: "image-tag-1",
            type: "tag",
            name: "Background",
          },
          "image-123": {
            id: "image-123",
            type: "tag",
            name: "Background",
          },
        },
      },
    });
    expect(deps.store.setDetailTagIds).toHaveBeenCalledWith({
      tagIds: ["image-123"],
    });
    expect(deps.store.setDetailTagPopoverOpen).toHaveBeenCalledWith({
      open: true,
    });
    expect(deps.projectService.updateImage).not.toHaveBeenCalled();
  });

  it("closes the detail tag popover before opening the create tag dialog", () => {
    const deps = {
      i18n: EN_I18N,
      store: {
        selectDetailTagIds: vi.fn(() => ["image-tag-1"]),
        getState: vi.fn(() => ({
          detailTagIds: ["image-tag-1"],
        })),
        openCreateTagDialog: vi.fn(),
        setDetailTagPopoverOpen: vi.fn(),
        selectSelectedItemId: vi.fn(() => "image-1"),
        selectImageItemById: vi.fn(() => ({
          id: "image-1",
          type: "image",
          tagIds: ["image-tag-1"],
        })),
      },
      render: vi.fn(),
    };

    handleDetailTagAddOptionClick(deps);

    expect(deps.store.openCreateTagDialog).toHaveBeenCalledWith({
      mode: "item",
      itemId: "image-1",
      draftTagIds: ["image-tag-1"],
    });
    expect(deps.store.setDetailTagPopoverOpen).toHaveBeenCalledWith({
      open: false,
      item: {
        tagIds: [],
      },
    });
    expect(deps.render).toHaveBeenCalled();
  });

  it("reopens the detail tag popover when the create tag dialog closes", () => {
    const deps = {
      i18n: EN_I18N,
      store: {
        selectCreateTagContext: vi.fn(() => ({
          mode: "item",
          itemId: "image-1",
          draftTagIds: ["image-tag-1"],
        })),
        getState: vi.fn(() => ({
          createTagContext: {
            mode: "item",
            itemId: "image-1",
            draftTagIds: ["image-tag-1"],
          },
        })),
        closeCreateTagDialog: vi.fn(),
        setDetailTagIds: vi.fn(),
        setDetailTagPopoverOpen: vi.fn(),
        selectSelectedItemId: vi.fn(() => "image-1"),
      },
      render: vi.fn(),
    };

    handleCreateTagDialogClose(deps);

    expect(deps.store.closeCreateTagDialog).toHaveBeenCalled();
    expect(deps.store.setDetailTagIds).toHaveBeenCalledWith({
      tagIds: ["image-tag-1"],
    });
    expect(deps.store.setDetailTagPopoverOpen).toHaveBeenCalledWith({
      open: true,
    });
    expect(deps.render).toHaveBeenCalled();
  });

  it("updates image tags directly from the detail-panel tag selector", async () => {
    const deps = {
      i18n: EN_I18N,
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        updateImage: vi.fn(async () => ({ valid: true })),
        getRepositoryState: vi.fn(() => ({
          files: { items: {}, tree: [] },
          images: {
            tree: [],
            items: {
              "image-1": {
                id: "image-1",
                type: "image",
                name: "Hero",
                tagIds: ["tag-1"],
              },
            },
          },
          tags: {
            images: {
              tree: [{ id: "tag-1" }, { id: "tag-2" }],
              items: {
                "tag-1": {
                  id: "tag-1",
                  type: "tag",
                  name: "Old",
                },
                "tag-2": {
                  id: "tag-2",
                  type: "tag",
                  name: "New",
                },
              },
            },
          },
        })),
        subscribeProjectState: vi.fn(() => () => {}),
      },
      store: {
        selectSelectedItemId: vi.fn(() => "image-1"),
        commitDetailTagIds: vi.fn(),
        setTagsData: vi.fn(),
        setItems: vi.fn(),
        setProjectResolution: vi.fn(),
        setSelectedItemId: vi.fn(),
        setSelectedFolderId: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    await handleDetailTagValueChange(deps, {
      _event: {
        detail: {
          value: ["tag-1", "tag-2"],
        },
      },
    });

    expect(deps.projectService.updateImage).toHaveBeenCalledWith({
      imageId: "image-1",
      data: {
        tagIds: ["tag-1", "tag-2"],
      },
    });
    expect(deps.store.commitDetailTagIds).toHaveBeenCalledWith({
      tagIds: ["tag-1", "tag-2"],
    });
  });

  it("does not reselect the previous item when a detail tag update finishes after selection changes", async () => {
    let selectedItemId = "image-1";
    const deps = {
      i18n: EN_I18N,
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        updateImage: vi.fn(async () => {
          selectedItemId = "image-2";
          return { valid: true };
        }),
        getRepositoryState: vi.fn(() => ({
          files: { items: {}, tree: [] },
          images: {
            tree: [],
            items: {
              "image-1": {
                id: "image-1",
                type: "image",
                name: "Hero",
                tagIds: ["tag-1", "tag-2"],
              },
              "image-2": {
                id: "image-2",
                type: "image",
                name: "Villain",
                tagIds: [],
              },
            },
          },
          tags: {
            images: {
              tree: [{ id: "tag-1" }, { id: "tag-2" }],
              items: {
                "tag-1": { id: "tag-1", type: "tag", name: "Old" },
                "tag-2": { id: "tag-2", type: "tag", name: "New" },
              },
            },
          },
        })),
        subscribeProjectState: vi.fn(() => () => {}),
      },
      store: {
        selectSelectedItemId: vi.fn(() => selectedItemId),
        commitDetailTagIds: vi.fn(),
        setTagsData: vi.fn(),
        setItems: vi.fn(),
        setProjectResolution: vi.fn(),
        setSelectedItemId: vi.fn(),
        setSelectedFolderId: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    await handleDetailTagValueChange(deps, {
      _event: {
        detail: {
          value: ["tag-1", "tag-2"],
        },
      },
    });

    expect(deps.projectService.updateImage).toHaveBeenCalledWith({
      imageId: "image-1",
      data: {
        tagIds: ["tag-1", "tag-2"],
      },
    });
    expect(deps.store.commitDetailTagIds).not.toHaveBeenCalled();
    expect(deps.store.setSelectedItemId).not.toHaveBeenCalledWith({
      itemId: "image-1",
    });
    expect(deps.refs.fileExplorer.selectItem).not.toHaveBeenCalledWith({
      itemId: "image-1",
    });
  });

  it("uses left and right arrows to switch preview display modes", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const createEvent = (key, overrides = {}) => ({
      key,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...overrides,
    });
    const store = {
      selectFullImagePreviewVisible: vi.fn(() => true),
      setFullImagePreviewDisplayMode: vi.fn(),
      selectAdjacentImageItemId: vi.fn(),
    };
    const deps = {
      i18n: EN_I18N,
      store,
      render: vi.fn(),
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
        groupview: {
          scrollItemIntoView: vi.fn(),
        },
        previewOverlay: {
          focus: vi.fn(),
        },
      },
    };

    const rightEvent = createEvent("ArrowRight");
    handlePreviewOverlayKeyDown(deps, {
      _event: rightEvent,
    });

    expect(store.setFullImagePreviewDisplayMode).toHaveBeenCalledWith({
      displayMode: "fit",
    });
    expect(store.selectAdjacentImageItemId).not.toHaveBeenCalled();
    expect(rightEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(rightEvent.stopPropagation).toHaveBeenCalledTimes(1);

    const leftEvent = createEvent("ArrowLeft");
    handlePreviewOverlayKeyDown(deps, {
      _event: leftEvent,
    });

    expect(store.setFullImagePreviewDisplayMode).toHaveBeenCalledWith({
      displayMode: "canvas",
    });
    expect(leftEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(leftEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(2);
    expect(deps.refs.previewOverlay.focus).toHaveBeenCalledTimes(2);
  });

  it("switches full image preview display modes from the overlay controls", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const createClickEvent = () => ({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    const store = {
      setFullImagePreviewDisplayMode: vi.fn(),
    };
    const deps = {
      i18n: EN_I18N,
      store,
      render: vi.fn(),
      refs: {
        previewOverlay: {
          focus: vi.fn(),
        },
      },
    };

    const canvasEvent = createClickEvent();
    handlePreviewCanvasModeClick(deps, {
      _event: canvasEvent,
    });

    expect(store.setFullImagePreviewDisplayMode).toHaveBeenCalledWith({
      displayMode: "canvas",
    });
    expect(canvasEvent.preventDefault).toHaveBeenCalledOnce();
    expect(canvasEvent.stopPropagation).toHaveBeenCalledOnce();

    const fitEvent = createClickEvent();
    handlePreviewFitModeClick(deps, {
      _event: fitEvent,
    });

    expect(store.setFullImagePreviewDisplayMode).toHaveBeenCalledWith({
      displayMode: "fit",
    });
    expect(fitEvent.preventDefault).toHaveBeenCalledOnce();
    expect(fitEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledTimes(2);
    expect(deps.refs.previewOverlay.focus).toHaveBeenCalledTimes(2);
  });

  it("does not use tab as a full image preview shortcut", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const event = {
      key: "Tab",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const store = {
      selectFullImagePreviewVisible: vi.fn(() => true),
      setFullImagePreviewDisplayMode: vi.fn(),
      selectSelectedItemId: vi.fn(),
      selectAdjacentImageItemId: vi.fn(),
    };
    const deps = {
      i18n: EN_I18N,
      store,
      render: vi.fn(),
      refs: {
        previewOverlay: {
          focus: vi.fn(),
        },
      },
    };

    handlePreviewOverlayKeyDown(deps, {
      _event: event,
    });

    expect(store.setFullImagePreviewDisplayMode).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.refs.previewOverlay.focus).not.toHaveBeenCalled();
    expect(store.selectAdjacentImageItemId).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("uses j and k to navigate, and h and l to switch display modes", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const createEvent = (key, overrides = {}) => ({
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...overrides,
    });
    const store = {
      selectFullImagePreviewVisible: vi.fn(() => true),
      selectSelectedItemId: vi.fn(() => "image-1"),
      selectAdjacentImageItemId: vi.fn(({ direction }) => {
        return direction === "next" ? "image-2" : "image-0";
      }),
      selectImageItemById: vi.fn(({ itemId }) => ({
        id: itemId,
        type: "image",
        fileId: `${itemId}-file`,
      })),
      setSelectedItemId: vi.fn(),
      showFullImagePreview: vi.fn(),
      setFullImagePreviewDisplayMode: vi.fn(),
    };
    const deps = {
      i18n: EN_I18N,
      store,
      render: vi.fn(),
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
        groupview: {
          scrollItemIntoView: vi.fn(),
        },
        previewOverlay: {
          focus: vi.fn(),
        },
      },
    };

    for (const key of ["j"]) {
      handlePreviewOverlayKeyDown(deps, {
        _event: createEvent(key),
      });
    }

    for (const key of ["k"]) {
      handlePreviewOverlayKeyDown(deps, {
        _event: createEvent(key),
      });
    }

    expect(store.selectAdjacentImageItemId).toHaveBeenNthCalledWith(1, {
      itemId: "image-1",
      direction: "next",
    });
    expect(store.selectAdjacentImageItemId).toHaveBeenNthCalledWith(2, {
      itemId: "image-1",
      direction: "previous",
    });

    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("h"),
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("l"),
    });

    expect(store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(1, {
      displayMode: "canvas",
    });
    expect(store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(2, {
      displayMode: "fit",
    });
    expect(store.selectAdjacentImageItemId).toHaveBeenCalledTimes(2);

    const inputEvent = createEvent("j", {
      target: {
        tagName: "INPUT",
      },
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: inputEvent,
    });

    expect(store.selectAdjacentImageItemId).toHaveBeenCalledTimes(2);
    expect(inputEvent.preventDefault).not.toHaveBeenCalled();
    expect(inputEvent.stopPropagation).not.toHaveBeenCalled();
  });

  it("uses ctrl+d and ctrl+u to jump preview items by ten", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const createEvent = (key, overrides = {}) => ({
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...overrides,
    });
    const store = {
      selectFullImagePreviewVisible: vi.fn(() => true),
      selectSelectedItemId: vi.fn(() => "image-11"),
      selectAdjacentImageItemId: vi.fn(({ direction }) => {
        return direction === "next" ? "image-21" : "image-1";
      }),
      selectImageItemById: vi.fn(({ itemId }) => ({
        id: itemId,
        type: "image",
        fileId: `${itemId}-file`,
      })),
      setSelectedItemId: vi.fn(),
      showFullImagePreview: vi.fn(),
    };
    const deps = {
      i18n: EN_I18N,
      store,
      render: vi.fn(),
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
        groupview: {
          scrollItemIntoView: vi.fn(),
        },
        previewOverlay: {
          focus: vi.fn(),
        },
      },
    };

    const downEvent = createEvent("d", {
      ctrlKey: true,
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: downEvent,
    });

    expect(store.selectAdjacentImageItemId).toHaveBeenNthCalledWith(1, {
      itemId: "image-11",
      direction: "next",
      distance: 10,
      clamp: true,
    });
    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-21",
      suppressMobileDetailSheet: true,
    });
    expect(downEvent.preventDefault).toHaveBeenCalledTimes(1);

    const upEvent = createEvent("u", {
      ctrlKey: true,
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: upEvent,
    });

    expect(store.selectAdjacentImageItemId).toHaveBeenNthCalledWith(2, {
      itemId: "image-11",
      direction: "previous",
      distance: 10,
      clamp: true,
    });
    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-1",
      suppressMobileDetailSheet: true,
    });
    expect(upEvent.preventDefault).toHaveBeenCalledTimes(1);

    const inputEvent = createEvent("d", {
      ctrlKey: true,
      target: {
        tagName: "INPUT",
      },
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: inputEvent,
    });

    expect(store.selectAdjacentImageItemId).toHaveBeenCalledTimes(2);
    expect(inputEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("uses horizontal preview swipes to navigate images", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    let touchStartPoint;
    let suppressNextClick = false;
    const createTouchEvent = ({ x, y, changed = false }) => {
      const touch = { clientX: x, clientY: y };
      return {
        touches: changed ? [] : [touch],
        changedTouches: changed ? [touch] : [],
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
    };
    const store = {
      selectFullImagePreviewVisible: vi.fn(() => true),
      setFullImagePreviewTouchStartPoint: vi.fn((point) => {
        touchStartPoint = point;
      }),
      clearFullImagePreviewTouchStartPoint: vi.fn(() => {
        touchStartPoint = undefined;
      }),
      selectFullImagePreviewTouchStartPoint: vi.fn(() => touchStartPoint),
      clearFullImagePreviewSuppressNextClick: vi.fn(() => {
        suppressNextClick = false;
      }),
      suppressNextFullImagePreviewClick: vi.fn(() => {
        suppressNextClick = true;
      }),
      selectSelectedItemId: vi.fn(() => "image-1"),
      selectAdjacentImageItemId: vi.fn(({ direction }) => {
        return direction === "next" ? "image-2" : "image-0";
      }),
      selectImageItemById: vi.fn(({ itemId }) => ({
        id: itemId,
        type: "image",
        fileId: `${itemId}-file`,
      })),
      setSelectedItemId: vi.fn(),
      showFullImagePreview: vi.fn(() => {
        suppressNextClick = false;
      }),
    };
    const deps = {
      i18n: EN_I18N,
      store,
      render: vi.fn(),
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
        groupview: {
          scrollItemIntoView: vi.fn(),
        },
        previewOverlay: {
          focus: vi.fn(),
        },
      },
    };

    handlePreviewOverlayTouchStart(deps, {
      _event: createTouchEvent({ x: 220, y: 120 }),
    });
    const leftSwipeEndEvent = createTouchEvent({
      x: 80,
      y: 132,
      changed: true,
    });
    handlePreviewOverlayTouchEnd(deps, {
      _event: leftSwipeEndEvent,
    });

    handlePreviewOverlayTouchStart(deps, {
      _event: createTouchEvent({ x: 80, y: 120 }),
    });
    const rightSwipeEndEvent = createTouchEvent({
      x: 220,
      y: 112,
      changed: true,
    });
    handlePreviewOverlayTouchEnd(deps, {
      _event: rightSwipeEndEvent,
    });

    expect(store.selectAdjacentImageItemId).toHaveBeenNthCalledWith(1, {
      itemId: "image-1",
      direction: "next",
    });
    expect(store.selectAdjacentImageItemId).toHaveBeenNthCalledWith(2, {
      itemId: "image-1",
      direction: "previous",
    });
    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-2",
      suppressMobileDetailSheet: true,
    });
    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-0",
      suppressMobileDetailSheet: true,
    });
    expect(store.suppressNextFullImagePreviewClick).toHaveBeenCalledTimes(2);
    expect(suppressNextClick).toBe(true);
    expect(leftSwipeEndEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(leftSwipeEndEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(rightSwipeEndEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(rightSwipeEndEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.refs.previewOverlay.focus).toHaveBeenCalledTimes(2);
  });

  it("ignores short and vertical preview swipes", () => {
    let touchStartPoint;
    const createTouchEvent = ({ x, y, changed = false }) => {
      const touch = { clientX: x, clientY: y };
      return {
        touches: changed ? [] : [touch],
        changedTouches: changed ? [touch] : [],
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
    };
    const store = {
      selectFullImagePreviewVisible: vi.fn(() => true),
      setFullImagePreviewTouchStartPoint: vi.fn((point) => {
        touchStartPoint = point;
      }),
      clearFullImagePreviewTouchStartPoint: vi.fn(() => {
        touchStartPoint = undefined;
      }),
      selectFullImagePreviewTouchStartPoint: vi.fn(() => touchStartPoint),
      clearFullImagePreviewSuppressNextClick: vi.fn(),
      suppressNextFullImagePreviewClick: vi.fn(),
      selectSelectedItemId: vi.fn(() => "image-1"),
      selectAdjacentImageItemId: vi.fn(),
    };
    const deps = {
      i18n: EN_I18N,
      store,
      render: vi.fn(),
      refs: {},
    };

    handlePreviewOverlayTouchStart(deps, {
      _event: createTouchEvent({ x: 120, y: 120 }),
    });
    const shortSwipeEndEvent = createTouchEvent({
      x: 150,
      y: 124,
      changed: true,
    });
    handlePreviewOverlayTouchEnd(deps, {
      _event: shortSwipeEndEvent,
    });

    handlePreviewOverlayTouchStart(deps, {
      _event: createTouchEvent({ x: 120, y: 120 }),
    });
    const verticalSwipeEndEvent = createTouchEvent({
      x: 190,
      y: 220,
      changed: true,
    });
    handlePreviewOverlayTouchEnd(deps, {
      _event: verticalSwipeEndEvent,
    });

    expect(store.selectAdjacentImageItemId).not.toHaveBeenCalled();
    expect(store.suppressNextFullImagePreviewClick).not.toHaveBeenCalled();
    expect(shortSwipeEndEvent.preventDefault).not.toHaveBeenCalled();
    expect(verticalSwipeEndEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("consumes the suppressed click after touch preview navigation", () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const deps = {
      i18n: EN_I18N,
      store: {
        selectFullImagePreviewSuppressNextClick: vi.fn(() => true),
        clearFullImagePreviewSuppressNextClick: vi.fn(),
        hideFullImagePreview: vi.fn(),
      },
      render: vi.fn(),
      refs: {
        fileExplorerKeyboardScope: {
          focus: vi.fn(),
        },
      },
    };

    handlePreviewOverlayClick(deps, {
      _event: event,
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(
      deps.store.clearFullImagePreviewSuppressNextClick,
    ).toHaveBeenCalled();
    expect(deps.store.hideFullImagePreview).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
  });

  it("ignores preview display mode shortcuts when preview is not visible", () => {
    const event = {
      key: "ArrowRight",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const deps = {
      i18n: EN_I18N,
      store: {
        selectFullImagePreviewVisible: vi.fn(() => false),
        setFullImagePreviewDisplayMode: vi.fn(),
        selectSelectedItemId: vi.fn(),
        selectAdjacentImageItemId: vi.fn(),
      },
      render: vi.fn(),
      refs: {},
    };

    handlePreviewOverlayKeyDown(deps, {
      _event: event,
    });

    expect(deps.store.selectSelectedItemId).not.toHaveBeenCalled();
    expect(deps.store.selectAdjacentImageItemId).not.toHaveBeenCalled();
    expect(deps.store.setFullImagePreviewDisplayMode).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});
