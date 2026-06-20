import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleEditDialogImageClick,
  handleUploadClick,
  handlePreviewCanvasModeClick,
  handlePreviewFitModeClick,
  handlePreviewNextClick,
  handlePreviewOverlayKeyDown,
  handlePreviewPreviousClick,
} from "../../src/pages/characterSprites/characterSprites.handlers.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

const createPreviewDeps = ({
  selectedItemId = "sprite-1",
  previewVisible = true,
} = {}) => {
  const store = {
    selectFullImagePreviewVisible: vi.fn(() => previewVisible),
    selectSelectedItemId: vi.fn(() => selectedItemId),
    selectAdjacentSpriteItemId: vi.fn(({ direction }) => {
      return direction === "next" ? "sprite-2" : "sprite-0";
    }),
    selectSpriteItemById: vi.fn(({ itemId }) => ({
      id: itemId,
      type: "image",
      fileId: `${itemId}-file`,
    })),
    setSelectedItemId: vi.fn(),
    showFullImagePreview: vi.fn(),
    setFullImagePreviewDisplayMode: vi.fn(),
  };

  return {
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
};

const createEvent = (key, overrides = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...overrides,
});

describe("characterSprites preview handlers", () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("navigates preview items from the left and right overlay edges", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });
    const deps = createPreviewDeps();
    const nextEvent = createEvent("click");
    const previousEvent = createEvent("click");

    handlePreviewNextClick(deps, {
      _event: nextEvent,
    });
    handlePreviewPreviousClick(deps, {
      _event: previousEvent,
    });

    expect(deps.store.selectAdjacentSpriteItemId).toHaveBeenNthCalledWith(1, {
      itemId: "sprite-1",
      direction: "next",
    });
    expect(deps.store.selectAdjacentSpriteItemId).toHaveBeenNthCalledWith(2, {
      itemId: "sprite-1",
      direction: "previous",
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "sprite-2",
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "sprite-0",
    });
    expect(nextEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(nextEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(previousEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(previousEvent.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("uses vertical keys to navigate preview items and ignores text entry targets", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });
    const deps = createPreviewDeps();

    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("ArrowDown"),
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("ArrowUp"),
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("d", {
        ctrlKey: true,
      }),
    });

    expect(deps.store.selectAdjacentSpriteItemId).toHaveBeenNthCalledWith(1, {
      itemId: "sprite-1",
      direction: "next",
    });
    expect(deps.store.selectAdjacentSpriteItemId).toHaveBeenNthCalledWith(2, {
      itemId: "sprite-1",
      direction: "previous",
    });
    expect(deps.store.selectAdjacentSpriteItemId).toHaveBeenNthCalledWith(3, {
      itemId: "sprite-1",
      direction: "next",
      distance: 10,
      clamp: true,
    });

    const inputEvent = createEvent("ArrowRight", {
      target: {
        tagName: "INPUT",
      },
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: inputEvent,
    });

    expect(deps.store.selectAdjacentSpriteItemId).toHaveBeenCalledTimes(3);
    expect(inputEvent.preventDefault).not.toHaveBeenCalled();
    expect(inputEvent.stopPropagation).not.toHaveBeenCalled();
  });

  it("switches full sprite preview display modes from the overlay controls", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });
    const deps = createPreviewDeps();
    const canvasEvent = createEvent("click");
    const fitEvent = createEvent("click");

    handlePreviewCanvasModeClick(deps, {
      _event: canvasEvent,
    });
    handlePreviewFitModeClick(deps, {
      _event: fitEvent,
    });

    expect(deps.store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(
      1,
      {
        displayMode: "canvas",
      },
    );
    expect(deps.store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(
      2,
      {
        displayMode: "fit",
      },
    );
    expect(canvasEvent.preventDefault).toHaveBeenCalledOnce();
    expect(canvasEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(fitEvent.preventDefault).toHaveBeenCalledOnce();
    expect(fitEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledTimes(2);
    expect(deps.refs.previewOverlay.focus).toHaveBeenCalledTimes(2);
  });

  it("uses horizontal keys to switch full sprite preview display modes", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });
    const deps = createPreviewDeps();

    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("ArrowLeft"),
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("ArrowRight"),
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("h"),
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("l"),
    });

    expect(deps.store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(
      1,
      {
        displayMode: "canvas",
      },
    );
    expect(deps.store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(
      2,
      {
        displayMode: "fit",
      },
    );
    expect(deps.store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(
      3,
      {
        displayMode: "canvas",
      },
    );
    expect(deps.store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(
      4,
      {
        displayMode: "fit",
      },
    );
    expect(deps.render).toHaveBeenCalledTimes(4);
    expect(deps.refs.previewOverlay.focus).toHaveBeenCalledTimes(4);
    expect(deps.store.selectAdjacentSpriteItemId).not.toHaveBeenCalled();
  });

  it("does not use tab as a full sprite preview shortcut", () => {
    const deps = createPreviewDeps();
    const event = createEvent("Tab");

    handlePreviewOverlayKeyDown(deps, {
      _event: event,
    });

    expect(deps.store.setFullImagePreviewDisplayMode).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.refs.previewOverlay.focus).not.toHaveBeenCalled();
    expect(deps.store.selectAdjacentSpriteItemId).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("does not navigate when the preview is hidden", () => {
    const deps = createPreviewDeps({
      previewVisible: false,
    });
    const event = createEvent("ArrowRight");

    handlePreviewOverlayKeyDown(deps, {
      _event: event,
    });

    expect(deps.store.selectSelectedItemId).not.toHaveBeenCalled();
    expect(deps.store.selectAdjacentSpriteItemId).not.toHaveBeenCalled();
    expect(deps.store.setFullImagePreviewDisplayMode).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});

const createUploadDeps = ({
  files,
  uploadResults = [],
  repositorySprites = {},
} = {}) => {
  const appService = {
    showDropdownMenu: vi.fn().mockResolvedValue({
      item: {
        key: "image",
      },
    }),
    pickFiles: vi.fn().mockResolvedValue(files),
    showAlert: vi.fn(),
    getPayload: vi.fn(() => ({
      characterId: "character-1",
    })),
  };
  const projectService = {
    uploadFiles: vi.fn(async ([file]) => [
      uploadResults.find((result) => result.sourceFile === file) ?? {
        fileId: `${file.name}-file`,
        displayName: file.name.replace(/\.[^.]+$/, ""),
        fileRecords: [],
      },
    ]),
    createCharacterSpriteItem: vi.fn(),
    getRepositoryState: vi.fn(() => ({
      characters: {
        items: {
          "character-1": {
            id: "character-1",
            type: "character",
            name: "Hero",
            sprites: {
              items: repositorySprites,
              tree: Object.keys(repositorySprites).map((id) => ({ id })),
            },
          },
        },
      },
      files: {
        items: {},
        tree: [],
      },
    })),
  };
  const store = {
    selectCharacterId: vi.fn(() => "character-1"),
    addPendingUploads: vi.fn(),
    removePendingUploads: vi.fn(),
    updatePendingUpload: vi.fn(),
    setCharacterId: vi.fn(),
    setCharacterName: vi.fn(),
    setTagsData: vi.fn(),
    setItems: vi.fn(),
    setProjectResolution: vi.fn(),
    selectSelectedItemId: vi.fn(() => undefined),
    selectSelectedItem: vi.fn(() => undefined),
    selectFolderById: vi.fn(({ folderId }) => ({
      id: folderId,
      type: "folder",
      name: "Folder",
    })),
    selectSpriteTreeContainsItem: vi.fn(() => true),
  };

  return {
    appService,
    projectService,
    render: vi.fn(),
    store,
  };
};

describe("characterSprites upload handlers", () => {
  it("filters unsupported image extensions before uploading a batch", async () => {
    const validFile = { name: "hero.png" };
    const invalidFile = { name: "hero.gif" };
    const deps = createUploadDeps({
      files: [validFile, invalidFile],
    });

    await handleUploadClick(deps, {
      _event: {
        detail: {
          groupId: "folder-1",
          x: 24,
          y: 32,
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Only JPG/JPEG, PNG, and WEBP images are supported.",
      title: "Warning",
    });
    expect(deps.projectService.uploadFiles).toHaveBeenCalledTimes(1);
    expect(deps.projectService.uploadFiles).toHaveBeenCalledWith([validFile]);
    expect(deps.projectService.createCharacterSpriteItem).toHaveBeenCalledTimes(
      1,
    );
  });

  it("does not upload when every selected image has an unsupported extension", async () => {
    const deps = createUploadDeps({
      files: [{ name: "hero.gif" }],
    });

    await handleUploadClick(deps, {
      _event: {
        detail: {
          groupId: "folder-1",
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Only JPG/JPEG, PNG, and WEBP images are supported.",
      title: "Warning",
    });
    expect(deps.projectService.uploadFiles).not.toHaveBeenCalled();
    expect(
      deps.projectService.createCharacterSpriteItem,
    ).not.toHaveBeenCalled();
  });

  it("validates an edit-dialog image replacement before upload", async () => {
    const appService = {
      pickFiles: vi.fn().mockResolvedValue({
        name: "hero.gif",
      }),
      showAlert: vi.fn(),
    };
    const deps = {
      appService,
      projectService: {
        uploadFiles: vi.fn(),
      },
      render: vi.fn(),
      store: {
        setEditUpload: vi.fn(),
      },
    };

    await handleEditDialogImageClick(deps);

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: "Only JPG/JPEG, PNG, and WEBP images are supported.",
      title: "Warning",
    });
    expect(deps.projectService.uploadFiles).not.toHaveBeenCalled();
    expect(deps.store.setEditUpload).not.toHaveBeenCalled();
  });
});
