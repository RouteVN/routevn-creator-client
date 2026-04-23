import { describe, expect, it, vi } from "vitest";
import { handleDataChanged } from "../../src/pages/videos/videos.handlers.js";

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
});
