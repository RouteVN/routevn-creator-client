import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleDataChanged,
  handleEditDialogVideoClick,
  handleEditFormAction,
  handleFileExplorerKeyboardScopeKeyDown,
  handleOutsideVideoClick,
} from "../../src/pages/videos/videos.handlers.js";
import { EN_I18N, FR_I18N } from "../support/i18n.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

describe("videos handlers", () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("pauses playback before closing the preview", () => {
    const calls = [];
    handleOutsideVideoClick({
      refs: {
        videoPreviewElement: {
          tagName: "VIDEO",
          pause: () => calls.push("pause"),
        },
      },
      store: { setVideoNotVisible: () => calls.push("close") },
      render: () => calls.push("render"),
    });

    expect(calls).toEqual(["pause", "close", "render"]);
  });

  it("explains an upload that saved no file in the app language", async () => {
    const appService = {
      pickFiles: vi.fn(async () => ({ name: "clip.mp4" })),
      showAlert: vi.fn(),
      getAppCopy: () => FR_I18N.appPage,
    };

    await handleEditDialogVideoClick({
      appService,
      projectService: { uploadFiles: vi.fn(async () => []) },
      store: {},
      render: vi.fn(),
      i18n: FR_I18N,
    });

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: FR_I18N.videosPage.failedUploadVideo,
      title: FR_I18N.appPage.errorTitle,
    });
  });

  it("can close the preview while its video is still loading", () => {
    const store = { setVideoNotVisible: vi.fn() };
    const render = vi.fn();
    handleOutsideVideoClick({ refs: {}, store, render });

    expect(store.setVideoNotVisible).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("hydrates video file metadata from repository files on refresh", async () => {
    const repositoryState = {
      files: {
        tree: [],
        items: {
          "file-1": {
            id: "file-1",
            mimeType: "video/mp4",
            size: 2048,
          },
        },
      },
      videos: {
        tree: [{ id: "video-1" }],
        items: {
          "video-1": {
            id: "video-1",
            type: "video",
            name: "Intro",
            fileId: "file-1",
          },
        },
      },
    };
    const deps = {
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
        tree: [{ id: "video-1" }],
        items: {
          "video-1": {
            id: "video-1",
            type: "video",
            name: "Intro",
            fileId: "file-1",
            fileType: "video/mp4",
            fileSize: 2048,
            resolvedTags: [],
          },
        },
      },
    });
  });

  it("opens the selected video preview when Enter is pressed", async () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => "video-1"),
        selectVideoItemById: vi.fn(() => ({
          id: "video-1",
          fileId: "video-file-1",
          fileType: "video/mp4",
        })),
        setVideoVisible: vi.fn(),
      },
      refs: {
        fileExplorer: {
          getSelectedItem: vi.fn(() => ({
            itemId: "video-1",
            isFolder: false,
          })),
        },
      },
      projectService: {
        getFileContent: vi.fn(async () => ({ url: "blob:video-1" })),
      },
      render: vi.fn(),
    };

    handleFileExplorerKeyboardScopeKeyDown(deps, {
      _event: {
        key: "Enter",
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault,
        stopPropagation,
      },
    });

    await vi.waitFor(() => {
      expect(deps.store.setVideoVisible).toHaveBeenCalledWith({
        video: {
          url: "blob:video-1",
          fileType: "video/mp4",
          autoplay: true,
          muted: false,
        },
      });
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("opens the selected video edit dialog when e is pressed", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => "video-1"),
        selectVideoItemById: vi.fn(() => ({
          id: "video-1",
          name: "Opening",
          description: "Opening movie",
          tagIds: ["tag-1"],
          thumbnailFileId: "thumbnail-1",
        })),
        setSelectedItemId: vi.fn(),
        openEditDialog: vi.fn(),
      },
      refs: {
        fileExplorer: {
          getSelectedItem: vi.fn(() => ({
            itemId: "video-1",
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
      itemId: "video-1",
      defaultValues: {
        name: "Opening",
        description: "Opening movie",
        tagIds: ["tag-1"],
      },
      previewFileId: "thumbnail-1",
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("keeps the typed name when the edit dialog replaces the video file", async () => {
    globalThis.requestAnimationFrame = (callback) => {
      callback();
      return 1;
    };
    const updateVideo = vi.fn(async () => ({}));
    const deps = {
      i18n: EN_I18N,
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        updateVideo,
        getRepositoryState: () => ({
          videos: {
            items: {},
            tree: [],
          },
          files: {
            items: {},
            tree: [],
          },
        }),
      },
      store: {
        selectEditItemId: vi.fn(() => "video-1"),
        selectEditUploadResult: vi.fn(() => ({
          fileId: "video-file-2",
          thumbnailFileId: "thumbnail-2",
          displayName: "replacement",
          duration: 12,
          dimensions: {
            width: 1920,
            height: 1080,
          },
          fileRecords: [],
        })),
        closeEditDialog: vi.fn(),
        setTagsData: vi.fn(),
        setItems: vi.fn(),
      },
      refs: {},
      render: vi.fn(),
    };

    await handleEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Opening",
            description: "Opening movie",
            tagIds: ["tag-1"],
          },
        },
      },
    });

    expect(deps.appService.showAlert).not.toHaveBeenCalled();
    expect(updateVideo).toHaveBeenCalledWith({
      videoId: "video-1",
      fileRecords: [],
      data: {
        fileId: "video-file-2",
        thumbnailFileId: "thumbnail-2",
        name: "Opening",
        duration: 12,
        width: 1920,
        height: 1080,
        description: "Opening movie",
        tagIds: ["tag-1"],
      },
    });
  });
});
