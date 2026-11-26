import { generateId } from "../../internal/id.js";
import { getResourcePageErrorMessage } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { mountMobileResourceWindowLayout } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { concatMap, debounceTime, filter, from } from "rxjs";
import {
  createCollabRemoteRefreshStream,
  matchesRemoteTargets,
} from "../../internal/ui/collabRefresh.js";
import { isSqliteLockError } from "../../internal/sqliteLocking.js";
import {
  getLayoutEditorBackPath,
  resolveLayoutEditorPayload,
} from "../../internal/layoutEditorRoute.js";
import { buildLayoutEditPanelUpdatedItem } from "../../internal/ui/layoutEditor/layoutEditorMutations.js";
import {
  promptLayoutEditorNewElements,
  resolvePromptedNewElementAction,
} from "../../internal/ui/layoutEditor/layoutEditorNewElements.js";
import {
  persistLayoutEditorElementUpdate,
  shouldPersistLayoutEditorFieldImmediately,
} from "./support/layoutEditorPersistence.js";
import {
  enqueueLayoutEditorPersistence,
  waitForLayoutEditorPersistenceIdle,
} from "./support/layoutEditorPersistenceQueue.js";
import {
  notifyLayoutEditorSaveFailure,
  toLayoutEditorSaveError,
} from "../../internal/ui/layoutEditor/layoutEditorSaveFailure.js";
import {
  captureLayoutElementSnapshot,
  getChangedLayoutElementIds,
  restoreLayoutElementSnapshot,
} from "../../internal/project/layout.js";
import { getEditHistoryOwner } from "../../internal/editHistory.js";
import {
  resolveEditHistoryShortcut,
  selectEditHistoryCopy,
} from "../../internal/ui/editHistory.js";
import { withErrorDetails } from "../../internal/errorDetails.js";
import { createLayoutElementsFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createLayoutEditorRepositoryStoreData } from "./support/layoutEditorRepositoryState.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { selectLayoutEditorPageCopy } from "../../internal/ui/layoutEditor/layoutEditorCopy.js";

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const scheduleAfterNextPaint = (callback) => {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => {
        callback();
      });
    });
    return;
  }

  globalThis.setTimeout(callback, 32);
};

const DEBOUNCE_DELAYS = {
  UPDATE: 500,
};

const LAYOUT_EDITOR_PERSIST_ERROR_COOLDOWN_MS = 1500;

const selectCopy = (deps = {}) => selectLayoutEditorPageCopy(deps.i18n);

// The localized message leads; the failure's own text follows as details.
const getResultErrorMessage = (appService, errorOrResult, fallbackMessage) =>
  getResourcePageErrorMessage({ appService, errorOrResult, fallbackMessage });

const showLayoutEditorError = ({
  appService,
  error,
  fallbackMessage,
  lockedMessage = fallbackMessage,
  copy = {},
} = {}) => {
  const message = isSqliteLockError(error)
    ? lockedMessage
    : error?.message || fallbackMessage;
  appService.showAlert({ message: message, title: copy.errorTitle ?? "Error" });
};

// Failures of saves in the background can come close together, as when
// several drags fail one after another. The first alert explains them all.
// Returns whether this failure should be announced, and counts it if so.
const claimLayoutEditorSaveFailureAlert = (store) => {
  const now = Date.now();
  const lastPersistErrorAt = store.selectLastPersistErrorAt();
  if (
    Number.isFinite(lastPersistErrorAt) &&
    now - lastPersistErrorAt < LAYOUT_EDITOR_PERSIST_ERROR_COOLDOWN_MS
  ) {
    return false;
  }
  store.setLastPersistErrorAt({
    timestamp: now,
  });
  return true;
};

const runLayoutEditorPersistence = (deps, task) => {
  return enqueueLayoutEditorPersistence({
    owner: deps.projectService,
    task,
  });
};

const PREVIEW_AUTOSAVE_ACTION = "layoutEditor.savePreview";

// Saves the preview data when the user edited it since the last save. It
// saves on its own, outside the undo history, in order with element edits.
// A save that fails is not repeated, and the user is told.
const saveLayoutEditorPreview = (deps) => {
  const { appService, i18n, projectService, store } = deps;
  return runLayoutEditorPersistence(deps, async () => {
    const layoutId = store.selectLayoutId();
    const version = store.selectPreviewEditVersion();
    const previewData = store.selectUnsavedPreviewData();
    if (!layoutId || !previewData) {
      return { ok: true };
    }

    const copy = selectCopy(deps);
    const resourceType = store.selectLayoutResourceType();
    const { ownerPayloadKey, ownerLabel, updateItem } =
      getLayoutEditorOwnerConfig(resourceType, projectService, copy);
    const failedMessage = formatI18nCopy(
      copy.failedSaveOwnerPreview ?? "Failed to save {ownerLabel} preview.",
      { ownerLabel: ownerLabel.toLowerCase() },
    );
    try {
      const result = await updateItem({
        [ownerPayloadKey]: layoutId,
        data: { preview: previewData },
      });
      if (result?.valid === false) {
        throw toLayoutEditorSaveError(result.error, failedMessage);
      }
      store.markPreviewDataSaved({ previewData, version });
      return { ok: true };
    } catch (failure) {
      const error = toLayoutEditorSaveError(failure, failedMessage);
      // The Preview keeps showing what it shows. Only the save is given up,
      // so that leaving the page does not try it again.
      store.markPreviewDataSaveFailed({ version });
      console.error("[layoutEditor] Failed to save the preview", {
        error,
        layoutId,
        resourceType,
      });
      notifyLayoutEditorSaveFailure({
        appService,
        detailsLabel: i18n.appPage.errorDetailsLabel,
        error,
        message: failedMessage,
        operation: "layoutEditor.savePreview",
        showAlert: claimLayoutEditorSaveFailureAlert(store),
        title: copy.errorTitle ?? "Error",
      });
      return { ok: false };
    }
  });
};

const getLayoutEditorOwnerConfig = (
  resourceType,
  projectService,
  copy = {},
) => {
  const isControls = resourceType === "controls";
  return {
    ownerPayloadKey: isControls ? "controlId" : "layoutId",
    ownerLabel: isControls
      ? (copy.controlLabel ?? "Control")
      : (copy.layoutLabel ?? "Layout"),
    ownerMissingMessage: isControls
      ? (copy.controlMissing ?? "Control is missing.")
      : (copy.layoutMissing ?? "Layout is missing."),
    updateItem: isControls
      ? projectService.updateControlItem.bind(projectService)
      : projectService.updateLayoutItem.bind(projectService),
    updateElement: isControls
      ? projectService.updateControlElement.bind(projectService)
      : projectService.updateLayoutElement.bind(projectService),
    createElement: isControls
      ? projectService.createControlElement.bind(projectService)
      : projectService.createLayoutElement.bind(projectService),
    deleteElement: isControls
      ? projectService.deleteControlElement.bind(projectService)
      : projectService.deleteLayoutElement.bind(projectService),
    moveElement: isControls
      ? projectService.moveControlElement.bind(projectService)
      : projectService.moveLayoutElement.bind(projectService),
  };
};

const resolveMenuItem = (detail = {}) => detail.item || detail;

const areSelectedElementMetricsEqual = (left, right) => {
  return (
    left?.id === right?.id &&
    left?.type === right?.type &&
    left?.width === right?.width &&
    left?.height === right?.height &&
    left?.measuredWidth === right?.measuredWidth
  );
};

const areLayoutEditorItemsEquivalent = (left, right) => {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
};

const getEditorPayload = (appService) =>
  resolveLayoutEditorPayload(appService.getPayload() || {});

const queuePendingLayoutEditorPersist = (
  deps,
  { layoutId, resourceType, selectedItemId, updatedItem, replace } = {},
) => {
  const { store } = deps;
  // Only one edit waits for the debounced save. An edit to another element
  // would replace it unsaved, so save the waiting one now. Saves run in
  // order, and the newer edit stays on top when this one finishes.
  const waitingPayload = store.selectPendingPersistPayload();
  if (
    waitingPayload &&
    (waitingPayload.layoutId !== layoutId ||
      waitingPayload.resourceType !== resourceType ||
      waitingPayload.selectedItemId !== selectedItemId)
  ) {
    store.addSavingPersistPayload({ payload: waitingPayload });
    void handleDebouncedUpdate(deps, waitingPayload);
  }

  const pendingPayload = {
    layoutId,
    resourceType,
    selectedItemId,
    updatedItem,
    replace,
    persistenceRequestId: generateId(),
  };

  store.setPendingPersistPayload({
    payload: pendingPayload,
  });

  return pendingPayload;
};

// Saves every edit waiting to save, and then the preview data. A save that
// fails has already dropped its changes and told the user, so the others
// still save. The result says whether everything was saved.
const flushQueuedLayoutEditorUpdates = async (deps) => {
  const { projectService, store } = deps;
  let allSaved = true;

  while (true) {
    const pendingPayload = store.selectPendingPersistPayload();
    if (pendingPayload) {
      const flushResult = await handleDebouncedUpdate(deps, pendingPayload);
      if (flushResult.ok === false) {
        allSaved = false;
      }
      continue;
    }

    const idleResult = await waitForLayoutEditorPersistenceIdle({
      owner: projectService,
    });
    if (idleResult?.ok === false) {
      allSaved = false;
    }

    if (!store.selectPendingPersistPayload()) {
      break;
    }
  }

  const previewResult = await saveLayoutEditorPreview(deps);
  return { ok: allSaved && previewResult.ok };
};

// A layout and a control are edited here, each with its own undo history.
const getLayoutEditorHistoryOwner = ({ layoutId, resourceType }) =>
  getEditHistoryOwner(`layout:${resourceType}`, layoutId);

// Records an edit the page makes to its elements, from what it shows before
// and after, so the edit can be undone before it is saved.
const recordLayoutEditorEdit = (
  deps,
  { elementIds, apply, time = Date.now() },
) => {
  const { store } = deps;
  const before = captureLayoutElementSnapshot(
    store.selectLayoutElements(),
    elementIds,
  );
  apply();
  store.recordEditHistoryStep({
    before,
    after: captureLayoutElementSnapshot(
      store.selectLayoutElements(),
      elementIds,
    ),
    // Quick edits to one element, such as a drag, are one step.
    mergeKey: elementIds.length === 1 ? `element:${elementIds[0]}` : undefined,
    time,
  });
};

// Explorer actions change the tree and then refresh from the repository, so
// they are recorded as every element that changed. Edits waiting to save are
// saved first, so the action's writes come after them, and undo and redo wait
// while it runs, so the step holds only the action's change.
const recordLayoutEditorStructureEdit = async (deps, run) => {
  const { render, store } = deps;
  const flushResult = await flushQueuedLayoutEditorUpdates(deps);
  if (flushResult.ok === false) {
    return;
  }
  const before = store.selectLayoutElements();
  store.setStructureEditRunning({ running: true });
  try {
    await run();
  } finally {
    store.setStructureEditRunning({ running: false });
  }
  const after = store.selectLayoutElements();
  const elementIds = getChangedLayoutElementIds(before, after);
  store.recordEditHistoryStep({
    before: captureLayoutElementSnapshot(before, elementIds),
    after: captureLayoutElementSnapshot(after, elementIds),
    time: Date.now(),
  });
  render();
};

// Clearing a selection leaves the tab as it is. Edit shows its placeholder
// when nothing is selected.
const clearSelectedItem = (store) => {
  store.setSelectedItemId({ itemId: undefined });
  store.setDetailPanelSelectedItemId({ itemId: undefined });
};

// Clears the selection on the canvas, in the Edit panel and in the Elements
// list.
const clearSelection = (deps) => {
  const { refs, store } = deps;
  clearSelectedItem(store);
  refs.fileExplorer?.clearSelection?.();
};

// A press on empty canvas clears the selection. Under the canvas on phones,
// where Edit was showing the element, the panel stays in Edit and goes to
// the Elements list.
const clearCanvasSelection = (deps) => {
  const { store } = deps;
  const wasEditingElement =
    store.selectShowsMobilePanels() &&
    Boolean(store.selectDetailPanelSelectedItemId());

  clearSelection(deps);
  if (wasEditingElement) {
    store.openMobileFileExplorer();
  }
};

// An undo or redo can remove the selected element, as when it undoes the
// element's create.
const clearMissingLayoutEditorSelection = (deps) => {
  const { store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId || store.selectItemDataById({ itemId: selectedItemId })) {
    return;
  }
  clearSelection(deps);
};

// Saves the creates, deletes, and moves of an undone or redone step after
// any save already queued. Until then the store keeps the step on top of
// repository data; after, the page shows what is stored.
const saveLayoutEditorHistoryRestore = async (
  deps,
  { restoreId, operations },
) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const owner = getLayoutEditorOwnerConfig(resourceType, projectService, copy);
  const saveOperation = {
    create: owner.createElement,
    delete: owner.deleteElement,
    move: owner.moveElement,
    update: owner.updateElement,
  };

  const result = await runLayoutEditorPersistence(deps, async () => {
    try {
      for (const { type, ...operation } of operations) {
        const saveResult = await saveOperation[type]({
          [owner.ownerPayloadKey]: layoutId,
          ...operation,
        });
        if (saveResult?.valid === false) {
          return { ok: false, error: saveResult.error };
        }
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  });

  store.clearPendingHistoryRestore({ restoreId });
  if (!result.ok) {
    console.error("[layoutEditor] Failed to save an undo or redo", {
      error: result.error,
      layoutId,
      resourceType,
    });
    // It fails in the background, after the undo was shown.
    appService.showAlertWhenIdle({
      title: copy.errorTitle ?? "Error",
      message: withErrorDetails(
        isSqliteLockError(result.error)
          ? (copy.databaseBusySaveLayoutChanges ??
              "The project database is busy. RouteVN couldn't save the latest layout changes. Please wait a moment and try again.")
          : (copy.failedSaveLayoutChanges ?? "Failed to save layout changes."),
        result.error,
        deps.i18n.appPage.errorDetailsLabel,
      ),
    });
  }
  store.syncRepositoryState(
    createLayoutEditorRepositoryStoreData({
      repositoryState: projectService.getRepositoryState(),
      layoutId,
      resourceType,
    }),
  );
  clearMissingLayoutEditorSelection(deps);
  render();
};

// Undo and redo behave like an edit: the page shows the result at once and
// saves it in the background, after any edit waiting to save.
const runLayoutEditorHistoryStep = (deps, direction) => {
  const { appService, i18n, refs, render, store, subject } = deps;
  if (store.selectIsStructureEditRunning()) {
    return;
  }
  const getTarget = (step) => (direction === "undo" ? step.before : step.after);

  // A step whose elements already match changes nothing, such as one whose
  // save failed and was put back; pass over it to the next.
  let step = store.selectEditHistoryStep({ direction });
  let restore;
  while (step) {
    restore = restoreLayoutElementSnapshot({
      elements: store.selectLayoutElements(),
      target: getTarget(step),
    });
    if (!restore.valid || restore.operations.length > 0) {
      break;
    }
    store.moveEditHistoryStep({ direction });
    step = store.selectEditHistoryStep({ direction });
  }
  if (!step) {
    render();
    return;
  }
  if (!restore.valid) {
    const copy = selectEditHistoryCopy(i18n);
    store.dropEditHistoryStep({ direction });
    appService.showToast({
      message:
        direction === "undo"
          ? copy.undoUnavailableMessage
          : copy.redoUnavailableMessage,
      status: "warning",
    });
    render();
    return;
  }
  store.moveEditHistoryStep({ direction });

  // The canvas keeps the item it is moving until the page has its position;
  // drop it so the canvas shows the restored item.
  refs.layoutEditorCanvas.discardPendingUpdate();
  if (restore.operations.every(({ type }) => type === "update")) {
    // Each restored element is a waiting edit, so an edit not saved yet is
    // replaced instead of saved and then undone.
    const layoutId = store.selectLayoutId();
    const resourceType = store.selectLayoutResourceType();
    for (const { elementId } of restore.operations) {
      const updatedItem = restore.elements.items[elementId];
      store.updateSelectedItem({ itemId: elementId, updatedItem });
      subject.dispatch(
        "layoutEditor.updateElement",
        queuePendingLayoutEditorPersist(deps, {
          layoutId,
          resourceType,
          selectedItemId: elementId,
          updatedItem,
        }),
      );
    }
  } else {
    const target = getTarget(step);
    const restoreId = generateId();
    store.applyHistoryRestore({
      restoreId,
      target,
      elements: restore.elements,
    });
    // An edit still waiting to save for a restored element would otherwise
    // land on top of the restore.
    const waitingPayload = store.selectPendingPersistPayload();
    if (
      waitingPayload &&
      Object.hasOwn(target, waitingPayload.selectedItemId)
    ) {
      const updatedItem = restore.elements.items[waitingPayload.selectedItemId];
      if (updatedItem) {
        subject.dispatch(
          "layoutEditor.updateElement",
          queuePendingLayoutEditorPersist(deps, {
            layoutId: waitingPayload.layoutId,
            resourceType: waitingPayload.resourceType,
            selectedItemId: waitingPayload.selectedItemId,
            updatedItem,
          }),
        );
      } else {
        store.clearPendingPersistPayload({
          persistenceRequestId: waitingPayload.persistenceRequestId,
        });
      }
    }
    void saveLayoutEditorHistoryRestore(deps, {
      restoreId,
      operations: restore.operations,
    });
  }
  clearMissingLayoutEditorSelection(deps);
  render();
};

export const handleUndoButtonClick = (deps) => {
  runLayoutEditorHistoryStep(deps, "undo");
};

export const handleRedoButtonClick = (deps) => {
  runLayoutEditorHistoryStep(deps, "redo");
};

// Rotating swaps between the left pane and the inline list. Whichever one
// mounts has no selection of its own, so point it at the selected element.
const syncExplorerSelectionAfterLayoutChange = (deps) => {
  const { refs, store } = deps;
  const selectedItemId = store.selectSelectedItemId();

  if (!selectedItemId) {
    return;
  }

  scheduleAfterNextPaint(() => {
    refs.fileExplorer?.selectItem?.({ itemId: selectedItemId });
  });
};

export const handleBeforeMount = (deps) => {
  const { appService, browserEventsClient, projectService, store, uiConfig } =
    deps;
  store.setUiConfig({ uiConfig });
  // Touch layouts start on the node explorer instead of the Preview section.
  if (store.selectIsTouchMode()) {
    store.openMobileFileExplorer();
  }

  const cleanupSubscriptions = mountSubscriptions(deps);
  const cleanupWindowLayout = mountMobileResourceWindowLayout({
    windowMetricsClient: deps.windowMetricsClient,
    store,
    render: () => {
      deps.render();
      syncExplorerSelectionAfterLayoutChange(deps);
    },
  });
  const unsubscribeHistoryShortcuts = browserEventsClient.subscribeWindowEvent({
    type: "keydown",
    options: { capture: true },
    listener: (event) => {
      const direction = resolveEditHistoryShortcut(event);
      if (!direction) {
        return;
      }
      event.preventDefault();
      runLayoutEditorHistoryStep(deps, direction);
    },
  });
  const unregisterBeforeNavigation = appService.registerBeforeNavigation(
    async ({ reason } = {}) => {
      // Leaving never waits on a failed save and never throws for it: the
      // save dropped its own changes and told the user, as the page cannot
      // wait on it when the app goes to the background or quits.
      await flushQueuedLayoutEditorUpdates(deps);
      // A layout's thumbnail follows in the background, once the page is
      // left: the app going to the background or quitting only saves.
      // Controls show none.
      const layoutId = store.selectLayoutId();
      if (
        layoutId &&
        store.selectLayoutResourceType() === "layouts" &&
        !reason
      ) {
        void projectService.requestLayoutThumbnails({
          layoutIds: [layoutId],
        });
      }
    },
  );
  return async () => {
    // Kept for coming back to this layout, before the save below can let the
    // next page open.
    appService.retainEditHistory({
      owner: getLayoutEditorHistoryOwner({
        layoutId: store.selectLayoutId(),
        resourceType: store.selectLayoutResourceType(),
      }),
      history: store.selectEditHistory(),
    });
    unsubscribeHistoryShortcuts();
    unregisterBeforeNavigation();
    await flushQueuedLayoutEditorUpdates(deps);
    cleanupSubscriptions?.();
    cleanupWindowLayout?.();
  };
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService, store, render } = deps;
  const payload = getEditorPayload(appService);
  const { layoutId, resourceType } = payload;
  await projectService.ensureRepository();
  store.syncRepositoryState(
    createLayoutEditorRepositoryStoreData({
      repositoryState: projectService.getRepositoryState(),
      layoutId,
      resourceType,
    }),
  );
  store.resumeEditHistory({
    retainedEditHistory: appService.getRetainedEditHistory({
      owner: getLayoutEditorHistoryOwner({
        layoutId: store.selectLayoutId(),
        resourceType: store.selectLayoutResourceType(),
      }),
    }),
  });
  render();

  scheduleAfterNextPaint(() => {
    if (store.selectIsPreviewMounted() === true) {
      return;
    }

    store.setPreviewMounted({
      isMounted: true,
    });
    render();
  });
};

export const handleBackClick = async (deps) => {
  const { appService } = deps;
  const flushResult = await flushQueuedLayoutEditorUpdates(deps);
  if (!flushResult.ok) {
    return;
  }
  const currentPayload = appService.getPayload() || {};
  const nextPath = getLayoutEditorBackPath(currentPayload);
  appService.navigate(
    nextPath,
    { p: currentPayload.p },
    {
      historyMode: "replace",
    },
  );
};

// Simple render handler for events that only need to trigger a re-render
export const handleRenderOnly = (deps) => {
  const { render } = deps;
  render();
};

const scheduleDetailPanelSelectionRender = (deps, { itemId } = {}) => {
  const { store, render } = deps;
  const requestId = generateId();
  store.requestDetailPanelSelectionSync({
    itemId,
    requestId,
  });

  const run = () => {
    if (store.selectDetailPanelSelectionRequestId?.() !== requestId) {
      return;
    }

    if (store.selectSelectedItemId() !== itemId) {
      return;
    }

    store.setRightPanelMode({ mode: "edit" });
    if (store.selectDetailPanelSelectedItemId?.() === itemId) {
      render();
      return;
    }

    store.setDetailPanelSelectedItemId({
      itemId,
    });
    render();
  };

  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(run);
    });
    return;
  }

  globalThis.setTimeout?.(run, 0);
};

export const handleFileExplorerItemClick = async (deps, payload) => {
  const { store, refs, render } = deps;
  const detail = payload._event.detail || {};
  const itemId = detail.id || detail.itemId || detail.item?.id;
  if (!itemId) {
    clearSelectedItem(store);
    render();
    return;
  }

  if (store.selectSelectedItemId() === itemId) {
    void refs.layoutEditorCanvas?.useDefaultSelectionOccurrence?.();
  }

  store.setSelectedItemId({ itemId: itemId });
  if (
    store.selectIsTouchMode?.() &&
    (store.selectIsMobileFileExplorerOpen?.() ||
      store.selectIsTabletLandscape?.())
  ) {
    store.setDetailPanelSelectedItemId({
      itemId,
    });
    store.setRightPanelMode({ mode: "edit" });
    // Stepping with the up/down buttons keeps the Elements list open.
    if (detail.source !== "navigation") {
      store.closeMobileFileExplorer();
    }
    render();
    return;
  }

  render();
  scheduleDetailPanelSelectionRender(deps, {
    itemId,
  });
};

export const handleLayoutEditorCanvasSelectionChange = (deps, payload) => {
  const { store, refs, render } = deps;
  const { itemId } = payload._event.detail;

  if (!itemId) {
    clearCanvasSelection(deps);
    render();
    return;
  }

  store.setSelectedItemId({ itemId });
  refs.fileExplorer?.selectItem?.({ itemId });

  if (store.selectIsTouchMode?.()) {
    store.setDetailPanelSelectedItemId({ itemId });
    store.setRightPanelMode({ mode: "edit" });
    render();
    return;
  }

  render();
  scheduleDetailPanelSelectionRender(deps, { itemId });
};

export const handleLayoutEditorCanvasBackgroundClick = (deps, payload) => {
  const { store, refs, render } = deps;
  const event = payload._event;

  if (
    event.target !== event.currentTarget ||
    store.selectIsCanvasSelectionDisabled()
  ) {
    return;
  }

  clearCanvasSelection(deps);
  render();
};

export const handleFileExplorerVisibilityToggle = async (deps, payload) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  const { itemId, hidden } = payload?._event?.detail ?? {};
  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();

  if (!itemId || !layoutId || typeof hidden !== "boolean") {
    return;
  }

  const flushResult = await flushQueuedLayoutEditorUpdates(deps);
  if (flushResult.ok === false) {
    return;
  }

  const currentItem = store.selectItemDataById({ itemId });
  if (!currentItem || currentItem.hidden === hidden) {
    return;
  }

  const updatedItem = {
    ...currentItem,
    hidden,
  };
  // A rollback records at the same time, so it merges into this step and
  // cancels it however long the save took.
  const toggleTime = Date.now();
  recordLayoutEditorEdit(deps, {
    elementIds: [itemId],
    apply: () => store.updateSelectedItem({ itemId, updatedItem }),
    time: toggleTime,
  });
  render();

  const { ownerPayloadKey, updateElement } = getLayoutEditorOwnerConfig(
    resourceType,
    projectService,
    copy,
  );

  const rollback = () => {
    recordLayoutEditorEdit(deps, {
      elementIds: [itemId],
      apply: () =>
        store.updateSelectedItem({ itemId, updatedItem: currentItem }),
      time: toggleTime,
    });
    render();
  };
  const showError = (error) => {
    appService.showAlert({
      message: isSqliteLockError(error)
        ? (copy.databaseBusyUpdateElementVisibility ??
          "The project database is busy. RouteVN couldn't update element visibility. Please wait a moment and try again.")
        : (copy.failedUpdateElementVisibility ??
          "Failed to update element visibility."),
      title: copy.errorTitle ?? "Error",
    });
  };

  try {
    await projectService.ensureRepository();
    const persistenceResult = await runLayoutEditorPersistence(
      deps,
      async () => {
        const updateResult = await updateElement({
          [ownerPayloadKey]: layoutId,
          elementId: itemId,
          data: {
            hidden,
          },
          replace: false,
        });

        return {
          ok: updateResult?.valid !== false,
          updateResult,
        };
      },
    );

    if (persistenceResult.ok === false) {
      console.error("[layoutEditor] Element visibility update was rejected", {
        error: persistenceResult.updateResult?.error,
        itemId,
        layoutId,
        resourceType,
      });
      rollback();
      showError(persistenceResult.updateResult?.error);
    }
  } catch (error) {
    console.error("[layoutEditor] Failed to update element visibility", {
      error,
      itemId,
      layoutId,
      resourceType,
    });
    rollback();
    showError(error);
  }
};

// Going to the Elements list leaves nothing selected on the canvas.
const openMobileNodeExplorer = (deps) => {
  const { render, store } = deps;

  clearSelectedItem(store);
  store.openMobileFileExplorer();
  render();
};

// On phones, Edit goes back to the element selected on the canvas, or opens
// the Elements list when none is; Preview shows the preview under the canvas
// with nothing selected.
export const handleMobilePanelModeChange = (deps, payload) => {
  const { render, store } = deps;
  const { id } = payload._event.detail;

  if (id === "preview") {
    store.closeMobileFileExplorer();
    clearSelection(deps);
    render();
    return;
  }

  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    openMobileNodeExplorer(deps);
    return;
  }

  store.closeMobileFileExplorer();
  store.setDetailPanelSelectedItemId({ itemId: selectedItemId });
  store.setRightPanelMode({ mode: "edit" });
  render();
};

export const handleNodeDetailBackClick = openMobileNodeExplorer;

const stepMobileNodeSelection = (deps, direction) => {
  const { refs } = deps;

  refs.fileExplorer.navigateSelection({ direction, clamp: true });
};

export const handleNodeMovePreviousClick = (deps) => {
  stepMobileNodeSelection(deps, "previous");
};

export const handleNodeMoveNextClick = (deps) => {
  stepMobileNodeSelection(deps, "next");
};

// rvn-zoom-viewport keeps the point in view in place when the zoom changes.
export const handleCanvasZoomInClick = (deps) => {
  const { store, render } = deps;
  store.zoomCanvasIn();
  render();
};

export const handleCanvasZoomOutClick = (deps) => {
  const { store, render } = deps;
  store.zoomCanvasOut();
  render();
};

export const handleCanvasZoomResetClick = (deps) => {
  const { store, refs, render } = deps;
  store.resetCanvasZoom();
  render();
  refs.layoutEditorCanvasBackground.centerContent();
};

export const handleCanvasZoomGesture = (deps, payload) => {
  const { store, render } = deps;
  const { zoom } = payload._event.detail;
  store.setCanvasZoom({ zoom });
  render();
};

// Preview has no selection, so the canvas shows no selection border there.
export const handleRightPanelModeChange = (deps, payload) => {
  const { render, store } = deps;
  const { id } = payload._event.detail;

  store.pickRightPanelTab({ mode: id });
  if (id === "preview") {
    clearSelection(deps);
  }
  render();
};

export const handleAddLayoutClick = handleRenderOnly;

const refreshLayoutEditorData = async (deps, payload = {}) => {
  const { appService, projectService, store, refs, render } = deps;
  const { layoutId, resourceType } = getEditorPayload(appService);
  await projectService.ensureRepository();
  store.syncRepositoryState(
    createLayoutEditorRepositoryStoreData({
      repositoryState: projectService.getRepositoryState(),
      layoutId,
      resourceType,
    }),
  );
  if (payload.selectedItemId) {
    store.setSelectedItemId({ itemId: payload.selectedItemId });
    if (payload.syncDetailPanel !== false) {
      store.setDetailPanelSelectedItemId({ itemId: payload.selectedItemId });
      store.setRightPanelMode({ mode: "edit" });
    }
  }
  render();
  if (payload.selectedItemId) {
    scheduleAfterNextPaint(() => {
      if (store.selectSelectedItemId() !== payload.selectedItemId) {
        return;
      }

      refs.fileExplorer?.selectItem?.({ itemId: payload.selectedItemId });
    });
  }
};

const {
  handleFileExplorerAction: handleBaseFileExplorerAction,
  handleFileExplorerTargetChanged: handleBaseFileExplorerTargetChanged,
} = createLayoutElementsFileExplorerHandlers({
  getLayoutId: ({ store }) => store.selectLayoutId(),
  getResourceType: ({ store }) => store.selectLayoutResourceType(),
  copy: ({ i18n }) => selectLayoutEditorPageCopy(i18n),
  refresh: refreshLayoutEditorData,
});

// A new element is asked about first when it needs something chosen, such as
// a sprite's image, and is then added with what it holds. Any other explorer
// action goes to the shared element actions.
const handleFileExplorerActionUnsafe = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const detail = payload?._event?.detail ?? {};
  const action = resolvePromptedNewElementAction(
    resolveMenuItem(detail)?.value,
  );
  if (!action) {
    await handleBaseFileExplorerAction(deps, payload);
    return;
  }

  const copy = selectCopy(deps);
  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const owner = getLayoutEditorOwnerConfig(resourceType, projectService, copy);
  const isSaveLoadSlot = action.type === "container-ref-save-load-slot";
  if (!layoutId || (isSaveLoadSlot && resourceType !== "layouts")) {
    appService.showAlert({
      message: isSaveLoadSlot
        ? (copy.layoutMissing ?? "Layout is missing.")
        : owner.ownerMissingMessage,
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  const elements = await promptLayoutEditorNewElements({
    action,
    appService,
    copy,
    parentId: detail.itemId ?? null,
    projectResolution: store.selectProjectResolution(),
    resources: {
      images: store.selectImages(),
      spritesheets: store.selectSpritesheetsData(),
      videos: store.selectVideosData(),
      particles: store.selectParticlesData(),
      layouts: store.selectLayoutsData(),
    },
    layoutId,
  });
  if (!elements) {
    return;
  }

  await projectService.ensureRepository();
  for (const { failedMessage, ...element } of elements) {
    const createResult = await owner.createElement({
      [owner.ownerPayloadKey]: layoutId,
      ...element,
    });
    if (createResult?.valid === false) {
      appService.showAlert({
        message: getResultErrorMessage(appService, createResult, failedMessage),
        title: copy.errorTitle ?? "Error",
      });
      return;
    }
  }

  await refreshLayoutEditorData(deps, {
    selectedItemId: elements[0].elementId,
  });
};

export const handleFileExplorerAction = async (deps, payload) => {
  const copy = selectCopy(deps);
  try {
    await recordLayoutEditorStructureEdit(deps, () =>
      handleFileExplorerActionUnsafe(deps, payload),
    );
  } catch (error) {
    console.error("[layoutEditor] Failed to create layout item", {
      error,
    });
    showLayoutEditorError({
      appService: deps.appService,
      error,
      fallbackMessage:
        copy.failedCreateLayoutItem ?? "Failed to create layout item.",
      lockedMessage:
        copy.databaseBusyCreateLayoutItem ??
        "The project database is busy. RouteVN couldn't create the layout item. Please wait a moment and try again.",
      copy,
    });
  }
};

export const handleFileExplorerTargetChanged = (deps, payload) =>
  recordLayoutEditorStructureEdit(deps, () =>
    handleBaseFileExplorerTargetChanged(deps, payload),
  );

export const handleDataChanged = refreshLayoutEditorData;

// Goes back to the stored element after its save failed. The failed edit is
// not saved again: a failure can come after part of the write was stored.
// Only that edit is dropped; edits to other elements, and edits made since,
// stay. The user is told at once, and the failure is reported.
const dropFailedLayoutEditorEdit = (deps, { payload, error }) => {
  const { appService, i18n, projectService, refs, render, store } = deps;
  const copy = selectCopy(deps);
  const { layoutId, resourceType, selectedItemId, persistenceRequestId } =
    payload;

  console.error("[layoutEditor] Failed to save layout changes", {
    error,
    layoutId,
    resourceType,
    selectedItemId,
  });

  store.clearPendingPersistPayload({ persistenceRequestId });
  // The page shows an edit sent to save until it is saved; this one is not.
  store.removeSavingPersistPayload({ persistenceRequestId });
  const currentPayload = getEditorPayload(appService);
  store.syncRepositoryState(
    createLayoutEditorRepositoryStoreData({
      repositoryState: projectService.getRepositoryState(),
      layoutId: currentPayload.layoutId || layoutId,
      resourceType: currentPayload.resourceType || resourceType,
    }),
  );
  // The canvas keeps the item it was moving until the page has its position.
  refs.layoutEditorCanvas?.discardPendingUpdate();
  render();

  const isControl = resourceType === "controls";
  const elementName =
    store.selectItemDataById({ itemId: selectedItemId })?.name ??
    payload.updatedItem?.name ??
    "";
  const message = isControl
    ? formatI18nCopy(
        copy.failedSaveControlElementChangesDiscarded ??
          "Your latest changes to element “{elementName}” in control “{controlName}” could not be saved and were removed. Please enter them again.",
        { elementName, controlName: store.selectLayoutName() },
      )
    : formatI18nCopy(
        copy.failedSaveLayoutElementChangesDiscarded ??
          "Your latest changes to element “{elementName}” in layout “{layoutName}” could not be saved and were removed. Please enter them again.",
        { elementName, layoutName: store.selectLayoutName() },
      );
  notifyLayoutEditorSaveFailure({
    appService,
    detailsLabel: i18n.appPage.errorDetailsLabel,
    error,
    message,
    operation: "layoutEditor.saveElement",
    showAlert: claimLayoutEditorSaveFailureAlert(store),
    title: copy.errorTitle ?? "Error",
  });
};

/**
 * Handler for debounced element updates (saves to repository)
 * @param {Object} payload - Update payload
 * @param {Object} deps - Component dependencies
 * @param {boolean} skipUIUpdate - Skip UI updates for drag operations
 */
async function handleDebouncedUpdate(deps, payload) {
  const { appService, projectService, store } = deps;
  const failedMessage =
    selectCopy(deps).failedSaveLayoutChanges ??
    "Failed to save layout changes.";
  const { layoutId, resourceType, selectedItemId, updatedItem, replace } =
    payload;

  if (
    payload.persistenceRequestId &&
    store.selectPendingPersistPayload()?.persistenceRequestId !==
      payload.persistenceRequestId
  ) {
    return {
      ok: true,
      skipped: true,
    };
  }

  return runLayoutEditorPersistence(deps, async () => {
    try {
      const persistResult = await persistLayoutEditorElementUpdate({
        projectService,
        layoutId,
        resourceType,
        selectedItemId,
        updatedItem,
        replace,
      });
      if (!persistResult.didPersist) {
        store.clearPendingPersistPayload({
          persistenceRequestId: payload.persistenceRequestId,
        });
        return {
          ok: true,
          didPersist: false,
        };
      }

      if (persistResult.updateResult?.valid === false) {
        throw toLayoutEditorSaveError(
          persistResult.updateResult.error,
          failedMessage,
        );
      }

      // Only edits newer than this acknowledged save should overlay repository data.
      store.clearPendingPersistPayload({
        persistenceRequestId: payload.persistenceRequestId,
      });
      const currentPayload = getEditorPayload(appService);
      store.syncRepositoryState(
        createLayoutEditorRepositoryStoreData({
          repositoryState: projectService.getRepositoryState(),
          layoutId: currentPayload.layoutId || layoutId,
          resourceType: currentPayload.resourceType || resourceType,
        }),
      );
      return {
        ok: true,
        didPersist: true,
      };
    } catch (failure) {
      dropFailedLayoutEditorEdit(deps, {
        payload,
        error: toLayoutEditorSaveError(failure, failedMessage),
      });
      return {
        ok: false,
      };
    } finally {
      // Saved or not, the repository now decides what an edit sent early
      // shows.
      store.removeSavingPersistPayload({
        persistenceRequestId: payload.persistenceRequestId,
      });
    }
  });
}

const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    createCollabRemoteRefreshStream({
      deps,
      matches: matchesRemoteTargets([
        "layouts",
        "controls",
        "images",
        "spritesheets",
        "particles",
        "textStyles",
        "colors",
        "fonts",
        "variables",
      ]),
      refresh: refreshLayoutEditorData,
    }),
    subject.pipe(
      filter(({ action }) => action === "layoutEditor.updateElement"),
      debounceTime(DEBOUNCE_DELAYS.UPDATE),
      concatMap(({ payload }) => from(handleDebouncedUpdate(deps, payload))),
    ),
    subject.pipe(
      filter(({ action }) => action === PREVIEW_AUTOSAVE_ACTION),
      debounceTime(DEBOUNCE_DELAYS.UPDATE),
      concatMap(() => from(saveLayoutEditorPreview(deps))),
    ),
  ];
};

const CANVAS_TRANSIENT_DETAIL_FIELDS = [
  "x",
  "y",
  "width",
  "height",
  "rotation",
];

export const handleLayoutEditorCanvasDragUpdate = (deps, payload) => {
  const { refs, store, subject } = deps;
  const updatedItem = payload._event.detail?.updatedItem;
  if (!updatedItem) {
    return;
  }

  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const selectedItemId = payload._event.detail?.itemId || updatedItem.id;
  const currentItem = store.selectItemDataById({ itemId: selectedItemId });
  const pendingPayload = queuePendingLayoutEditorPersist(deps, {
    layoutId,
    resourceType,
    selectedItemId,
    updatedItem,
  });

  recordLayoutEditorEdit(deps, {
    elementIds: [selectedItemId],
    apply: () =>
      store.updateSelectedItem({ itemId: selectedItemId, updatedItem }),
  });

  const transientValues = {};
  for (const name of CANVAS_TRANSIENT_DETAIL_FIELDS) {
    const value = updatedItem[name];
    if (Number.isFinite(value) && value !== currentItem?.[name]) {
      transientValues[name] = value;
    }
  }
  if (Object.keys(transientValues).length > 0) {
    refs.layoutEditPanel?.setTransientValues?.({
      values: transientValues,
    });
  }
  subject.dispatch("layoutEditor.updateElement", pendingPayload);
};

export const handleLayoutEditorCanvasUpdate = async (deps, payload) => {
  const { store, render } = deps;
  const updatedItem = payload._event.detail?.updatedItem;
  if (!updatedItem) {
    return;
  }

  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const selectedItemId = payload._event.detail?.itemId || updatedItem.id;
  const pendingPayload = queuePendingLayoutEditorPersist(deps, {
    layoutId,
    resourceType,
    selectedItemId,
    updatedItem,
  });

  recordLayoutEditorEdit(deps, {
    elementIds: [selectedItemId],
    apply: () =>
      store.updateSelectedItem({ itemId: selectedItemId, updatedItem }),
  });
  render();

  await handleDebouncedUpdate(deps, pendingPayload);
};

export const handleLayoutEditorCanvasMetricsChange = (deps, payload) => {
  const { refs, store } = deps;
  const { itemId, metrics } = payload._event.detail;
  const selectedItemId = store.selectSelectedItemId();
  const detailPanelSelectedItemId = store.selectDetailPanelSelectedItemId?.();

  if (itemId !== selectedItemId) {
    return;
  }

  // Each canvas render reports the metrics again. Keeping the same ones
  // leaves the edit panel's props as they were, so a move that changes none
  // of them, such as a slider moving X, does not redraw the panel.
  if (
    !areSelectedElementMetricsEqual(
      store.selectSelectedElementMetrics(),
      metrics,
    )
  ) {
    store.setSelectedElementMetrics({
      metrics,
    });
  }

  if (selectedItemId && detailPanelSelectedItemId !== selectedItemId) {
    return;
  }

  const currentMetrics = refs.layoutEditPanel?.getSelectedElementMetrics?.();

  if (areSelectedElementMetricsEqual(currentMetrics, metrics)) {
    return;
  }

  refs.layoutEditPanel?.setSelectedElementMetrics?.({
    metrics,
  });
};

export const handleLayoutEditorPreviewDataChange = (deps, payload) => {
  const { store, render, subject } = deps;
  const { previewData, edited } = payload._event.detail;
  store.setPreviewData({ previewData });
  render();
  if (edited) {
    store.markPreviewDataEdited();
    subject.dispatch(PREVIEW_AUTOSAVE_ACTION, {});
  }
};

export const handleLayoutEditorPreviewPlay = (deps) => {
  const { refs } = deps;
  refs.layoutEditorCanvas.restartPreview();
};

// The selected item with an edit panel value applied, for saving it or for
// previewing it on the canvas.
const buildPanelUpdatedItem = (store, detail, currentItem) =>
  buildLayoutEditPanelUpdatedItem({
    detail,
    currentItem,
    imagesData: store.selectImages(),
  });

export const handleLayoutEditPanelUpdateHandler = async (deps, payload) => {
  const { store, render } = deps;
  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const selectedItemId = store.selectSelectedItemId();
  const detail = payload._event.detail;
  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }
  const updatedItem = buildPanelUpdatedItem(store, detail, currentItem);

  if (areLayoutEditorItemsEquivalent(currentItem, updatedItem)) {
    return;
  }

  recordLayoutEditorEdit(deps, {
    elementIds: [selectedItemId],
    apply: () => store.updateSelectedItem({ updatedItem }),
  });

  const pendingPayload = queuePendingLayoutEditorPersist(deps, {
    layoutId,
    resourceType,
    selectedItemId,
    updatedItem,
  });
  if (
    shouldPersistLayoutEditorFieldImmediately({
      name: detail.name,
      itemType: currentItem.type,
    })
  ) {
    await handleDebouncedUpdate(deps, pendingPayload);
  } else {
    const { subject } = deps;
    subject.dispatch("layoutEditor.updateElement", pendingPayload);
  }

  render();
};

// A popover value shown on the canvas before it is submitted. It never
// reaches the saved layout: an update replaces it, and preview-cancel drops it.
export const handleLayoutEditPanelPreview = (deps, payload) => {
  const { store, render } = deps;
  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }

  store.setCanvasPreviewItem({
    itemId: store.selectSelectedItemId(),
    item: buildPanelUpdatedItem(store, payload._event.detail, currentItem),
  });
  render();
};

export const handleLayoutEditPanelPreviewCancel = (deps) => {
  const { store, render } = deps;
  if (!store.selectHasCanvasPreviewItem()) {
    return;
  }

  store.clearCanvasPreviewItem();
  render();
};
