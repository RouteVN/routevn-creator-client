import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  handlePreviewOverlayKeyDown,
  handleItemDelete,
  handleUploadClick,
} from "../../src/pages/images/images.handlers.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

describe("images handlers", () => {
  beforeEach(() => {
    generateIdMock.mockClear();
    processPendingUploadsMock.mockReset();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
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

  it("uses left and right arrows to navigate preview items only while preview is visible", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const createEvent = (key) => ({
      key,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    const store = {
      getState: vi.fn(() => ({
        fullImagePreviewVisible: true,
      })),
      selectSelectedItemId: vi.fn(() => "image-1"),
      selectAdjacentImageItemId: vi.fn(({ direction }) => {
        return direction === "next" ? "image-2" : "image-0";
      }),
      selectImageItemById: vi.fn(({ itemId }) => ({
        id: itemId,
        type: "image",
        fileId: `${itemId}-file`,
      })),
      setSelectedItemId: vi.fn(),
      showFullImagePreview: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
        groupview: {
          scrollItemIntoView: vi.fn(),
        },
        previewOverlay: {
          focus: vi.fn(),
        },
      },
    };

    const rightEvent = createEvent("ArrowRight");
    handlePreviewOverlayKeyDown(deps, {
      _event: rightEvent,
    });

    expect(store.selectAdjacentImageItemId).toHaveBeenCalledWith({
      itemId: "image-1",
      direction: "next",
    });
    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-2",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "image-2",
    });
    expect(rightEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(rightEvent.stopPropagation).toHaveBeenCalledTimes(1);

    const leftEvent = createEvent("ArrowLeft");
    handlePreviewOverlayKeyDown(deps, {
      _event: leftEvent,
    });

    expect(store.selectAdjacentImageItemId).toHaveBeenCalledWith({
      itemId: "image-1",
      direction: "previous",
    });
    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-0",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "image-0",
    });
    expect(leftEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(leftEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.refs.previewOverlay.focus).toHaveBeenCalledTimes(2);
  });

  it("ignores left and right preview navigation when preview is not visible", () => {
    const event = {
      key: "ArrowRight",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const deps = {
      store: {
        getState: vi.fn(() => ({
          fullImagePreviewVisible: false,
        })),
        selectSelectedItemId: vi.fn(),
        selectAdjacentImageItemId: vi.fn(),
      },
      render: vi.fn(),
      refs: {},
    };

    handlePreviewOverlayKeyDown(deps, {
      _event: event,
    });

    expect(deps.store.selectSelectedItemId).not.toHaveBeenCalled();
    expect(deps.store.selectAdjacentImageItemId).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});
