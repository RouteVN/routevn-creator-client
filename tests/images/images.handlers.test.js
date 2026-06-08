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
  handleCreateTagFormAction,
  handleCreateTagDialogClose,
  handleDetailTagAddOptionClick,
  handleDetailTagValueChange,
  handlePreviewCanvasModeClick,
  handlePreviewFitModeClick,
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
        setTagsData: vi.fn(),
        setItems: vi.fn(),
        setProjectResolution: vi.fn(),
        setSelectedItemId: vi.fn(),
        setSelectedFolderId: vi.fn(),
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
            resolvedTags: [],
          },
        },
      },
    });
  });

  it("creates and assigns a new tag from the detail-panel flow", async () => {
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        createTag: vi.fn(async () => ({ valid: true })),
        updateImage: vi.fn(async () => ({ valid: true })),
        getRepositoryState: vi.fn(() => ({
          files: { items: {}, tree: [] },
          images: {
            tree: [],
            items: {
              "image-1": {
                id: "image-1",
                type: "image",
                name: "Hero",
                tagIds: [],
              },
            },
          },
          tags: {
            images: {
              tree: [{ id: "image-tag-1" }],
              items: {
                "image-tag-1": {
                  id: "image-tag-1",
                  type: "tag",
                  name: "Background",
                },
              },
            },
          },
        })),
        subscribeProjectState: vi.fn(() => () => {}),
      },
      store: {
        getState: vi.fn(() => ({
          createTagContext: {
            mode: "item",
            itemId: "image-1",
            draftTagIds: [],
          },
          tagsData: {
            tree: [{ id: "image-tag-1" }],
            items: {
              "image-tag-1": {
                id: "image-tag-1",
                type: "tag",
                name: "Background",
              },
            },
          },
          detailTagIds: [],
        })),
        closeCreateTagDialog: vi.fn(),
        setTagsData: vi.fn(),
        setItems: vi.fn(),
        setProjectResolution: vi.fn(),
        setDetailTagIds: vi.fn(),
        setDetailTagPopoverOpen: vi.fn(),
        selectSelectedItemId: vi.fn(() => "image-1"),
        selectImageItemById: vi.fn(({ itemId }) => ({
          id: itemId,
          type: "image",
          name: "Hero",
          tagIds: [],
        })),
      },
      refs: {
        editForm: {
          getValues: vi.fn(() => ({})),
          setValues: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    await handleCreateTagFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Background",
          },
        },
      },
    });

    expect(deps.projectService.createTag).toHaveBeenCalledWith({
      scopeKey: "images",
      tagId: "image-123",
      data: {
        type: "tag",
        name: "Background",
      },
    });
    expect(deps.store.setItems).not.toHaveBeenCalled();
    expect(deps.store.setTagsData).toHaveBeenCalledWith({
      tagsData: {
        tree: [{ id: "image-tag-1" }, { id: "image-123" }],
        items: {
          "image-tag-1": {
            id: "image-tag-1",
            type: "tag",
            name: "Background",
          },
          "image-123": {
            id: "image-123",
            type: "tag",
            name: "Background",
          },
        },
      },
    });
    expect(deps.store.setDetailTagIds).toHaveBeenCalledWith({
      tagIds: ["image-123"],
    });
    expect(deps.store.setDetailTagPopoverOpen).toHaveBeenCalledWith({
      open: true,
    });
    expect(deps.projectService.updateImage).not.toHaveBeenCalled();
  });

  it("closes the detail tag popover before opening the create tag dialog", () => {
    const deps = {
      store: {
        getState: vi.fn(() => ({
          detailTagIds: ["image-tag-1"],
        })),
        openCreateTagDialog: vi.fn(),
        setDetailTagPopoverOpen: vi.fn(),
        selectSelectedItemId: vi.fn(() => "image-1"),
        selectImageItemById: vi.fn(() => ({
          id: "image-1",
          type: "image",
          tagIds: ["image-tag-1"],
        })),
      },
      render: vi.fn(),
    };

    handleDetailTagAddOptionClick(deps);

    expect(deps.store.openCreateTagDialog).toHaveBeenCalledWith({
      mode: "item",
      itemId: "image-1",
      draftTagIds: ["image-tag-1"],
    });
    expect(deps.store.setDetailTagPopoverOpen).toHaveBeenCalledWith({
      open: false,
      item: {
        tagIds: [],
      },
    });
    expect(deps.render).toHaveBeenCalled();
  });

  it("reopens the detail tag popover when the create tag dialog closes", () => {
    const deps = {
      store: {
        getState: vi.fn(() => ({
          createTagContext: {
            mode: "item",
            itemId: "image-1",
            draftTagIds: ["image-tag-1"],
          },
        })),
        closeCreateTagDialog: vi.fn(),
        setDetailTagIds: vi.fn(),
        setDetailTagPopoverOpen: vi.fn(),
        selectSelectedItemId: vi.fn(() => "image-1"),
      },
      render: vi.fn(),
    };

    handleCreateTagDialogClose(deps);

    expect(deps.store.closeCreateTagDialog).toHaveBeenCalled();
    expect(deps.store.setDetailTagIds).toHaveBeenCalledWith({
      tagIds: ["image-tag-1"],
    });
    expect(deps.store.setDetailTagPopoverOpen).toHaveBeenCalledWith({
      open: true,
    });
    expect(deps.render).toHaveBeenCalled();
  });

  it("updates image tags directly from the detail-panel tag selector", async () => {
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        updateImage: vi.fn(async () => ({ valid: true })),
        getRepositoryState: vi.fn(() => ({
          files: { items: {}, tree: [] },
          images: {
            tree: [],
            items: {
              "image-1": {
                id: "image-1",
                type: "image",
                name: "Hero",
                tagIds: ["tag-1"],
              },
            },
          },
          tags: {
            images: {
              tree: [{ id: "tag-1" }, { id: "tag-2" }],
              items: {
                "tag-1": {
                  id: "tag-1",
                  type: "tag",
                  name: "Old",
                },
                "tag-2": {
                  id: "tag-2",
                  type: "tag",
                  name: "New",
                },
              },
            },
          },
        })),
        subscribeProjectState: vi.fn(() => () => {}),
      },
      store: {
        selectSelectedItemId: vi.fn(() => "image-1"),
        commitDetailTagIds: vi.fn(),
        setTagsData: vi.fn(),
        setItems: vi.fn(),
        setProjectResolution: vi.fn(),
        setSelectedItemId: vi.fn(),
        setSelectedFolderId: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    await handleDetailTagValueChange(deps, {
      _event: {
        detail: {
          value: ["tag-1", "tag-2"],
        },
      },
    });

    expect(deps.projectService.updateImage).toHaveBeenCalledWith({
      imageId: "image-1",
      data: {
        tagIds: ["tag-1", "tag-2"],
      },
    });
    expect(deps.store.commitDetailTagIds).toHaveBeenCalledWith({
      tagIds: ["tag-1", "tag-2"],
    });
  });

  it("uses left and right arrows to switch preview display modes", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const createEvent = (key, overrides = {}) => ({
      key,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...overrides,
    });
    const store = {
      selectFullImagePreviewVisible: vi.fn(() => true),
      setFullImagePreviewDisplayMode: vi.fn(),
      selectAdjacentImageItemId: vi.fn(),
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

    expect(store.setFullImagePreviewDisplayMode).toHaveBeenCalledWith({
      displayMode: "fit",
    });
    expect(store.selectAdjacentImageItemId).not.toHaveBeenCalled();
    expect(rightEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(rightEvent.stopPropagation).toHaveBeenCalledTimes(1);

    const leftEvent = createEvent("ArrowLeft");
    handlePreviewOverlayKeyDown(deps, {
      _event: leftEvent,
    });

    expect(store.setFullImagePreviewDisplayMode).toHaveBeenCalledWith({
      displayMode: "canvas",
    });
    expect(leftEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(leftEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(2);
    expect(deps.refs.previewOverlay.focus).toHaveBeenCalledTimes(2);
  });

  it("switches full image preview display modes from the overlay controls", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const createClickEvent = () => ({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    const store = {
      setFullImagePreviewDisplayMode: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      refs: {
        previewOverlay: {
          focus: vi.fn(),
        },
      },
    };

    const canvasEvent = createClickEvent();
    handlePreviewCanvasModeClick(deps, {
      _event: canvasEvent,
    });

    expect(store.setFullImagePreviewDisplayMode).toHaveBeenCalledWith({
      displayMode: "canvas",
    });
    expect(canvasEvent.preventDefault).toHaveBeenCalledOnce();
    expect(canvasEvent.stopPropagation).toHaveBeenCalledOnce();

    const fitEvent = createClickEvent();
    handlePreviewFitModeClick(deps, {
      _event: fitEvent,
    });

    expect(store.setFullImagePreviewDisplayMode).toHaveBeenCalledWith({
      displayMode: "fit",
    });
    expect(fitEvent.preventDefault).toHaveBeenCalledOnce();
    expect(fitEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledTimes(2);
    expect(deps.refs.previewOverlay.focus).toHaveBeenCalledTimes(2);
  });

  it("does not use tab as a full image preview shortcut", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const event = {
      key: "Tab",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const store = {
      selectFullImagePreviewVisible: vi.fn(() => true),
      setFullImagePreviewDisplayMode: vi.fn(),
      selectSelectedItemId: vi.fn(),
      selectAdjacentImageItemId: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      refs: {
        previewOverlay: {
          focus: vi.fn(),
        },
      },
    };

    handlePreviewOverlayKeyDown(deps, {
      _event: event,
    });

    expect(store.setFullImagePreviewDisplayMode).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.refs.previewOverlay.focus).not.toHaveBeenCalled();
    expect(store.selectAdjacentImageItemId).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("uses j and k to navigate, and h and l to switch display modes", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const createEvent = (key, overrides = {}) => ({
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...overrides,
    });
    const store = {
      selectFullImagePreviewVisible: vi.fn(() => true),
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
      setFullImagePreviewDisplayMode: vi.fn(),
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

    for (const key of ["j"]) {
      handlePreviewOverlayKeyDown(deps, {
        _event: createEvent(key),
      });
    }

    for (const key of ["k"]) {
      handlePreviewOverlayKeyDown(deps, {
        _event: createEvent(key),
      });
    }

    expect(store.selectAdjacentImageItemId).toHaveBeenNthCalledWith(1, {
      itemId: "image-1",
      direction: "next",
    });
    expect(store.selectAdjacentImageItemId).toHaveBeenNthCalledWith(2, {
      itemId: "image-1",
      direction: "previous",
    });

    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("h"),
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("l"),
    });

    expect(store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(1, {
      displayMode: "canvas",
    });
    expect(store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(2, {
      displayMode: "fit",
    });
    expect(store.selectAdjacentImageItemId).toHaveBeenCalledTimes(2);

    const inputEvent = createEvent("j", {
      target: {
        tagName: "INPUT",
      },
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: inputEvent,
    });

    expect(store.selectAdjacentImageItemId).toHaveBeenCalledTimes(2);
    expect(inputEvent.preventDefault).not.toHaveBeenCalled();
    expect(inputEvent.stopPropagation).not.toHaveBeenCalled();
  });

  it("uses ctrl+d and ctrl+u to jump preview items by ten", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const createEvent = (key, overrides = {}) => ({
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...overrides,
    });
    const store = {
      selectFullImagePreviewVisible: vi.fn(() => true),
      selectSelectedItemId: vi.fn(() => "image-11"),
      selectAdjacentImageItemId: vi.fn(({ direction }) => {
        return direction === "next" ? "image-21" : "image-1";
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

    const downEvent = createEvent("d", {
      ctrlKey: true,
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: downEvent,
    });

    expect(store.selectAdjacentImageItemId).toHaveBeenNthCalledWith(1, {
      itemId: "image-11",
      direction: "next",
      distance: 10,
      clamp: true,
    });
    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-21",
    });
    expect(downEvent.preventDefault).toHaveBeenCalledTimes(1);

    const upEvent = createEvent("u", {
      ctrlKey: true,
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: upEvent,
    });

    expect(store.selectAdjacentImageItemId).toHaveBeenNthCalledWith(2, {
      itemId: "image-11",
      direction: "previous",
      distance: 10,
      clamp: true,
    });
    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-1",
    });
    expect(upEvent.preventDefault).toHaveBeenCalledTimes(1);

    const inputEvent = createEvent("d", {
      ctrlKey: true,
      target: {
        tagName: "INPUT",
      },
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: inputEvent,
    });

    expect(store.selectAdjacentImageItemId).toHaveBeenCalledTimes(2);
    expect(inputEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("ignores preview display mode shortcuts when preview is not visible", () => {
    const event = {
      key: "ArrowRight",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const deps = {
      store: {
        selectFullImagePreviewVisible: vi.fn(() => false),
        setFullImagePreviewDisplayMode: vi.fn(),
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
    expect(deps.store.setFullImagePreviewDisplayMode).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});
