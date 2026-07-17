import { describe, expect, it, vi } from "vitest";
import {
  handleDataChanged,
  handleFileExplorerKeyboardScopeKeyDown,
} from "../../src/pages/videos/videos.handlers.js";

describe("videos handlers", () => {
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
});
