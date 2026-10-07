import { describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import { produce } from "immer";
import * as panelStore from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import {
  handleSoundFormAction,
  handleOptionSelected,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import { EN_I18N } from "../support/i18n.js";
import * as layoutEditorStore from "../../src/pages/layoutEditor/layoutEditor.store.js";
import { createLayoutEditorRepositoryStoreData } from "../../src/pages/layoutEditor/support/layoutEditorRepositoryState.js";
import {
  handleBackClick,
  handleBeforeMount,
  handleFileExplorerAction,
  handleFileExplorerItemClick,
  handleFileExplorerVisibilityToggle,
  handleLayoutEditorCanvasBackgroundClick,
  handleLayoutEditorCanvasDragUpdate,
  handleLayoutEditorCanvasMetricsChange,
  handleLayoutEditorCanvasSelectionChange,
  handleLayoutEditPanelUpdateHandler,
  handleNodeButtonClick,
  handleNodeDetailBackClick,
  handleNodeMoveNextClick,
  handleNodeMovePreviousClick,
  handlePreviewButtonClick,
  handleRightPanelModeChange,
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
    selectLayoutElements: vi.fn(() => ({ items: {}, tree: [] })),
    recordEditHistoryStep: vi.fn(),
    addSavingPersistPayload: vi.fn(),
    removeSavingPersistPayload: vi.fn(),
    setStructureEditRunning: vi.fn(),
    selectIsStructureEditRunning: vi.fn(() => false),
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
    createLayoutElement: vi.fn(async () => ({ valid: true })),
    deleteLayoutElement: vi.fn(async () => ({ valid: true })),
    moveLayoutElement: vi.fn(async () => ({ valid: true })),
    createControlElement: vi.fn(async () => ({ valid: true })),
    deleteControlElement: vi.fn(async () => ({ valid: true })),
    moveControlElement: vi.fn(async () => ({ valid: true })),
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
      layoutEditPanel: {
        setTransientValues: vi.fn(),
      },
    },
    subject: {
      dispatch: vi.fn(),
    },
    i18n: EN_I18N,
  };
};

const createDraftReconciliationHarness = (resourceType, initialItem = {}) => {
  const deps = createLayoutEditorDeps({ resourceType });
  let repositoryState = {
    project: { resolution: { width: 1920, height: 1080 } },
    [resourceType]: {
      items: {
        "layout-1": {
          elements: {
            tree: [{ id: "item-1" }],
            items: {
              "item-1": {
                type: "container-ref-save-load-slot",
                name: "Container One",
                x: 0,
                y: 0,
                paginationMode: "continuous",
                ...initialItem,
              },
            },
          },
        },
      },
    },
  };
  let state = layoutEditorStore.createInitialState();
  for (const name of [
    "syncRepositoryState",
    "setSelectedItemId",
    "updateSelectedItem",
    "setPendingPersistPayload",
    "clearPendingPersistPayload",
  ]) {
    deps.store[name] = vi.fn((payload) => {
      state = produce(state, (draft) => {
        layoutEditorStore[name]({ state: draft }, payload);
      });
    });
  }
  for (const name of [
    "selectSelectedItemId",
    "selectSelectedItemData",
    "selectItemDataById",
    "selectImages",
    "selectPendingPersistPayload",
  ]) {
    deps.store[name] = (payload) => layoutEditorStore[name]({ state }, payload);
  }
  const updateElement = vi.fn(async ({ elementId, data, replace }) => {
    repositoryState = produce(repositoryState, (draft) => {
      const items = draft[resourceType].items["layout-1"].elements.items;
      if (replace) {
        items[elementId] = data;
      } else {
        Object.assign(items[elementId], data);
      }
    });
    return { valid: true };
  });
  deps.projectService.updateLayoutElement = updateElement;
  deps.projectService.updateControlElement = updateElement;
  deps.projectService.getRepositoryState = () => repositoryState;
  deps.appService.getPayload = () => ({
    p: "project-1",
    [resourceType === "controls" ? "c" : "l"]: "layout-1",
  });
  deps.store.syncRepositoryState(
    createLayoutEditorRepositoryStoreData({
      repositoryState,
      layoutId: "layout-1",
      resourceType,
    }),
  );
  deps.store.setSelectedItemId({ itemId: "item-1" });
  return {
    deps,
    updateElement,
    savedItem: () =>
      repositoryState[resourceType].items["layout-1"].elements.items["item-1"],
    edit: (name, value) =>
      handleLayoutEditPanelUpdateHandler(deps, {
        _event: { detail: { name, value } },
      }),
  };
};

describe.each(["layouts", "controls"])(
  "layoutEditor %s draft reconciliation",
  (resourceType) => {
    it("supersedes a debounced draft when a newer field is saved immediately", async () => {
      const { deps, edit, savedItem } =
        createDraftReconciliationHarness(resourceType);
      await edit("x", 10);
      await edit("paginationMode", "paginated");

      expect(savedItem()).toMatchObject({ x: 10, paginationMode: "paginated" });
      expect(deps.store.selectSelectedItemData()).toMatchObject({
        x: 10,
        paginationMode: "paginated",
      });
      expect(deps.store.selectPendingPersistPayload()).toBeUndefined();

      await edit("x", 20);
      await handleBackClick(deps);
      expect(savedItem()).toMatchObject({ x: 20, paginationMode: "paginated" });
    });

    it("retains edits made while an immediate save is in flight", async () => {
      const { deps, edit, savedItem, updateElement } =
        createDraftReconciliationHarness(resourceType);
      const persist = updateElement.getMockImplementation();
      let release;
      const saveReady = new Promise((resolve) => {
        release = resolve;
      });
      updateElement.mockImplementationOnce(async (payload) => {
        await saveReady;
        return persist(payload);
      });
      await edit("x", 10);
      const saving = edit("paginationMode", "paginated");
      await vi.waitFor(() => expect(updateElement).toHaveBeenCalledTimes(1));
      await edit("x", 20);
      const pending = deps.store.selectPendingPersistPayload();
      release();
      await saving;

      expect(savedItem()).toMatchObject({ x: 10, paginationMode: "paginated" });
      expect(deps.store.selectSelectedItemData()).toMatchObject({
        x: 20,
        paginationMode: "paginated",
      });
      expect(deps.store.selectPendingPersistPayload()).toEqual(pending);
      await handleBackClick(deps);
      expect(savedItem()).toMatchObject({ x: 20, paginationMode: "paginated" });
    });

    it("accepts refreshed fields once the pending save is acknowledged", async () => {
      const { deps, edit, savedItem, updateElement } =
        createDraftReconciliationHarness(resourceType);
      const persist = updateElement.getMockImplementation();
      updateElement.mockImplementationOnce(async (payload) => {
        const result = await persist(payload);
        await persist({ elementId: "item-1", data: { name: "Container Two" } });
        return result;
      });
      await edit("x", 10);
      await handleBackClick(deps);

      expect(deps.store.selectPendingPersistPayload()).toBeUndefined();
      expect(deps.store.selectSelectedItemData().name).toBe("Container Two");
      await edit("x", 20);
      await handleBackClick(deps);
      expect(savedItem()).toMatchObject({ x: 20, name: "Container Two" });
    });
  },
);

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

describe("layoutEditor.handleLayoutEditorCanvasDragUpdate", () => {
  it("updates changed canvas values in the detail panel while persistence stays queued", () => {
    const updateLayoutElement = vi.fn(async () => ({ valid: true }));
    const deps = createLayoutEditorDeps({ updateLayoutElement });
    deps.store.selectItemDataById.mockReturnValue({
      id: "item-1",
      type: "container",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 10,
    });

    handleLayoutEditorCanvasDragUpdate(deps, {
      _event: {
        detail: {
          itemId: "item-1",
          updatedItem: {
            id: "item-1",
            type: "container",
            x: 12,
            y: 24,
            width: 120,
            height: 60,
            rotation: 12.35,
          },
        },
      },
    });

    expect(deps.refs.layoutEditPanel.setTransientValues).toHaveBeenCalledWith({
      values: {
        x: 12,
        y: 24,
        width: 120,
        height: 60,
        rotation: 12.35,
      },
    });
    expect(deps.render).not.toHaveBeenCalled();
    expect(updateLayoutElement).not.toHaveBeenCalled();
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "layoutEditor.updateElement",
      expect.objectContaining({
        selectedItemId: "item-1",
        updatedItem: expect.objectContaining({
          x: 12,
          y: 24,
          width: 120,
          height: 60,
          rotation: 12.35,
        }),
      }),
    );
  });

  it("updates only canvas values that changed during the drag", () => {
    const deps = createLayoutEditorDeps();
    deps.store.selectItemDataById.mockReturnValue({
      id: "item-1",
      type: "container",
      x: 0,
      y: 5,
      width: 100,
      height: 40,
      rotation: 10,
    });

    handleLayoutEditorCanvasDragUpdate(deps, {
      _event: {
        detail: {
          itemId: "item-1",
          updatedItem: {
            id: "item-1",
            type: "container",
            x: 20,
            y: 5,
            width: 100,
            height: 40,
            rotation: 10,
          },
        },
      },
    });

    expect(deps.refs.layoutEditPanel.setTransientValues).toHaveBeenCalledWith({
      values: {
        x: 20,
      },
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
      deps.store.setRightPanelMode = vi.fn();

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

describe.each(["layouts", "controls"])(
  "layoutEditor %s revealing sound persistence",
  (resourceType) => {
    const createSoundHarness = (stopTiming = "immediate") => {
      const harness = createDraftReconciliationHarness(resourceType, {
        type: "text-revealing",
        revealSoundId: "sound-one",
        revealSoundStopTiming: stopTiming,
      });
      let panelState = panelStore.createInitialState();
      const pendingUpdates = [];
      const panel = {
        store: {},
        render: vi.fn(),
        dispatchEvent: (event) => {
          pendingUpdates.push(
            handleLayoutEditPanelUpdateHandler(harness.deps, { _event: event }),
          );
        },
      };
      for (const name of [
        "selectValues",
        "selectSoundFormDialog",
        "openSoundFormDialog",
        "closeSoundFormDialog",
        "updateValueProperty",
        "setSoundFormDialogSoundId",
        "closePopoverForm",
      ]) {
        panel.store[name] = (payload) =>
          panelStore[name]({ state: panelState }, payload);
      }
      const reselect = () => {
        harness.deps.store.setSelectedItemId({ itemId: undefined });
        harness.deps.store.syncRepositoryState(
          createLayoutEditorRepositoryStoreData({
            repositoryState: harness.deps.projectService.getRepositoryState(),
            layoutId: "layout-1",
            resourceType,
          }),
        );
        harness.deps.store.setSelectedItemId({ itemId: "item-1" });
        panelState = panelStore.createInitialState();
        panelStore.setValues(
          { state: panelState },
          {
            values: harness.deps.store.selectSelectedItemData(),
          },
        );
        panel.store.openSoundFormDialog({
          name: "revealSoundId",
          stopTimingName: "revealSoundStopTiming",
        });
        return panel.store.selectSoundFormDialog();
      };
      reselect();
      return {
        ...harness,
        panel,
        reselect,
        save: async (stopTiming) => {
          panel.store.setSoundFormDialogSoundId({ soundId: "sound-two" });
          handleSoundFormAction(panel, {
            _event: { detail: { actionId: "submit", values: { stopTiming } } },
          });
          await Promise.all(pendingUpdates);
          await handleBackClick(harness.deps);
        },
        remove: async () => {
          handleOptionSelected(panel, {
            _event: {
              currentTarget: { dataset: { name: "revealSoundId" } },
              detail: { item: { value: "" } },
            },
          });
          await Promise.all(pendingUpdates);
          await handleBackClick(harness.deps);
        },
      };
    };

    it("saves Loop End through panel events and restores it on reselection", async () => {
      const { save, savedItem, reselect } = createSoundHarness();
      await save("loopEnd");
      expect(savedItem()).toMatchObject({
        revealSoundId: "sound-two",
        revealSoundStopTiming: "loopEnd",
      });
      expect(reselect()).toMatchObject({
        selectedSoundId: "sound-two",
        stopTiming: "loopEnd",
      });
      await save("immediate");
      expect(savedItem().revealSoundStopTiming).toBe("immediate");
      expect(reselect().stopTiming).toBe("immediate");
    });

    it("removes the saved Stop setting so a new sound uses Immediate", async () => {
      const { save, remove, savedItem, reselect } =
        createSoundHarness("loopEnd");
      await remove();
      expect(savedItem()).not.toHaveProperty("revealSoundId");
      expect(savedItem()).not.toHaveProperty("revealSoundStopTiming");
      const dialog = reselect();
      expect(dialog.stopTiming).toBe("immediate");
      await save(dialog.stopTiming);
      expect(savedItem()).toMatchObject({
        revealSoundId: "sound-two",
        revealSoundStopTiming: "immediate",
      });
    });

    it.each([undefined, "", "invalid"])(
      "normalizes invalid Stop value %s before persistence",
      async (value) => {
        const { save, savedItem } = createSoundHarness("loopEnd");
        await save(value);
        expect(savedItem().revealSoundStopTiming).toBe("immediate");
      },
    );
  },
);

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
    deps.store.setRightPanelMode = vi.fn();
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
          itemId: "selected-item",
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

  it("accepts metrics for a repeated occurrence of the selected authored item", () => {
    const metrics = {
      id: "selected-item-instance-2",
      width: 76,
      height: 54,
    };
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => "selected-item"),
        selectDetailPanelSelectedItemId: vi.fn(() => "selected-item"),
        setSelectedElementMetrics: vi.fn(),
      },
      refs: {
        layoutEditPanel: {
          getSelectedElementMetrics: vi.fn(),
          setSelectedElementMetrics: vi.fn(),
        },
      },
    };

    handleLayoutEditorCanvasMetricsChange(deps, {
      _event: {
        detail: {
          itemId: "selected-item",
          metrics,
        },
      },
    });

    expect(deps.store.setSelectedElementMetrics).toHaveBeenCalledWith({
      metrics,
    });
    expect(
      deps.refs.layoutEditPanel.setSelectedElementMetrics,
    ).toHaveBeenCalledWith({ metrics });
  });
});

describe("layoutEditor.handleFileExplorerItemClick", () => {
  it("clears node selection after clicking empty explorer space", async () => {
    const store = {
      selectSelectedItemId: vi.fn(() => "node-1"),
      setSelectedItemId: vi.fn(),
      setDetailPanelSelectedItemId: vi.fn(),
      setRightPanelMode: vi.fn(),
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
      setRightPanelMode: vi.fn(),
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

describe("layoutEditor.handleFileExplorerItemClick (stepping)", () => {
  it("keeps the Elements list open when the selection comes from the up/down buttons", async () => {
    const store = {
      setSelectedItemId: vi.fn(),
      selectSelectedItemId: vi.fn(() => undefined),
      selectIsTouchMode: vi.fn(() => true),
      selectIsMobileFileExplorerOpen: vi.fn(() => true),
      setDetailPanelSelectedItemId: vi.fn(),
      setRightPanelMode: vi.fn(),
      closeMobileFileExplorer: vi.fn(),
    };
    const render = vi.fn();

    await handleFileExplorerItemClick(
      { store, refs: {}, render },
      {
        _event: {
          detail: {
            itemId: "node-2",
            source: "navigation",
          },
        },
      },
    );

    expect(store.setSelectedItemId).toHaveBeenCalledWith({ itemId: "node-2" });
    expect(store.setDetailPanelSelectedItemId).toHaveBeenCalledWith({
      itemId: "node-2",
    });
    expect(store.closeMobileFileExplorer).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe("layoutEditor.handleFileExplorerItemClick (tablet landscape pane)", () => {
  it("selects straight into the detail panel without needing the inline list to be open", async () => {
    const store = {
      setSelectedItemId: vi.fn(),
      selectSelectedItemId: vi.fn(() => undefined),
      selectIsTouchMode: vi.fn(() => true),
      selectIsMobileFileExplorerOpen: vi.fn(() => false),
      selectIsTabletLandscape: vi.fn(() => true),
      setDetailPanelSelectedItemId: vi.fn(),
      setRightPanelMode: vi.fn(),
      closeMobileFileExplorer: vi.fn(),
    };
    const render = vi.fn();

    await handleFileExplorerItemClick(
      { store, refs: {}, render },
      { _event: { detail: { itemId: "node-3" } } },
    );

    expect(store.setSelectedItemId).toHaveBeenCalledWith({ itemId: "node-3" });
    expect(store.setDetailPanelSelectedItemId).toHaveBeenCalledWith({
      itemId: "node-3",
    });
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe("layoutEditor.handleNodeMove*Click", () => {
  it.each([
    ["previous", handleNodeMovePreviousClick],
    ["next", handleNodeMoveNextClick],
  ])(
    "steps the highlighted element %s without wrapping",
    (direction, handler) => {
      const navigateSelection = vi.fn();

      handler({ refs: { fileExplorer: { navigateSelection } } });

      expect(navigateSelection).toHaveBeenCalledWith({
        direction,
        clamp: true,
      });
    },
  );
});

describe("layoutEditor.handleLayoutEditorCanvasBackgroundClick", () => {
  it("clears node and explorer selection after clicking outside the canvas", () => {
    const background = {};
    const store = {
      selectSelectedItemId: vi.fn(() => "node-1"),
      setSelectedItemId: vi.fn(),
      setDetailPanelSelectedItemId: vi.fn(),
      setRightPanelMode: vi.fn(),
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
      setRightPanelMode: vi.fn(),
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
      selectSelectedItemId: vi.fn(() => "node-1"),
      setSelectedItemId: vi.fn(),
      setDetailPanelSelectedItemId: vi.fn(),
      setRightPanelMode: vi.fn(),
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
      closeMobileFileExplorer: vi.fn(),
      setDetailPanelSelectedItemId: vi.fn(),
      setRightPanelMode: vi.fn(),
    };
    const render = vi.fn();

    handlePreviewButtonClick({ store, render });

    expect(store.closeMobileFileExplorer).toHaveBeenCalled();
    expect(store.setDetailPanelSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe("layoutEditor.handleNodeButtonClick", () => {
  it("opens the Elements list and clears the selected node", () => {
    const store = {
      selectSelectedItemId: vi.fn(() => "node-1"),
      selectIsMobileFileExplorerOpen: vi.fn(() => false),
      openMobileFileExplorer: vi.fn(),
      closeMobileFileExplorer: vi.fn(),
      setSelectedItemId: vi.fn(),
      setDetailPanelSelectedItemId: vi.fn(),
      setRightPanelMode: vi.fn(),
    };
    const render = vi.fn();

    handleNodeButtonClick({ store, render, refs: {} });

    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(store.setDetailPanelSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(store.openMobileFileExplorer).toHaveBeenCalled();
    expect(store.closeMobileFileExplorer).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("returns to the Elements list from the selected node's back button and unselects the node", () => {
    const calls = [];
    const store = {
      selectSelectedItemId: vi.fn(() => "node-1"),
      selectIsMobileFileExplorerOpen: vi.fn(() => false),
      openMobileFileExplorer: vi.fn(() => calls.push("open")),
      closeMobileFileExplorer: vi.fn(),
      setSelectedItemId: vi.fn(() => calls.push("deselect")),
      setDetailPanelSelectedItemId: vi.fn(() => calls.push("clear-detail")),
      setRightPanelMode: vi.fn(),
    };
    const render = vi.fn(() => calls.push("render"));

    handleNodeDetailBackClick({ store, render, refs: {} });

    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(store.setDetailPanelSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(store.closeMobileFileExplorer).not.toHaveBeenCalled();
    expect(calls).toEqual(["deselect", "clear-detail", "open", "render"]);
  });

  it("closes the node explorer when it is already open", () => {
    const store = {
      selectIsMobileFileExplorerOpen: vi.fn(() => true),
      selectSelectedItemId: vi.fn(() => "node-1"),
      openMobileFileExplorer: vi.fn(),
      closeMobileFileExplorer: vi.fn(),
    };
    const render = vi.fn();

    handleNodeButtonClick({ store, render, refs: {} });

    expect(store.closeMobileFileExplorer).toHaveBeenCalled();
    expect(store.openMobileFileExplorer).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe("layoutEditor.handleBeforeMount", () => {
  const createMountDeps = ({ isTouchMode }) => ({
    appService: { registerBeforeNavigation: vi.fn(() => vi.fn()) },
    store: {
      setUiConfig: vi.fn(),
      selectIsTouchMode: vi.fn(() => isTouchMode),
      openMobileFileExplorer: vi.fn(),
    },
    uiConfig: { inputMode: isTouchMode ? "touch" : "mouse" },
    subject: new Subject(),
    browserEventsClient: { subscribeWindowEvent: vi.fn(() => vi.fn()) },
  });

  it("starts touch layouts on the node explorer instead of the preview", () => {
    const deps = createMountDeps({ isTouchMode: true });

    handleBeforeMount(deps);

    expect(deps.store.setUiConfig).toHaveBeenCalledWith({
      uiConfig: deps.uiConfig,
    });
    expect(deps.store.openMobileFileExplorer).toHaveBeenCalledTimes(1);
  });

  it("keeps the window metrics in the store for the tablet landscape layout", () => {
    const deps = createMountDeps({ isTouchMode: true });
    let publish;
    deps.windowMetricsClient = {
      subscribe: vi.fn((listener) => {
        publish = listener;
        return vi.fn();
      }),
    };
    deps.store.setAppWindowMetrics = vi.fn();
    deps.store.selectSelectedItemId = vi.fn(() => undefined);
    deps.render = vi.fn();

    handleBeforeMount(deps);
    publish({ width: 1408, height: 880 });

    expect(deps.store.setAppWindowMetrics).toHaveBeenCalledWith({
      width: 1408,
      height: 880,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("re-highlights the selected element in the explorer that appears after rotating", () => {
    vi.useFakeTimers();

    try {
      const selectItem = vi.fn();
      const deps = createMountDeps({ isTouchMode: true });
      let publish;
      deps.windowMetricsClient = {
        subscribe: vi.fn((listener) => {
          publish = listener;
          return vi.fn();
        }),
      };
      deps.store.setAppWindowMetrics = vi.fn();
      deps.store.selectSelectedItemId = vi.fn(() => "node-1");
      deps.render = vi.fn();
      deps.refs = { fileExplorer: { selectItem } };

      handleBeforeMount(deps);
      publish({ width: 1408, height: 880 });

      expect(selectItem).not.toHaveBeenCalled();

      vi.runAllTimers();

      expect(selectItem).toHaveBeenCalledWith({ itemId: "node-1" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not open the mobile node explorer on desktop layouts", () => {
    const deps = createMountDeps({ isTouchMode: false });

    handleBeforeMount(deps);

    expect(deps.store.openMobileFileExplorer).not.toHaveBeenCalled();
  });
});

describe("layoutEditor right panel mode", () => {
  const createModeStore = (overrides = {}) => ({
    setSelectedItemId: vi.fn(),
    selectSelectedItemId: vi.fn(() => undefined),
    selectIsTouchMode: vi.fn(() => false),
    setDetailPanelSelectedItemId: vi.fn(),
    setRightPanelMode: vi.fn(),
    closeMobileFileExplorer: vi.fn(),
    ...overrides,
  });

  it("switches the right panel when a tab is picked", () => {
    const store = createModeStore();
    const render = vi.fn();

    handleRightPanelModeChange(
      { store, render },
      { _event: { detail: { id: "edit" } } },
    );

    expect(store.setRightPanelMode).toHaveBeenCalledWith({ mode: "edit" });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("shows Edit as soon as an element is picked on a touch layout", async () => {
    const store = createModeStore({
      selectIsTouchMode: vi.fn(() => true),
      selectIsMobileFileExplorerOpen: vi.fn(() => false),
      selectIsTabletLandscape: vi.fn(() => true),
    });

    await handleFileExplorerItemClick(
      { store, refs: {}, render: vi.fn() },
      { _event: { detail: { itemId: "node-1" } } },
    );

    expect(store.setRightPanelMode).toHaveBeenCalledWith({ mode: "edit" });
  });

  it("shows Edit when the canvas selects an element and Preview when it clears", () => {
    const store = createModeStore({
      selectIsTouchMode: vi.fn(() => true),
      selectSelectedItemId: vi.fn(() => "node-1"),
    });
    const refs = {
      fileExplorer: { selectItem: vi.fn(), clearSelection: vi.fn() },
    };

    handleLayoutEditorCanvasSelectionChange(
      { store, refs, render: vi.fn() },
      { _event: { detail: { itemId: "node-1" } } },
    );
    expect(store.setRightPanelMode).toHaveBeenLastCalledWith({ mode: "edit" });

    handleLayoutEditorCanvasSelectionChange(
      { store, refs, render: vi.fn() },
      { _event: { detail: {} } },
    );
    expect(store.setRightPanelMode).toHaveBeenLastCalledWith({
      mode: "preview",
    });
  });

  it("shows Preview again after clearing the selection from the explorer or canvas background", async () => {
    const store = createModeStore({
      selectSelectedItemId: vi.fn(() => "node-1"),
    });
    const refs = { fileExplorer: { clearSelection: vi.fn() } };

    await handleFileExplorerItemClick(
      { store, refs, render: vi.fn() },
      { _event: { detail: {} } },
    );
    expect(store.setRightPanelMode).toHaveBeenLastCalledWith({
      mode: "preview",
    });

    store.setRightPanelMode.mockClear();
    const background = {};
    handleLayoutEditorCanvasBackgroundClick(
      { store, refs, render: vi.fn() },
      { _event: { target: background, currentTarget: background } },
    );
    expect(store.setRightPanelMode).toHaveBeenCalledWith({ mode: "preview" });
  });

  it("keeps the tab when nothing was selected", async () => {
    const store = createModeStore();
    const refs = { fileExplorer: { clearSelection: vi.fn() } };
    const background = {};

    handleLayoutEditorCanvasBackgroundClick(
      { store, refs, render: vi.fn() },
      { _event: { target: background, currentTarget: background } },
    );
    await handleFileExplorerItemClick(
      { store, refs, render: vi.fn() },
      { _event: { detail: {} } },
    );
    handleLayoutEditorCanvasSelectionChange(
      { store, refs, render: vi.fn() },
      { _event: { detail: { itemId: undefined } } },
    );

    expect(store.setRightPanelMode).not.toHaveBeenCalled();
    expect(refs.fileExplorer.clearSelection).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["is already loaded in the detail panel", "node-1"],
    ["has not loaded in the detail panel yet", undefined],
  ])(
    "shows Edit on desktop when the clicked element %s",
    async (_name, loadedDetailId) => {
      vi.useFakeTimers();

      try {
        let requestId;
        const store = createModeStore({
          requestDetailPanelSelectionSync: vi.fn((payload) => {
            requestId = payload.requestId;
          }),
          selectDetailPanelSelectionRequestId: vi.fn(() => requestId),
          selectSelectedItemId: vi.fn(() => "node-1"),
          selectDetailPanelSelectedItemId: vi.fn(() => loadedDetailId),
        });
        const render = vi.fn();

        await handleFileExplorerItemClick(
          { store, refs: {}, render },
          { _event: { detail: { itemId: "node-1" } } },
        );
        vi.runAllTimers();

        expect(store.setRightPanelMode).toHaveBeenCalledWith({ mode: "edit" });
        if (loadedDetailId === undefined) {
          expect(store.setDetailPanelSelectedItemId).toHaveBeenCalledWith({
            itemId: "node-1",
          });
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
