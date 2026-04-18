import { beforeEach, describe, expect, it, vi } from "vitest";

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
  handleItemDelete,
  handleUploadClick,
} from "../../src/pages/images/images.handlers.js";

describe("images handlers", () => {
  beforeEach(() => {
    generateIdMock.mockClear();
    processPendingUploadsMock.mockReset();
  });

  it("shows a failure alert when deleteImageIfUnused fails without usage", async () => {
    const deps = {
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
      render: vi.fn(),
    };

    await handleItemDelete(deps, {
      _event: {
        detail: {
          itemId: "image-1",
        },
      },
    });

    expect(deps.projectService.deleteImageIfUnused).toHaveBeenCalledWith({
      imageId: "image-1",
      checkTargets: ["scenes", "layouts"],
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
        setItems: vi.fn(),
        setSelectedItemId: vi.fn(),
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
          },
        },
      },
    });
  });
});
