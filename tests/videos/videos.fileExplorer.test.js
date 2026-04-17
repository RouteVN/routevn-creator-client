import { describe, expect, it, vi } from "vitest";
import { createResourceFileExplorerHandlers } from "../../src/internal/ui/fileExplorer.js";

describe("videos file explorer", () => {
  it("refreshes after deleting a folder", async () => {
    const refresh = vi.fn(async () => {});
    const deleteVideos = vi.fn(async () => ({ valid: true }));
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        getState: () => ({
          videos: {
            items: {
              "folder-1": {
                id: "folder-1",
                type: "folder",
                name: "Folder One",
              },
            },
          },
        }),
        deleteVideos,
      },
    };
    const handlers = createResourceFileExplorerHandlers({
      resourceType: "videos",
      refresh,
    });

    await handlers.handleFileExplorerAction(deps, {
      _event: {
        detail: {
          itemId: "folder-1",
          item: {
            value: "delete-item",
          },
        },
      },
    });

    expect(deleteVideos).toHaveBeenCalledWith({
      videoIds: ["folder-1"],
    });
    expect(refresh).toHaveBeenCalledWith(deps, {
      deletedItemId: "folder-1",
    });
  });
});
