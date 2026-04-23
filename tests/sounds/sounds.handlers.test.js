import { describe, expect, it, vi } from "vitest";
import { handleDataChanged } from "../../src/pages/sounds/sounds.handlers.js";

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
});
