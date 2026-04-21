import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaPageHandlers } from "../../src/internal/ui/resourcePages/media/createMediaPageHandlers.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

describe("createMediaPageHandlers", () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("selects the created folder in the explorer while clearing page item selection", async () => {
    const handlers = createMediaPageHandlers({
      resourceType: "images",
    });
    const repositoryState = {
      files: {
        tree: [],
        items: {},
      },
      images: {
        tree: [],
        items: {
          "folder-1": {
            id: "folder-1",
            type: "folder",
            name: "New Folder",
          },
        },
      },
    };
    const deps = {
      projectService: {
        getState: () => repositoryState,
      },
      store: {
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

    await handlers.refreshData(deps, {
      selectedItemId: "folder-1",
    });

    expect(deps.store.setItems).toHaveBeenCalledWith({
      data: repositoryState.images,
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "folder-1",
    });
  });

  it("keeps page item selection for real media items", async () => {
    const handlers = createMediaPageHandlers({
      resourceType: "images",
    });
    const repositoryState = {
      files: {
        tree: [],
        items: {
          "file-1": {
            id: "file-1",
            mimeType: "image/jpeg",
            size: 512,
          },
        },
      },
      images: {
        tree: [],
        items: {
          "image-1": {
            id: "image-1",
            type: "image",
            name: "Splash",
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

    await handlers.refreshData(deps, {
      selectedItemId: "image-1",
    });

    expect(deps.store.setItems).toHaveBeenCalledWith({
      data: {
        tree: [],
        items: {
          "image-1": {
            id: "image-1",
            type: "image",
            name: "Splash",
            fileId: "file-1",
            fileType: "image/jpeg",
            fileSize: 512,
          },
        },
      },
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-1",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "image-1",
    });
  });

  it("waits for the created folder to appear before refreshing media data", async () => {
    const handlers = createMediaPageHandlers({
      resourceType: "images",
    });
    const staleState = {
      files: {
        tree: [],
        items: {},
      },
      images: {
        tree: [],
        items: {},
      },
    };
    const nextState = {
      files: {
        tree: [],
        items: {},
      },
      images: {
        tree: [],
        items: {
          "folder-1": {
            id: "folder-1",
            type: "folder",
            name: "New Folder",
          },
        },
      },
    };
    const deps = {
      projectService: {
        getState: vi.fn(() => staleState),
        subscribeProjectState: vi.fn((listener) => {
          queueMicrotask(() => {
            listener({
              domainState: nextState,
            });
          });
          return () => {};
        }),
      },
      store: {
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

    await handlers.refreshData(deps, {
      selectedItemId: "folder-1",
    });

    expect(deps.store.setItems).toHaveBeenCalledWith({
      data: nextState.images,
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "folder-1",
    });
  });

  it("hydrates file metadata for video pages from files", async () => {
    const handlers = createMediaPageHandlers({
      resourceType: "videos",
    });
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
        tree: [],
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

    await handlers.refreshData(deps, {
      selectedItemId: "video-1",
    });

    expect(deps.store.setItems).toHaveBeenCalledWith({
      data: {
        tree: [],
        items: {
          "video-1": {
            id: "video-1",
            type: "video",
            name: "Intro",
            fileId: "file-1",
            fileType: "video/mp4",
            fileSize: 2048,
          },
        },
      },
    });
  });

  it("keeps projected file metadata when refresh uses domain state without files", async () => {
    const handlers = createMediaPageHandlers({
      resourceType: "images",
    });
    const domainState = {
      images: {
        tree: [],
        items: {
          "image-1": {
            id: "image-1",
            type: "image",
            name: "Splash",
            fileId: "file-1",
            fileType: "image/jpeg",
            fileSize: 512,
          },
        },
      },
    };
    const deps = {
      projectService: {
        getState: () => domainState,
      },
      store: {
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

    await handlers.refreshData(deps, {
      selectedItemId: "image-1",
    });

    expect(deps.store.setItems).toHaveBeenCalledWith({
      data: domainState.images,
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-1",
    });
  });

  it("focuses the keyboard scope after explorer selection changes", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const handlers = createMediaPageHandlers({
      resourceType: "images",
    });
    const deps = {
      store: {
        setSelectedItemId: vi.fn(),
      },
      refs: {
        groupview: {
          scrollItemIntoView: vi.fn(),
        },
        fileExplorerKeyboardScope: {
          focus: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handlers.handleFileExplorerSelectionChanged(deps, {
      _event: {
        detail: {
          itemId: "image-1",
          isFolder: false,
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "image-1",
    });
    expect(deps.refs.groupview.scrollItemIntoView).toHaveBeenCalledWith({
      itemId: "image-1",
    });
    expect(deps.refs.fileExplorerKeyboardScope.focus).toHaveBeenCalledTimes(1);
  });

  it("focuses the keyboard scope after mount", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const handlers = createMediaPageHandlers({
      resourceType: "images",
    });
    const deps = {
      refs: {
        fileExplorerKeyboardScope: {
          focus: vi.fn(),
        },
      },
    };

    handlers.handleAfterMount(deps);

    expect(deps.refs.fileExplorerKeyboardScope.focus).toHaveBeenCalledTimes(1);
  });
});
