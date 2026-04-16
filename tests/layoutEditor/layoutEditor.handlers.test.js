import { describe, expect, it, vi } from "vitest";
import {
  handleBackClick,
  handleLayoutEditorCanvasDragUpdate,
  handleSaveButtonClick,
} from "../../src/pages/layoutEditor/layoutEditor.handlers.js";
import { enqueueLayoutEditorPersistence } from "../../src/pages/layoutEditor/support/layoutEditorPersistenceQueue.js";

const createLayoutEditorDeps = ({
  pendingPersistPayload,
  updateLayoutElement = vi.fn(async () => ({ valid: true })),
  updateLayoutItem = vi.fn(async () => ({ valid: true })),
  previewData = {
    backgroundImageId: "image-preview",
  },
} = {}) => {
  const state = {
    pendingPersistPayload,
  };

  const store = {
    selectPendingPersistPayload: vi.fn(() => state.pendingPersistPayload),
    setPendingPersistPayload: vi.fn(({ payload } = {}) => {
      state.pendingPersistPayload = payload;
    }),
    clearPendingPersistPayload: vi.fn(({ persistenceRequestId } = {}) => {
      if (
        !persistenceRequestId ||
        state.pendingPersistPayload?.persistenceRequestId ===
          persistenceRequestId
      ) {
        state.pendingPersistPayload = undefined;
      }
    }),
    selectLastPersistErrorAt: vi.fn(() => 0),
    setLastPersistErrorAt: vi.fn(),
    syncRepositoryState: vi.fn(),
    selectLayoutId: vi.fn(() => "layout-1"),
    selectLayoutResourceType: vi.fn(() => "layouts"),
    selectPreviewData: vi.fn(() => previewData),
    selectSelectedItemId: vi.fn(() => undefined),
    updateSelectedItem: vi.fn(),
  };

  const appService = {
    getPayload: vi.fn(() => ({
      p: "project-1",
      layoutId: "layout-1",
      resourceType: "layouts",
    })),
    navigate: vi.fn(),
    showAlert: vi.fn(),
    showToast: vi.fn(),
  };

  const projectService = {
    getRepositoryState: vi.fn(() => ({
      layouts: {
        items: {
          "layout-1": {
            elements: {
              items: {
                "item-1": {
                  type: "container",
                  x: 0,
                  y: 0,
                },
              },
            },
          },
        },
      },
      controls: { items: {} },
    })),
    getRepository: vi.fn(async () => ({
      getState: () => ({
        layouts: {
          items: {
            "layout-1": {
              type: "layout",
            },
          },
        },
      }),
    })),
    ensureRepository: vi.fn(async () => {}),
    updateLayoutElement,
    updateLayoutItem,
    storeFile: vi.fn(async () => ({
      fileId: "file-layout-thumb",
      fileRecords: [{ fileId: "file-layout-thumb" }],
    })),
  };

  return {
    appService,
    projectService,
    store,
    render: vi.fn(),
    refs: {
      layoutEditorCanvas: {
        captureThumbnailImage: vi.fn(async () => "data:text/plain;base64,QQ=="),
      },
    },
    subject: {
      dispatch: vi.fn(),
    },
  };
};

describe("layoutEditor.handleBackClick", () => {
  it("flushes a pending debounced change before navigating back", async () => {
    const updateLayoutElement = vi.fn(async () => ({ valid: true }));
    const deps = createLayoutEditorDeps({
      pendingPersistPayload: {
        layoutId: "layout-1",
        resourceType: "layouts",
        selectedItemId: "item-1",
        updatedItem: {
          id: "item-1",
          type: "container",
          x: 24,
          y: 0,
        },
        persistenceRequestId: "persist-1",
      },
      updateLayoutElement,
    });

    await handleBackClick(deps);

    expect(updateLayoutElement).toHaveBeenCalledWith({
      layoutId: "layout-1",
      elementId: "item-1",
      data: {
        x: 24,
      },
      replace: false,
    });
    expect(deps.store.clearPendingPersistPayload).toHaveBeenCalledWith({
      persistenceRequestId: "persist-1",
    });
    expect(deps.appService.navigate).toHaveBeenCalledWith("/project/layouts", {
      p: "project-1",
    });
  });

  it("does not navigate when the pending flush fails", async () => {
    const updateLayoutElement = vi.fn(async () => ({
      valid: false,
      error: {
        message: "save failed",
      },
    }));
    const deps = createLayoutEditorDeps({
      pendingPersistPayload: {
        layoutId: "layout-1",
        resourceType: "layouts",
        selectedItemId: "item-1",
        updatedItem: {
          id: "item-1",
          type: "container",
          x: 24,
          y: 0,
        },
        persistenceRequestId: "persist-2",
      },
      updateLayoutElement,
    });

    await handleBackClick(deps);

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "save failed",
      title: "Error",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("flushes the latest canvas drag change before navigating back", async () => {
    const updateLayoutElement = vi.fn(async () => ({ valid: true }));
    const deps = createLayoutEditorDeps({
      updateLayoutElement,
    });

    handleLayoutEditorCanvasDragUpdate(deps, {
      _event: {
        detail: {
          itemId: "item-1",
          updatedItem: {
            id: "item-1",
            type: "container",
            x: 42,
            y: 0,
          },
        },
      },
    });

    await handleBackClick(deps);

    expect(deps.store.setPendingPersistPayload).toHaveBeenCalled();
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "layoutEditor.updateElement",
      expect.objectContaining({
        layoutId: "layout-1",
        resourceType: "layouts",
        selectedItemId: "item-1",
        updatedItem: {
          id: "item-1",
          type: "container",
          x: 42,
          y: 0,
        },
      }),
    );
    expect(updateLayoutElement).toHaveBeenCalledWith({
      layoutId: "layout-1",
      elementId: "item-1",
      data: {
        x: 42,
      },
      replace: false,
    });
    expect(deps.appService.navigate).toHaveBeenCalledWith("/project/layouts", {
      p: "project-1",
    });
  });

  it("does not navigate when an in-flight immediate save fails", async () => {
    let resolveTask;
    const taskFinished = new Promise((resolve) => {
      resolveTask = resolve;
    });
    const deps = createLayoutEditorDeps();

    void enqueueLayoutEditorPersistence({
      owner: deps.projectService,
      task: async () => {
        await taskFinished;
        return {
          ok: false,
        };
      },
    });

    const backPromise = handleBackClick(deps);
    resolveTask();
    await backPromise;

    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });
});

describe("layoutEditor.handleSaveButtonClick", () => {
  it("persists the current preview data with the saved thumbnail", async () => {
    const updateLayoutItem = vi.fn(async () => ({ valid: true }));
    const previewData = {
      backgroundImageId: "image-preview",
      runtime: {
        autoMode: true,
      },
    };
    const deps = createLayoutEditorDeps({
      updateLayoutItem,
      previewData,
    });

    await handleSaveButtonClick(deps);

    expect(updateLayoutItem).toHaveBeenCalledWith({
      layoutId: "layout-1",
      data: {
        thumbnailFileId: "file-layout-thumb",
        preview: previewData,
      },
      fileRecords: [{ fileId: "file-layout-thumb" }],
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Layout preview saved.",
    });
  });
});
