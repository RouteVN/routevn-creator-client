import { describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  handleBackClick,
  handleFileExplorerAction,
  handleFileExplorerItemClick,
  handleFileExplorerVisibilityToggle,
  handleLayoutEditorCanvasBackgroundClick,
  handleLayoutEditorCanvasDragUpdate,
  handleLayoutEditorCanvasMetricsChange,
  handleLayoutEditorCanvasSelectionChange,
  handleLayoutEditPanelUpdateHandler,
  handlePreviewButtonClick,
  handleSaveButtonClick,
} from "../../src/pages/layoutEditor/layoutEditor.handlers.js";
import { enqueueLayoutEditorPersistence } from "../../src/pages/layoutEditor/support/layoutEditorPersistenceQueue.js";

const createLayoutEditorDeps = ({
  pendingPersistPayload,
  updateLayoutElement = vi.fn(async () => ({ valid: true })),
  updateControlElement = vi.fn(async () => ({ valid: true })),
  updateLayoutItem = vi.fn(async () => ({ valid: true })),
  updateControlItem = vi.fn(async () => ({ valid: true })),
  resourceType = "layouts",
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
    selectLayoutResourceType: vi.fn(() => resourceType),
    selectPreviewData: vi.fn(() => previewData),
    selectSelectedItemId: vi.fn(() => undefined),
    selectItemDataById: vi.fn(({ itemId } = {}) => ({
      id: itemId,
      type: "container",
      name: "Container",
      x: 0,
      y: 0,
    })),
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
    updateControlElement,
    updateLayoutItem,
    updateControlItem,
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

describe("layoutEditor.handleFileExplorerVisibilityToggle", () => {
  it("optimistically updates and persists element visibility", async () => {
    const updateLayoutElement = vi.fn(async () => ({ valid: true }));
    const deps = createLayoutEditorDeps({ updateLayoutElement });

    await handleFileExplorerVisibilityToggle(deps, {
      _event: {
        detail: {
          itemId: "item-1",
          hidden: true,
        },
      },
    });

    expect(deps.store.updateSelectedItem).toHaveBeenCalledWith({
      itemId: "item-1",
      updatedItem: {
        id: "item-1",
        type: "container",
        name: "Container",
        x: 0,
        y: 0,
        hidden: true,
      },
    });
    expect(updateLayoutElement).toHaveBeenCalledWith({
      layoutId: "layout-1",
      elementId: "item-1",
      data: {
        hidden: true,
      },
      replace: false,
    });
    expect(deps.render).toHaveBeenCalled();
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("rolls back the optimistic state when visibility persistence fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const updateLayoutElement = vi.fn(async () => ({
      valid: false,
      error: {
        message: "model rejected update",
      },
    }));
    const deps = createLayoutEditorDeps({ updateLayoutElement });

    await handleFileExplorerVisibilityToggle(deps, {
      _event: {
        detail: {
          itemId: "item-1",
          hidden: true,
        },
      },
    });

    expect(deps.store.updateSelectedItem).toHaveBeenLastCalledWith({
      itemId: "item-1",
      updatedItem: {
        id: "item-1",
        type: "container",
        name: "Container",
        x: 0,
        y: 0,
      },
    });
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Failed to update element visibility.",
      title: "Error",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[layoutEditor] Element visibility update was rejected",
      expect.objectContaining({
        itemId: "item-1",
        layoutId: "layout-1",
      }),
    );
    consoleError.mockRestore();
  });

  it("persists visibility through the control element command", async () => {
    const updateControlElement = vi.fn(async () => ({ valid: true }));
    const deps = createLayoutEditorDeps({
      resourceType: "controls",
      updateControlElement,
    });

    await handleFileExplorerVisibilityToggle(deps, {
      _event: {
        detail: {
          itemId: "item-1",
          hidden: true,
        },
      },
    });

    expect(updateControlElement).toHaveBeenCalledWith({
      controlId: "layout-1",
      elementId: "item-1",
      data: {
        hidden: true,
      },
      replace: false,
    });
  });

  it("flushes edits queued during an in-flight save before visibility", async () => {
    let releaseFirstPersist;
    const firstPersistReleased = new Promise((resolve) => {
      releaseFirstPersist = resolve;
    });
    let markFirstPersistStarted;
    const firstPersistStarted = new Promise((resolve) => {
      markFirstPersistStarted = resolve;
    });
    const updateLayoutElement = vi.fn(async () => {
      if (updateLayoutElement.mock.calls.length === 1) {
        markFirstPersistStarted();
        await firstPersistReleased;
      }
      return { valid: true };
    });
    const deps = createLayoutEditorDeps({
      pendingPersistPayload: {
        layoutId: "layout-1",
        resourceType: "layouts",
        selectedItemId: "item-1",
        updatedItem: {
          id: "item-1",
          type: "container",
          x: 12,
          y: 0,
        },
        persistenceRequestId: "persist-before-visibility",
      },
      updateLayoutElement,
    });

    const visibilityPromise = handleFileExplorerVisibilityToggle(deps, {
      _event: {
        detail: {
          itemId: "item-1",
          hidden: true,
        },
      },
    });
    await firstPersistStarted;

    handleLayoutEditorCanvasDragUpdate(deps, {
      _event: {
        detail: {
          itemId: "item-1",
          updatedItem: {
            id: "item-1",
            type: "container",
            x: 24,
            y: 0,
          },
        },
      },
    });
    releaseFirstPersist();
    await visibilityPromise;

    expect(updateLayoutElement).toHaveBeenNthCalledWith(1, {
      layoutId: "layout-1",
      elementId: "item-1",
      data: {
        x: 12,
      },
      replace: false,
    });
    expect(updateLayoutElement).toHaveBeenNthCalledWith(2, {
      layoutId: "layout-1",
      elementId: "item-1",
      data: {
        x: 24,
      },
      replace: false,
    });
    expect(updateLayoutElement).toHaveBeenNthCalledWith(3, {
      layoutId: "layout-1",
      elementId: "item-1",
      data: {
        hidden: true,
      },
      replace: false,
    });
  });
});

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
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project/layouts",
      {
        p: "project-1",
      },
      {
        historyMode: "replace",
      },
    );
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
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project/layouts",
      {
        p: "project-1",
      },
      {
        historyMode: "replace",
      },
    );
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

  it("keeps mobile preview saves from resyncing an unmounted file explorer", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (callback) => {
      callback();
      return 1;
    };

    try {
      const deps = createLayoutEditorDeps();
      deps.store.selectIsTouchMode = vi.fn(() => true);
      deps.store.selectSelectedItemId = vi.fn(() => "node-1");
      deps.store.setSelectedItemId = vi.fn();
      deps.store.setDetailPanelSelectedItemId = vi.fn();

      await handleSaveButtonClick(deps);

      expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
        itemId: "node-1",
      });
      expect(deps.store.setDetailPanelSelectedItemId).not.toHaveBeenCalled();
      expect(deps.appService.showAlert).not.toHaveBeenCalled();
      expect(deps.appService.showToast).toHaveBeenCalledWith({
        message: "Layout preview saved.",
      });
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });
});

describe("layoutEditor.handleLayoutEditPanelUpdateHandler", () => {
  it("queues click sound ID and volume in one atomic update", async () => {
    const updateLayoutElement = vi.fn(async () => ({ valid: true }));
    const deps = createLayoutEditorDeps({
      updateLayoutElement,
    });
    const currentElement = {
      id: "item-1",
      type: "text",
      name: "Dialogue Text",
      clickSoundId: "sound-old",
      click: {
        payload: {
          action: "next",
        },
        soundVolume: 20,
      },
    };

    deps.store.selectSelectedItemId = vi.fn(() => "item-1");
    deps.store.selectSelectedItemData = vi.fn(() => currentElement);
    deps.store.selectImages = vi.fn(() => ({ items: {}, tree: [] }));

    await handleLayoutEditPanelUpdateHandler(deps, {
      _event: {
        detail: {
          name: "clickSoundId",
          value: "sound-new",
          formValues: {
            ...currentElement,
            clickSoundId: "sound-new",
            click: {
              ...currentElement.click,
              soundVolume: 65,
            },
          },
        },
      },
    });

    const expectedUpdatedItem = expect.objectContaining({
      clickSoundId: "sound-new",
      click: {
        payload: {
          action: "next",
        },
        soundVolume: 65,
      },
    });
    expect(deps.store.updateSelectedItem).toHaveBeenCalledWith({
      updatedItem: expectedUpdatedItem,
    });
    expect(deps.subject.dispatch).toHaveBeenCalledTimes(1);
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "layoutEditor.updateElement",
      expect.objectContaining({
        updatedItem: expectedUpdatedItem,
      }),
    );
    expect(updateLayoutElement).not.toHaveBeenCalled();
  });

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
  it("clears node selection after clicking empty explorer space", async () => {
    const store = {
      setSelectedItemId: vi.fn(),
      setDetailPanelSelectedItemId: vi.fn(),
    };
    const render = vi.fn();

    await handleFileExplorerItemClick(
      { store, render },
      {
        _event: {
          detail: {
            itemId: undefined,
          },
        },
      },
    );

    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("closes the mobile node explorer and reveals detail for the selected node", async () => {
    const store = {
      setSelectedItemId: vi.fn(),
      selectSelectedItemId: vi.fn(() => undefined),
      selectIsTouchMode: vi.fn(() => true),
      selectIsMobileFileExplorerOpen: vi.fn(() => true),
      setDetailPanelSelectedItemId: vi.fn(),
      closeMobileFileExplorer: vi.fn(),
    };
    const render = vi.fn();

    await handleFileExplorerItemClick(
      { store, refs: {}, render },
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

describe("layoutEditor.handleLayoutEditorCanvasBackgroundClick", () => {
  it("clears node and explorer selection after clicking outside the canvas", () => {
    const background = {};
    const store = {
      setSelectedItemId: vi.fn(),
      setDetailPanelSelectedItemId: vi.fn(),
    };
    const refs = {
      fileExplorer: {
        clearSelection: vi.fn(),
      },
    };
    const render = vi.fn();

    handleLayoutEditorCanvasBackgroundClick(
      { store, refs, render },
      {
        _event: {
          target: background,
          currentTarget: background,
        },
      },
    );

    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(refs.fileExplorer.clearSelection).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("keeps selection after a click inside the canvas", () => {
    const store = {
      setSelectedItemId: vi.fn(),
    };
    const refs = {
      fileExplorer: {
        clearSelection: vi.fn(),
      },
    };
    const render = vi.fn();

    handleLayoutEditorCanvasBackgroundClick(
      { store, refs, render },
      {
        _event: {
          target: {},
          currentTarget: {},
        },
      },
    );

    expect(store.setSelectedItemId).not.toHaveBeenCalled();
    expect(refs.fileExplorer.clearSelection).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
});

describe("layoutEditor.handleLayoutEditorCanvasSelectionChange", () => {
  it("synchronizes canvas selection with explorer and touch detail", () => {
    const store = {
      setSelectedItemId: vi.fn(),
      selectIsTouchMode: vi.fn(() => true),
      setDetailPanelSelectedItemId: vi.fn(),
    };
    const refs = {
      fileExplorer: {
        selectItem: vi.fn(),
      },
    };
    const render = vi.fn();

    handleLayoutEditorCanvasSelectionChange(
      { store, refs, render },
      {
        _event: {
          detail: {
            itemId: "node-1",
            occurrenceId: "node-1-instance-2",
          },
        },
      },
    );

    expect(store.setSelectedItemId).toHaveBeenCalledWith({ itemId: "node-1" });
    expect(refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "node-1",
    });
    expect(store.setDetailPanelSelectedItemId).toHaveBeenCalledWith({
      itemId: "node-1",
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("clears all canonical selection surfaces for an empty canvas hit", () => {
    const store = {
      setSelectedItemId: vi.fn(),
      setDetailPanelSelectedItemId: vi.fn(),
    };
    const refs = {
      fileExplorer: {
        clearSelection: vi.fn(),
      },
    };
    const render = vi.fn();

    handleLayoutEditorCanvasSelectionChange(
      { store, refs, render },
      {
        _event: {
          detail: {
            itemId: undefined,
          },
        },
      },
    );

    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(store.setDetailPanelSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(refs.fileExplorer.clearSelection).toHaveBeenCalledTimes(1);
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
