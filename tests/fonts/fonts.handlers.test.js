import { describe, expect, it, vi } from "vitest";
import { handleDataChanged } from "../../src/pages/fonts/fonts.handlers.js";

describe("fonts handlers", () => {
  it("hydrates font file metadata from repository files on refresh", async () => {
    const repositoryState = {
      files: {
        tree: [],
        items: {
          "file-1": {
            id: "file-1",
            mimeType: "font/woff2",
            size: 2048,
          },
        },
      },
      fonts: {
        tree: [{ id: "font-1" }],
        items: {
          "font-1": {
            id: "font-1",
            type: "font",
            name: "Inter",
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
        tree: [{ id: "font-1" }],
        items: {
          "font-1": {
            id: "font-1",
            type: "font",
            name: "Inter",
            fileId: "file-1",
            fileType: "font/woff2",
            fileSize: 2048,
            resolvedTags: [],
          },
        },
      },
    });
  });
});
