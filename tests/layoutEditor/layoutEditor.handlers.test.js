import { describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  handleBackClick,
  handleFileExplorerAction,
  handleFileExplorerItemClick,
  handleLayoutEditorCanvasDragUpdate,
  handleLayoutEditorCanvasMetricsChange,
  handleLayoutEditPanelUpdateHandler,
  handlePreviewButtonClick,
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
      fileRecords: [{ id: "file-layout-thumb" }],
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
    i18n: EN_I18N,
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
      fileRecords: [{ id: "file-layout-thumb" }],
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Layout preview saved.",
    });
  });
});

describe("layoutEditor.handleLayoutEditPanelUpdateHandler", () => {
  it("persists text reveal indicator visual updates immediately", async () => {
    const updateLayoutElement = vi.fn(async () => ({ valid: true }));
    const deps = createLayoutEditorDeps({
      updateLayoutElement,
    });
    const currentElement = {
      id: "item-1",
      type: "text-revealing-ref-dialogue-content",
      name: "Dialogue Text",
    };

    deps.store.selectSelectedItemId = vi.fn(() => "item-1");
    deps.store.selectSelectedItemData = vi.fn(() => currentElement);
    deps.store.selectImages = vi.fn(() => ({
      items: {
        "image-indicator": {
          id: "image-indicator",
          type: "image",
          fileId: "file-indicator",
        },
      },
      tree: [{ id: "image-indicator" }],
    }));
    deps.projectService.getRepositoryState = vi.fn(() => ({
      images: {
        items: {
          "image-indicator": {
            id: "image-indicator",
            type: "image",
            fileId: "file-indicator",
          },
        },
        tree: [{ id: "image-indicator" }],
      },
      layouts: {
        items: {
          "layout-1": {
            elements: {
              items: {
                "item-1": {
                  type: "text-revealing-ref-dialogue-content",
                  name: "Dialogue Text",
                },
              },
            },
          },
        },
      },
      controls: { items: {} },
    }));

    await handleLayoutEditPanelUpdateHandler(deps, {
      _event: {
        detail: {
          name: "indicator",
          value: {
            revealing: {
              imageId: "image-indicator",
              width: 24,
              height: 20,
              offsetX: 12,
              offsetY: 2,
            },
          },
          formValues: {
            ...currentElement,
            indicator: {
              revealing: {
                imageId: "image-indicator",
                width: 24,
                height: 20,
                offsetX: 12,
                offsetY: 2,
              },
            },
          },
        },
      },
    });

    expect(deps.store.updateSelectedItem).toHaveBeenCalledWith({
      updatedItem: {
        ...currentElement,
        indicator: {
          revealing: {
            imageId: "image-indicator",
            width: 24,
            height: 20,
            offsetX: 12,
            offsetY: 2,
          },
        },
      },
    });
    expect(updateLayoutElement).toHaveBeenCalledWith({
      layoutId: "layout-1",
      elementId: "item-1",
      data: {
        indicator: {
          revealing: {
            imageId: "image-indicator",
            width: 24,
            height: 20,
            offsetX: 12,
            offsetY: 2,
          },
        },
      },
      replace: false,
    });
  });
});

describe("layoutEditor.handleFileExplorerAction", () => {
  it("creates image elements at the top of the selected parent", async () => {
    vi.useFakeTimers();
    const createLayoutElement = vi.fn(async () => ({ valid: true }));
    const deps = createLayoutEditorDeps();
    let selectedItemId;
    deps.appService.showComponentDialog = vi.fn(async () => ({
      actionId: "create",
      values: {
        name: "Hero Image",
        imageId: "image-1",
      },
    }));
    deps.projectService.createLayoutElement = createLayoutElement;
    deps.store.selectProjectResolution = vi.fn(() => ({
      width: 1920,
      height: 1080,
    }));
    deps.store.selectImages = vi.fn(() => ({
      items: {
        "image-1": {
          id: "image-1",
          width: 320,
          height: 160,
        },
      },
      tree: [{ id: "image-1" }],
    }));
    deps.store.selectSelectedItemId = vi.fn(() => selectedItemId);
    deps.store.setSelectedItemId = vi.fn(({ itemId } = {}) => {
      selectedItemId = itemId;
    });
    deps.store.setDetailPanelSelectedItemId = vi.fn();
    deps.refs.fileExplorer = {
      selectItem: vi.fn(),
    };

    try {
      await handleFileExplorerAction(deps, {
        _event: {
          detail: {
            itemId: "parent-1",
            item: {
              value: {
                action: "new-child-item",
                type: "sprite",
              },
            },
          },
        },
      });

      expect(createLayoutElement).toHaveBeenCalledWith({
        layoutId: "layout-1",
        elementId: expect.any(String),
        data: expect.objectContaining({
          type: "sprite",
          name: "Hero Image",
          imageId: "image-1",
        }),
        parentId: "parent-1",
        position: "first",
      });
      const createdElementId = createLayoutElement.mock.calls[0][0].elementId;
      expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
        itemId: createdElementId,
      });
      expect(deps.store.setDetailPanelSelectedItemId).toHaveBeenCalledWith({
        itemId: createdElementId,
      });
      expect(deps.refs.fileExplorer.selectItem).not.toHaveBeenCalled();

      vi.advanceTimersByTime(32);

      expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
        itemId: createdElementId,
      });
      expect(deps.render.mock.invocationCallOrder[0]).toBeLessThan(
        deps.refs.fileExplorer.selectItem.mock.invocationCallOrder[0],
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("layoutEditor.handleLayoutEditorCanvasMetricsChange", () => {
  it("skips syncing panel metrics while the deferred detail panel selection is still pending", () => {
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => "selected-item"),
        selectDetailPanelSelectedItemId: vi.fn(() => "stale-panel-item"),
        setSelectedElementMetrics: vi.fn(),
      },
      refs: {
        layoutEditPanel: {
          getSelectedElementMetrics: vi.fn(() => ({
            id: "stale-panel-item",
            width: 20,
            height: 20,
          })),
          setSelectedElementMetrics: vi.fn(),
        },
      },
    };

    handleLayoutEditorCanvasMetricsChange(deps, {
      _event: {
        detail: {
          metrics: {
            id: "selected-item",
            width: 76,
            height: 54,
          },
        },
      },
    });

    expect(deps.store.setSelectedElementMetrics).toHaveBeenCalledWith({
      metrics: {
        id: "selected-item",
        width: 76,
        height: 54,
      },
    });
    expect(
      deps.refs.layoutEditPanel.setSelectedElementMetrics,
    ).not.toHaveBeenCalled();
  });
});

describe("layoutEditor.handleFileExplorerItemClick", () => {
  it("closes the mobile node explorer and reveals detail for the selected node", async () => {
    const store = {
      setSelectedItemId: vi.fn(),
      selectIsTouchMode: vi.fn(() => true),
      selectIsMobileFileExplorerOpen: vi.fn(() => true),
      setDetailPanelSelectedItemId: vi.fn(),
      closeMobileFileExplorer: vi.fn(),
    };
    const render = vi.fn();

    await handleFileExplorerItemClick(
      { store, render },
      {
        _event: {
          detail: {
            itemId: "node-1",
          },
        },
      },
    );

    expect(store.setSelectedItemId).toHaveBeenCalledWith({ itemId: "node-1" });
    expect(store.setDetailPanelSelectedItemId).toHaveBeenCalledWith({
      itemId: "node-1",
    });
    expect(store.closeMobileFileExplorer).toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe("layoutEditor.handlePreviewButtonClick", () => {
  it("returns mobile node detail back to the preview pane", () => {
    const store = {
      setDetailPanelSelectedItemId: vi.fn(),
    };
    const render = vi.fn();

    handlePreviewButtonClick({ store, render });

    expect(store.setDetailPanelSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(render).toHaveBeenCalledTimes(1);
  });
});
