import { describe, expect, it, vi } from "vitest";
import { createResourceFileExplorerHandlers } from "../../src/internal/ui/fileExplorer.js";

describe("images file explorer", () => {
  it("creates a child folder and refreshes with it selected", async () => {
    const refresh = vi.fn(async () => {});
    const createImage = vi.fn(async () => "folder-copy");
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        getState: () => ({
          images: {
            items: {
              "folder-1": {
                id: "folder-1",
                type: "folder",
                name: "Folder One",
              },
            },
          },
        }),
        createImage,
      },
    };
    const handlers = createResourceFileExplorerHandlers({
      resourceType: "images",
      refresh,
    });

    await handlers.handleFileExplorerAction(deps, {
      _event: {
        detail: {
          itemId: "folder-1",
          item: {
            value: "new-child-folder",
          },
        },
      },
    });

    expect(createImage).toHaveBeenCalledWith({
      imageId: expect.any(String),
      data: {
        type: "folder",
        name: "New Folder",
      },
      parentId: "folder-1",
      position: "last",
    });
    expect(refresh).toHaveBeenCalledWith(deps, {
      selectedItemId: "folder-copy",
    });
  });

  it("blocks deleting an in-use image via project usage checks", async () => {
    const refresh = vi.fn(async () => {});
    const deleteImages = vi.fn(async () => ({ valid: true }));
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        getState: () => ({
          images: {
            items: {
              "image-1": {
                id: "image-1",
                type: "image",
                name: "Hero",
              },
            },
          },
        }),
        checkResourceUsage: vi.fn(async () => ({
          isUsed: true,
          count: 1,
          inProps: {
            scenes: [{ property: "bgmId" }],
          },
        })),
        deleteImages,
      },
    };
    const handlers = createResourceFileExplorerHandlers({
      resourceType: "images",
      refresh,
    });

    await handlers.handleFileExplorerAction(deps, {
      _event: {
        detail: {
          itemId: "image-1",
          item: {
            value: "delete-item",
          },
        },
      },
    });

    expect(deps.projectService.checkResourceUsage).toHaveBeenCalledWith({
      itemId: "image-1",
      checkTargets: ["scenes", "layouts", "controls"],
    });
    expect(deleteImages).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Cannot delete resource, it is currently in use.",
    });
  });

  it("refreshes after drag reorder without changing page selection", async () => {
    const refresh = vi.fn(async () => {});
    const moveImage = vi.fn(async () => {});
    const deps = {
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        moveImage,
      },
    };
    const handlers = createResourceFileExplorerHandlers({
      resourceType: "images",
      refresh,
    });

    await handlers.handleFileExplorerTargetChanged(deps, {
      _event: {
        detail: {
          source: {
            id: "image-1",
          },
          target: {
            id: "image-2",
            parentId: "folder-1",
          },
          position: "below",
        },
      },
    });

    expect(moveImage).toHaveBeenCalledWith({
      imageId: "image-1",
      parentId: "folder-1",
      position: "after",
      positionTargetId: "image-2",
    });
    expect(refresh).toHaveBeenCalledWith(deps);
  });
});
