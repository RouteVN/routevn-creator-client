import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaPageHandlers } from "../../src/internal/ui/resourcePages/media/createMediaPageHandlers.js";
import { handleEditFormAction as handleFontEditFormAction } from "../../src/pages/fonts/fonts.handlers.js";
import { handleEditFormAction as handleImageEditFormAction } from "../../src/pages/images/images.handlers.js";
import { handleEditFormAction as handleSoundEditFormAction } from "../../src/pages/sounds/sounds.handlers.js";
import { handleEditFormAction as handleVideoEditFormAction } from "../../src/pages/videos/videos.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

describe("media edit dialog close", () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("restores the media keyboard scope after closing", () => {
    globalThis.requestAnimationFrame = (callback) => {
      callback();
      return 1;
    };
    const { handleEditDialogClose } = createMediaPageHandlers({
      resourceType: "images",
    });
    const deps = {
      store: {
        closeEditDialog: vi.fn(),
      },
      refs: {
        fileExplorerKeyboardScope: {
          focus: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleEditDialogClose(deps);

    expect(deps.store.closeEditDialog).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
    expect(deps.refs.fileExplorerKeyboardScope.focus).toHaveBeenCalledOnce();
  });

  it("restores the media keyboard scope after closing the folder dialog", () => {
    globalThis.requestAnimationFrame = (callback) => {
      callback();
      return 1;
    };
    const { handleFolderNameDialogClose } = createMediaPageHandlers({
      resourceType: "images",
    });
    const deps = {
      store: {
        closeFolderNameDialog: vi.fn(),
      },
      refs: {
        fileExplorerKeyboardScope: {
          focus: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleFolderNameDialogClose(deps);

    expect(deps.store.closeFolderNameDialog).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
    expect(deps.refs.fileExplorerKeyboardScope.focus).toHaveBeenCalledOnce();
  });

  it("restores the media keyboard scope after submitting the folder dialog", async () => {
    globalThis.requestAnimationFrame = (callback) => {
      callback();
      return 1;
    };
    const repositoryState = {
      images: {
        tree: [{ id: "folder-1" }],
        items: {
          "folder-1": {
            id: "folder-1",
            type: "folder",
            name: "Renamed",
          },
        },
      },
    };
    const { handleFolderNameFormAction } = createMediaPageHandlers({
      resourceType: "images",
      syncData: vi.fn(),
    });
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        ensureRepository: vi.fn(),
        getState: vi.fn(() => repositoryState),
        getRepositoryState: vi.fn(() => repositoryState),
        updateImage: vi.fn(async () => ({ valid: true })),
      },
      store: {
        selectFolderNameDialogItemId: vi.fn(() => "folder-1"),
        closeFolderNameDialog: vi.fn(),
        setSelectedFolderId: vi.fn(),
      },
      refs: {
        fileExplorerKeyboardScope: {
          focus: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    await handleFolderNameFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Renamed",
            description: "Updated folder",
          },
        },
      },
    });

    expect(deps.projectService.updateImage).toHaveBeenCalledWith({
      imageId: "folder-1",
      data: {
        name: "Renamed",
        description: "Updated folder",
      },
    });
    expect(deps.store.closeFolderNameDialog).toHaveBeenCalledOnce();
    expect(deps.refs.fileExplorerKeyboardScope.focus).toHaveBeenCalledOnce();
  });

  it.each([
    ["fonts", "font", handleFontEditFormAction, "updateFont"],
    ["images", "image", handleImageEditFormAction, "updateImage"],
    ["sounds", "sound", handleSoundEditFormAction, "updateSound"],
    ["videos", "video", handleVideoEditFormAction, "updateVideo"],
  ])(
    "restores the media keyboard scope after submitting the %s edit dialog",
    async (resourceType, itemType, handleEditFormAction, updateMethod) => {
      globalThis.requestAnimationFrame = (callback) => {
        callback();
        return 1;
      };
      const itemId = `${itemType}-1`;
      const repositoryState = {
        files: {
          tree: [],
          items: {},
        },
        [resourceType]: {
          tree: [{ id: itemId }],
          items: {
            [itemId]: {
              id: itemId,
              type: itemType,
              name: "Renamed",
            },
          },
        },
      };
      const updateResource = vi.fn(async () => ({ valid: true }));
      const deps = {
        i18n: EN_I18N,
        appService: {
          showAlert: vi.fn(),
        },
        projectService: {
          [updateMethod]: updateResource,
          getState: vi.fn(() => repositoryState),
          getRepositoryState: vi.fn(() => repositoryState),
        },
        store: {
          selectEditItemId: vi.fn(() => itemId),
          selectEditUploadResult: vi.fn(() => undefined),
          closeEditDialog: vi.fn(),
          setItems: vi.fn(),
          setProjectResolution: vi.fn(),
          setTagsData: vi.fn(),
        },
        refs: {
          fileExplorerKeyboardScope: {
            focus: vi.fn(),
          },
        },
        render: vi.fn(),
      };

      await handleEditFormAction(deps, {
        _event: {
          detail: {
            actionId: "submit",
            values: {
              name: "Renamed",
              description: "Updated resource",
              tagIds: [],
            },
          },
        },
      });

      expect(updateResource).toHaveBeenCalledOnce();
      expect(deps.store.closeEditDialog).toHaveBeenCalledOnce();
      expect(deps.refs.fileExplorerKeyboardScope.focus).toHaveBeenCalledOnce();
    },
  );

  it("opens the selected folder dialog when e is pressed", () => {
    const { handleFileExplorerKeyboardScopeKeyDown } = createMediaPageHandlers({
      resourceType: "sounds",
    });
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => undefined),
        selectFolderById: vi.fn(() => ({
          id: "folder-1",
          name: "BGM",
          description: "Background music",
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
        name: "BGM",
        description: "Background music",
      },
    });
    expect(deps.refs.folderNameForm.reset).toHaveBeenCalledOnce();
    expect(deps.refs.folderNameForm.setValues).toHaveBeenCalledWith({
      values: {
        name: "BGM",
        description: "Background music",
      },
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("uses the stored media selection after the explorer rerenders", () => {
    const { handleFileExplorerKeyboardScopeKeyDown } = createMediaPageHandlers({
      resourceType: "videos",
      selectItemById: () => ({
        id: "video-1",
        name: "Opening",
        description: "Opening movie",
        tagIds: [],
      }),
    });
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => "video-1"),
        setSelectedItemId: vi.fn(),
        openEditDialog: vi.fn(),
      },
      refs: {
        fileExplorer: {
          getSelectedItem: vi.fn(() => undefined),
          selectItem: vi.fn(),
        },
        editForm: {
          reset: vi.fn(),
          setValues: vi.fn(),
        },
      },
      render: vi.fn(),
    };
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

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
      itemId: "video-1",
      defaultValues: {
        name: "Opening",
        description: "Opening movie",
      },
      previewFileId: undefined,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });
});
