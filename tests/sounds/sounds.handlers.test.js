import { describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  handleDataChanged,
  handleItemDelete,
  handleMobileDeleteDialogCancel,
  handleMobileDeleteDialogConfirm,
  handleMobileDetailDeleteClick,
  handleMobileDetailPlayClick,
  handleSoundItemPreview,
} from "../../src/pages/sounds/sounds.handlers.js";

describe("sounds handlers", () => {
  it("hydrates sound file metadata from repository files on refresh", async () => {
    const repositoryState = {
      files: {
        tree: [],
        items: {
          "file-1": {
            id: "file-1",
            mimeType: "audio/ogg",
            size: 4096,
          },
        },
      },
      sounds: {
        tree: [{ id: "sound-1" }],
        items: {
          "sound-1": {
            id: "sound-1",
            type: "sound",
            name: "Theme",
            fileId: "file-1",
          },
        },
      },
    };
    const deps = {
      i18n: EN_I18N,
      projectService: {
        getState: () => repositoryState,
      },
      store: {
        setTagsData: vi.fn(),
        setItems: vi.fn(),
        setSelectedItemId: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    await handleDataChanged(deps);

    expect(deps.store.setItems).toHaveBeenCalledWith({
      data: {
        tree: [{ id: "sound-1" }],
        items: {
          "sound-1": {
            id: "sound-1",
            type: "sound",
            name: "Theme",
            fileId: "file-1",
            fileType: "audio/ogg",
            fileSize: 4096,
            resolvedTags: [],
          },
        },
      },
    });
  });

  it("plays mobile long-press previews without opening the detail sheet", () => {
    const deps = {
      i18n: EN_I18N,
      store: {
        selectSoundItemById: vi.fn(({ itemId }) => ({
          id: itemId,
          type: "sound",
          name: "Theme",
          fileId: "sound-file-1",
        })),
        setSelectedItemId: vi.fn(),
        openAudioPlayer: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleSoundItemPreview(deps, {
      _event: {
        detail: {
          itemId: "sound-1",
          source: "mobile-context-menu",
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "sound-1",
      suppressMobileDetailSheet: true,
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "sound-1",
    });
    expect(deps.store.openAudioPlayer).toHaveBeenCalledWith({
      fileId: "sound-file-1",
      fileName: "Theme",
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("plays selected mobile detail sounds", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const deps = {
      i18n: EN_I18N,
      store: {
        selectSelectedItemId: vi.fn(() => "sound-1"),
        selectSoundItemById: vi.fn(({ itemId }) => ({
          id: itemId,
          type: "sound",
          name: "Theme",
          fileId: "sound-file-1",
        })),
        setSelectedItemId: vi.fn(),
        openAudioPlayer: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleMobileDetailPlayClick(deps, {
      _event: {
        preventDefault,
        stopPropagation,
      },
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "sound-1",
      suppressMobileDetailSheet: true,
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "sound-1",
    });
    expect(deps.store.openAudioPlayer).toHaveBeenCalledWith({
      fileId: "sound-file-1",
      fileName: "Theme",
    });
  });

  it("opens a confirmation dialog for selected mobile detail sound deletes", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const deps = {
      i18n: EN_I18N,
      store: {
        selectSelectedItemId: vi.fn(() => "sound-1"),
        openMobileDeleteDialog: vi.fn(),
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
    expect(deps.store.openMobileDeleteDialog).toHaveBeenCalledWith({
      itemId: "sound-1",
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("cancels selected mobile detail sound deletes without deleting", () => {
    const deps = {
      i18n: EN_I18N,
      projectService: {
        deleteSoundIfUnused: vi.fn(),
      },
      store: {
        closeMobileDeleteDialog: vi.fn(),
      },
      render: vi.fn(),
    };

    handleMobileDeleteDialogCancel(deps);

    expect(deps.store.closeMobileDeleteDialog).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.projectService.deleteSoundIfUnused).not.toHaveBeenCalled();
  });

  it("deletes confirmed mobile detail sounds and clears the selection", async () => {
    const repositoryState = {
      sounds: {
        tree: [],
        items: {},
      },
      files: {
        tree: [],
        items: {},
      },
      tags: {},
    };
    let selectedItemId = "sound-1";
    const deps = {
      i18n: EN_I18N,
      projectService: {
        deleteSoundIfUnused: vi.fn(async () => ({
          deleted: true,
        })),
        getRepositoryState: vi.fn(() => repositoryState),
      },
      appService: {
        showAlert: vi.fn(),
      },
      store: {
        selectMobileDeleteDialogItemId: vi.fn(() => "sound-1"),
        closeMobileDeleteDialog: vi.fn(),
        selectSelectedItemId: vi.fn(() => selectedItemId),
        setSelectedItemId: vi.fn(({ itemId }) => {
          selectedItemId = itemId;
        }),
        setTagsData: vi.fn(),
        setItems: vi.fn(),
      },
      render: vi.fn(),
      refs: {},
    };

    await handleMobileDeleteDialogConfirm(deps);

    expect(deps.store.closeMobileDeleteDialog).toHaveBeenCalledTimes(1);
    expect(deps.projectService.deleteSoundIfUnused).toHaveBeenCalledWith({
      soundId: "sound-1",
      checkTargets: ["scenes", "layouts"],
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(selectedItemId).toBeUndefined();
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("shows a failure alert when deleteSoundIfUnused fails without usage", async () => {
    const deps = {
      i18n: EN_I18N,
      projectService: {
        deleteSoundIfUnused: vi.fn(async () => ({
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
        selectSelectedItemId: vi.fn(() => "sound-1"),
      },
      render: vi.fn(),
    };

    await handleItemDelete(deps, {
      _event: {
        detail: {
          itemId: "sound-1",
        },
      },
    });

    expect(deps.projectService.deleteSoundIfUnused).toHaveBeenCalledWith({
      soundId: "sound-1",
      checkTargets: ["scenes", "layouts"],
    });
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Failed to delete resource.",
    });
    expect(deps.render).toHaveBeenCalled();
  });
});
