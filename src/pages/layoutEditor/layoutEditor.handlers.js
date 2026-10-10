import { generateId } from "../../internal/id.js";
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
import { getFragmentLayoutOptions } from "./support/layoutFragments.js";
import { applyLayoutItemFieldChange } from "./support/layoutEditorMutations.js";
import { getLayoutEditorCreateDefinition } from "../../internal/layoutEditorElementRegistry.js";
import {
  persistLayoutEditorElementUpdate,
  shouldPersistLayoutEditorFieldImmediately,
} from "./support/layoutEditorPersistence.js";
import {
  enqueueLayoutEditorPersistence,
  waitForLayoutEditorPersistenceIdle,
} from "./support/layoutEditorPersistenceQueue.js";
import {
  captureLayoutElementSnapshot,
  getChangedLayoutElementIds,
  isFragmentLayout,
  restoreLayoutElementSnapshot,
} from "../../internal/project/layout.js";
import {
  resolveEditHistoryShortcut,
  selectEditHistoryCopy,
} from "../../internal/ui/editHistory.js";
import { withErrorDetails } from "../../internal/errorDetails.js";
import {
  getFirstSpritesheetAnimationSelectionValue,
  getSpritesheetResourceDefaultSize,
  parseSpritesheetAnimationSelectionValue,
  toSpritesheetAnimationSelectionItems,
} from "../../internal/spritesheets.js";
import {
  getFirstParticleSelectionValue,
  getParticleResourceDefaultSize,
  toParticleSelectionItems,
} from "../../internal/particles.js";
import { createLayoutElementsFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createLayoutEditorRepositoryStoreData } from "./support/layoutEditorRepositoryState.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { selectLayoutEditorPageCopy } from "./support/layoutEditorPageCopy.js";

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

const INTERACTION_SOUND_VOLUME_CONFIG_BY_ID_FIELD = {
  hoverSoundId: {
    interactionName: "hover",
    volumeName: "hover.soundVolume",
  },
  clickSoundId: {
    interactionName: "click",
    volumeName: "click.soundVolume",
  },
};

const SLIDER_CREATE_DIALOG_COMPONENT = "rvn-layout-editor-slider-create-dialog";
const SPRITE_CREATE_DIALOG_COMPONENT = "rvn-layout-editor-sprite-create-dialog";
const LAYOUT_EDITOR_PERSIST_ERROR_COOLDOWN_MS = 1500;

const selectCopy = (deps = {}) => selectLayoutEditorPageCopy(deps.i18n);

const getResultErrorMessage = (result, fallbackMessage) => {
  return (
    result?.error?.message ||
    result?.error?.creatorModelError?.message ||
    fallbackMessage
  );
};

const showLayoutEditorError = ({
  appService,
  store,
  error,
  fallbackMessage,
  lockedMessage = fallbackMessage,
  throttle = false,
  copy = {},
} = {}) => {
  if (throttle) {
    const now = Date.now();
    const lastPersistErrorAt = store.selectLastPersistErrorAt();
    if (
      Number.isFinite(lastPersistErrorAt) &&
      now - lastPersistErrorAt < LAYOUT_EDITOR_PERSIST_ERROR_COOLDOWN_MS
    ) {
      return;
    }
    store.setLastPersistErrorAt({
      timestamp: now,
    });
  }

  const message = isSqliteLockError(error)
    ? lockedMessage
    : error?.message || fallbackMessage;
  appService.showAlert({ message: message, title: copy.errorTitle ?? "Error" });
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
const saveLayoutEditorPreview = (deps) => {
  const { appService, projectService, store } = deps;
  return runLayoutEditorPersistence(deps, async () => {
    const layoutId = store.selectLayoutId();
    const version = store.selectPreviewEditVersion();
    const previewData = store.selectUnsavedPreviewData();
    if (!layoutId || !previewData) {
      return { ok: true };
    }

    const copy = selectCopy(deps);
    const { ownerPayloadKey, ownerLabel, updateItem } =
      getLayoutEditorOwnerConfig(
        store.selectLayoutResourceType(),
        projectService,
        copy,
      );
    const updateAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: formatI18nCopy(
        copy.failedSaveOwnerPreview ?? "Failed to save {ownerLabel} preview.",
        { ownerLabel: ownerLabel.toLowerCase() },
      ),
      title: copy.errorTitle ?? "Error",
      action: () =>
        updateItem({
          [ownerPayloadKey]: layoutId,
          data: { preview: previewData },
        }),
    });
    if (updateAttempt.ok) {
      store.markPreviewDataSaved({ previewData, version });
    }
    return { ok: updateAttempt.ok };
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

const resolveSliderCreateAction = (detail = {}) => {
  const value = resolveMenuItem(detail)?.value;
  if (
    value &&
    typeof value === "object" &&
    value.action === "new-child-item" &&
    value.type === "slider"
  ) {
    return value;
  }

  return undefined;
};

const resolveSpriteCreateAction = (detail = {}) => {
  const value = resolveMenuItem(detail)?.value;
  if (
    value &&
    typeof value === "object" &&
    value.action === "new-child-item" &&
    value.type === "sprite"
  ) {
    return value;
  }

  return undefined;
};

const resolveSpritesheetCreateAction = (detail = {}) => {
  const value = resolveMenuItem(detail)?.value;
  if (
    value &&
    typeof value === "object" &&
    value.action === "new-child-item" &&
    value.type === "spritesheet-animation"
  ) {
    return value;
  }

  return undefined;
};

const resolveParticleCreateAction = (detail = {}) => {
  const value = resolveMenuItem(detail)?.value;
  if (
    value &&
    typeof value === "object" &&
    value.action === "new-child-item" &&
    value.type === "particle"
  ) {
    return value;
  }

  return undefined;
};

const resolveFragmentCreateAction = (detail = {}) => {
  const value = resolveMenuItem(detail)?.value;
  if (
    value &&
    typeof value === "object" &&
    value.action === "new-child-item" &&
    value.type === "fragment-ref"
  ) {
    return value;
  }

  return undefined;
};

const resolveSaveLoadSlotCreateAction = (detail = {}) => {
  const value = resolveMenuItem(detail)?.value;
  if (
    value &&
    typeof value === "object" &&
    value.action === "new-child-item" &&
    value.type === "container-ref-save-load-slot"
  ) {
    return value;
  }

  return undefined;
};

const getSliderCreateOwnerConfig = (resourceType, projectService) => {
  const isControls = resourceType === "controls";
  return {
    ownerPayloadKey: isControls ? "controlId" : "layoutId",
    createElement: isControls
      ? projectService.createControlElement.bind(projectService)
      : projectService.createLayoutElement.bind(projectService),
  };
};

const createFragmentCreateForm = (fragmentLayoutOptions = [], copy = {}) => {
  return {
    title: copy.insertFragmentTitle ?? "Insert Fragment",
    description:
      copy.insertFragmentDescription ??
      "Choose which fragment layout to insert into this layout",
    fields: [
      {
        name: "fragmentLayoutId",
        type: "select",
        label: copy.fragmentLabel ?? "Fragment",
        required: true,
        clearable: false,
        options: fragmentLayoutOptions,
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: copy.cancelButton ?? "Cancel",
          align: "left",
        },
        {
          id: "submit",
          variant: "pr",
          label: copy.insertFragmentButton ?? "Insert Fragment",
          validate: true,
        },
      ],
    },
  };
};

const createSpritesheetCreateForm = (selectionItems = [], copy = {}) => {
  return {
    title:
      copy.createSpritesheetAnimationTitle ?? "Create Spritesheet Animation",
    description:
      copy.createSpritesheetAnimationDescription ??
      "Choose which imported spritesheet animation to insert into the layout",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: copy.nameLabel ?? "Name",
        required: true,
      },
      {
        name: "spritesheetSelection",
        type: "select",
        label: copy.animationLabel ?? "Animation",
        required: true,
        clearable: false,
        options: selectionItems,
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: copy.cancelButton ?? "Cancel",
          align: "left",
        },
        {
          id: "submit",
          variant: "pr",
          label: copy.createAnimationButton ?? "Create Animation",
          validate: true,
        },
      ],
    },
  };
};

const createParticleCreateForm = (selectionItems = [], copy = {}) => {
  return {
    title: copy.createParticleTitle ?? "Create Particle",
    description:
      copy.createParticleDescription ??
      "Choose which particle effect to insert into the layout",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: copy.nameLabel ?? "Name",
        required: true,
      },
      {
        name: "particleId",
        type: "select",
        label: copy.particleLabel ?? "Particle",
        required: true,
        clearable: false,
        options: selectionItems,
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: copy.cancelButton ?? "Cancel",
          align: "left",
        },
        {
          id: "submit",
          variant: "pr",
          label: copy.createParticleButton ?? "Create Particle",
          validate: true,
        },
      ],
    },
  };
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

// Saves every edit waiting to save, and then the preview data.
const flushQueuedLayoutEditorUpdates = async (deps) => {
  const { projectService, store } = deps;

  while (true) {
    const pendingPayload = store.selectPendingPersistPayload();
    if (pendingPayload) {
      const flushResult = await handleDebouncedUpdate(deps, pendingPayload);
      if (flushResult.ok === false) {
        return flushResult;
      }
      continue;
    }

    const idleResult = await waitForLayoutEditorPersistenceIdle({
      owner: projectService,
    });
    if (idleResult?.ok === false) {
      return idleResult;
    }

    if (!store.selectPendingPersistPayload()) {
      break;
    }
  }

  return saveLayoutEditorPreview(deps);
};

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

// Clearing a selection shows Preview, since Edit has nothing left to show.
// With nothing selected, the tab stays as it is.
const clearSelectedItem = (store) => {
  if (store.selectSelectedItemId()) {
    store.setRightPanelMode({ mode: "preview" });
  }
  store.setSelectedItemId({ itemId: undefined });
  store.setDetailPanelSelectedItemId({ itemId: undefined });
};

// A press on empty canvas clears the selection. Under the canvas on phones,
// where Edit was showing the element, the panel stays in Edit and goes to
// the Elements list rather than to Preview.
const clearCanvasSelection = (deps) => {
  const { refs, store } = deps;
  const wasEditingElement =
    store.selectShowsMobilePanels() &&
    Boolean(store.selectDetailPanelSelectedItemId());

  clearSelectedItem(store);
  refs.fileExplorer?.clearSelection?.();
  if (wasEditingElement) {
    store.openMobileFileExplorer();
  }
};

// An undo or redo can remove the selected element, as when it undoes the
// element's create.
const clearMissingLayoutEditorSelection = (deps) => {
  const { refs, store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId || store.selectItemDataById({ itemId: selectedItemId })) {
    return;
  }
  clearSelectedItem(store);
  refs.fileExplorer?.clearSelection?.();
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
      const flushResult = await flushQueuedLayoutEditorUpdates(deps);
      if (!flushResult.ok) {
        throw new Error("Failed to save layout changes before navigation.");
      }
      // A layout's thumbnail follows in the background, once the page is
      // left: a backup, the app going to the background, or quitting only
      // saves. Controls show none.
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
// and keeps the selection.
export const handleMobilePanelModeChange = (deps, payload) => {
  const { render, store } = deps;
  const { id } = payload._event.detail;

  if (id === "preview") {
    store.closeMobileFileExplorer();
    store.setDetailPanelSelectedItemId({ itemId: undefined });
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

export const handleRightPanelModeChange = (deps, payload) => {
  const { render, store } = deps;
  const { id } = payload._event.detail;

  store.pickRightPanelTab({ mode: id });
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

const showSliderCreateDialog = async (
  appService,
  sliderAction = {},
  copy = {},
) => {
  return appService.showComponentDialog({
    component: SLIDER_CREATE_DIALOG_COMPONENT,
    title: copy.createSliderTitle ?? "Create Slider",
    description:
      copy.createSliderDescription ??
      "Choose the slider images before inserting it into the layout",
    size: "md",
    props: {
      direction: sliderAction.direction,
      defaultValues: {
        name: sliderAction.name ?? copy.sliderDefaultName ?? "Slider",
      },
    },
    actions: {
      buttons: [
        {
          id: "cancel",
          label: copy.cancelButton ?? "Cancel",
          variant: "se",
          align: "left",
          role: "cancel",
        },
        {
          id: "create",
          label: copy.createSliderButton ?? "Create Slider",
          variant: "pr",
          role: "confirm",
          validate: true,
        },
      ],
    },
  });
};

const showSpriteCreateDialog = async (
  appService,
  spriteAction = {},
  copy = {},
) => {
  return appService.showComponentDialog({
    component: SPRITE_CREATE_DIALOG_COMPONENT,
    title: copy.createImageTitle ?? "Create Image",
    description:
      copy.createImageDescription ??
      "Choose the image before inserting it into the layout",
    size: "md",
    props: {
      defaultValues: {
        name: spriteAction.name ?? copy.imageDefaultName ?? "Image",
      },
    },
    actions: {
      buttons: [
        {
          id: "cancel",
          label: copy.cancelButton ?? "Cancel",
          variant: "se",
          align: "left",
          role: "cancel",
        },
        {
          id: "create",
          label: copy.createImageButton ?? "Create Image",
          variant: "pr",
          role: "confirm",
          validate: true,
        },
      ],
    },
  });
};

const handleFileExplorerActionUnsafe = async (deps, payload) => {
  const copy = selectCopy(deps);
  const saveLoadSlotAction = resolveSaveLoadSlotCreateAction(
    payload?._event?.detail,
  );
  if (saveLoadSlotAction) {
    const { appService, projectService, store } = deps;
    const layoutId = store.selectLayoutId();
    const resourceType = store.selectLayoutResourceType();

    if (!layoutId || resourceType !== "layouts") {
      appService.showAlert({
        message: copy.layoutMissing ?? "Layout is missing.",
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    await projectService.ensureRepository();

    const slotContainerId = generateId();
    const slotImageId = generateId();
    const slotDateId = generateId();
    const parentId = payload?._event?.detail?.itemId ?? null;
    const projectResolution = store.selectProjectResolution();

    const slotContainer = getLayoutEditorCreateDefinition(
      "container-save-load-slot",
      {
        projectResolution,
      },
    ).template;
    const slotImage = getLayoutEditorCreateDefinition(
      "sprite-save-load-slot-image",
      {
        projectResolution,
      },
    ).template;
    const slotDate = getLayoutEditorCreateDefinition(
      "text-save-load-slot-date",
      {
        projectResolution,
      },
    ).template;

    const createContainerResult = await projectService.createLayoutElement({
      layoutId,
      elementId: slotContainerId,
      data: slotContainer,
      parentId,
      position: "first",
    });

    if (createContainerResult?.valid === false) {
      appService.showAlert({
        message: getResultErrorMessage(
          createContainerResult,
          copy.failedCreateSaveLoadSlot ?? "Failed to create save/load slot.",
        ),
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    const createImageResult = await projectService.createLayoutElement({
      layoutId,
      elementId: slotImageId,
      data: slotImage,
      parentId: slotContainerId,
      position: "last",
    });

    if (createImageResult?.valid === false) {
      appService.showAlert({
        message: getResultErrorMessage(
          createImageResult,
          copy.failedCreateSaveLoadSlotImage ??
            "Failed to create save/load slot image.",
        ),
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    const createDateResult = await projectService.createLayoutElement({
      layoutId,
      elementId: slotDateId,
      data: slotDate,
      parentId: slotContainerId,
      position: "last",
    });

    if (createDateResult?.valid === false) {
      appService.showAlert({
        message: getResultErrorMessage(
          createDateResult,
          copy.failedCreateSaveLoadSlotDate ??
            "Failed to create save/load slot date.",
        ),
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    await refreshLayoutEditorData(deps, { selectedItemId: slotContainerId });
    return;
  }

  const fragmentAction = resolveFragmentCreateAction(payload?._event?.detail);
  if (fragmentAction) {
    const { appService, projectService, store } = deps;
    const parentId = payload?._event?.detail?.itemId ?? null;
    const fragmentLayoutOptions = getFragmentLayoutOptions(
      store.selectLayoutsData(),
      {
        excludeLayoutId: store.selectLayoutId(),
      },
    );

    if (fragmentLayoutOptions.length === 0) {
      appService.showAlert({
        message:
          copy.markLayoutAsFragmentFirst ??
          "Mark a layout as a fragment first.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }

    const dialogResult = await appService.showFormDialog({
      form: createFragmentCreateForm(fragmentLayoutOptions, copy),
      defaultValues: {
        fragmentLayoutId: fragmentLayoutOptions[0].value,
      },
    });

    if (!dialogResult || dialogResult.actionId !== "submit") {
      return;
    }

    const fragmentLayoutId = dialogResult.values?.fragmentLayoutId;
    if (!fragmentLayoutId) {
      appService.showAlert({
        message: copy.fragmentRequired ?? "Fragment is required.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }

    const layoutsData = store.selectLayoutsData();
    const fragmentLayout = layoutsData?.items?.[fragmentLayoutId];
    if (
      fragmentLayout?.type !== "layout" ||
      !isFragmentLayout(fragmentLayout)
    ) {
      appService.showAlert({
        message:
          copy.selectedFragmentInvalid ?? "Selected fragment is invalid.",
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    const layoutId = store.selectLayoutId();
    if (!layoutId) {
      appService.showAlert({
        message: copy.layoutMissing ?? "Layout is missing.",
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    await projectService.ensureRepository();
    const nextElementId = generateId();
    const createResult = await projectService.createLayoutElement({
      layoutId,
      elementId: nextElementId,
      data: {
        ...getLayoutEditorCreateDefinition("fragment-ref", {
          projectResolution: store.selectProjectResolution(),
        }).template,
        name: fragmentLayout.name ?? copy.fragmentDefaultName ?? "Fragment",
        fragmentLayoutId,
      },
      parentId,
      position: "first",
    });

    if (createResult?.valid === false) {
      appService.showAlert({
        message: getResultErrorMessage(
          createResult,
          copy.failedCreateFragment ?? "Failed to create fragment.",
        ),
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
    return;
  }

  const spritesheetAction = resolveSpritesheetCreateAction(
    payload?._event?.detail,
  );
  if (spritesheetAction) {
    const { appService, projectService, store } = deps;
    const parentId = payload?._event?.detail?.itemId ?? null;
    const spritesheetsData = store.selectSpritesheetsData();
    const selectionItems =
      toSpritesheetAnimationSelectionItems(spritesheetsData);

    if (selectionItems.length === 0) {
      appService.showAlert({
        message: copy.importSpritesheetFirst ?? "Import a spritesheet first.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }

    const dialogResult = await appService.showFormDialog({
      form: createSpritesheetCreateForm(selectionItems, copy),
      defaultValues: {
        name:
          spritesheetAction.name ??
          copy.spritesheetAnimationDefaultName ??
          "Spritesheet Animation",
        spritesheetSelection:
          getFirstSpritesheetAnimationSelectionValue(spritesheetsData),
      },
    });

    if (!dialogResult || dialogResult.actionId !== "submit") {
      return;
    }

    const name = dialogResult.values?.name?.trim();
    if (!name) {
      appService.showAlert({
        message: copy.animationNameRequired ?? "Animation name is required.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }

    const { resourceId, animationName } =
      parseSpritesheetAnimationSelectionValue(
        dialogResult.values?.spritesheetSelection,
      );
    if (!resourceId || !animationName) {
      appService.showAlert({
        message:
          copy.spritesheetAnimationRequired ??
          "Spritesheet animation is required.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }

    const layoutId = store.selectLayoutId();
    const resourceType = store.selectLayoutResourceType();
    if (!layoutId) {
      const { ownerMissingMessage } = getLayoutEditorOwnerConfig(
        resourceType,
        projectService,
        copy,
      );
      appService.showAlert({
        message: ownerMissingMessage,
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    const nextElementId = generateId();
    const nextElementData = {
      ...getLayoutEditorCreateDefinition("spritesheet-animation", {
        projectResolution: store.selectProjectResolution(),
      }).template,
      name,
      resourceId,
      animationName,
    };
    const resourceSize = getSpritesheetResourceDefaultSize(
      spritesheetsData,
      resourceId,
    );
    if (Number.isFinite(resourceSize.width) && resourceSize.width > 0) {
      nextElementData.width = resourceSize.width;
    }
    if (Number.isFinite(resourceSize.height) && resourceSize.height > 0) {
      nextElementData.height = resourceSize.height;
    }
    if (
      Number.isFinite(nextElementData.width) &&
      Number.isFinite(nextElementData.height) &&
      nextElementData.width > 0 &&
      nextElementData.height > 0
    ) {
      nextElementData.aspectRatioLock =
        nextElementData.width / nextElementData.height;
    }

    await projectService.ensureRepository();
    const { ownerPayloadKey, createElement } = getSliderCreateOwnerConfig(
      resourceType,
      projectService,
    );
    const createResult = await createElement({
      [ownerPayloadKey]: layoutId,
      elementId: nextElementId,
      data: nextElementData,
      parentId,
      position: "first",
    });

    if (createResult?.valid === false) {
      appService.showAlert({
        message: getResultErrorMessage(
          createResult,
          copy.failedCreateSpritesheetAnimation ??
            "Failed to create spritesheet animation.",
        ),
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
    return;
  }

  const particleAction = resolveParticleCreateAction(payload?._event?.detail);
  if (particleAction) {
    const { appService, projectService, store } = deps;
    const parentId = payload?._event?.detail?.itemId ?? null;
    const particlesData = store.selectParticlesData();
    const selectionItems = toParticleSelectionItems(particlesData);

    if (selectionItems.length === 0) {
      appService.showAlert({
        message:
          copy.createParticleEffectFirst ?? "Create a particle effect first.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }

    const dialogResult = await appService.showFormDialog({
      form: createParticleCreateForm(selectionItems, copy),
      defaultValues: {
        name: particleAction.name ?? copy.particleDefaultName ?? "Particle",
        particleId: getFirstParticleSelectionValue(particlesData),
      },
    });

    if (!dialogResult || dialogResult.actionId !== "submit") {
      return;
    }

    const name = dialogResult.values?.name?.trim();
    if (!name) {
      appService.showAlert({
        message: copy.particleNameRequired ?? "Particle name is required.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }

    const particleId = dialogResult.values?.particleId;
    if (!particleId) {
      appService.showAlert({
        message: copy.particleRequired ?? "Particle is required.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }

    const layoutId = store.selectLayoutId();
    const resourceType = store.selectLayoutResourceType();
    if (!layoutId) {
      const { ownerMissingMessage } = getLayoutEditorOwnerConfig(
        resourceType,
        projectService,
        copy,
      );
      appService.showAlert({
        message: ownerMissingMessage,
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    const nextElementId = generateId();
    const nextElementData = {
      ...getLayoutEditorCreateDefinition("particle", {
        projectResolution: store.selectProjectResolution(),
      }).template,
      name,
      particleId,
    };
    const resourceSize = getParticleResourceDefaultSize(
      particlesData,
      particleId,
    );
    if (Number.isFinite(resourceSize.width) && resourceSize.width > 0) {
      nextElementData.width = resourceSize.width;
    }
    if (Number.isFinite(resourceSize.height) && resourceSize.height > 0) {
      nextElementData.height = resourceSize.height;
    }
    if (
      Number.isFinite(nextElementData.width) &&
      Number.isFinite(nextElementData.height) &&
      nextElementData.width > 0 &&
      nextElementData.height > 0
    ) {
      nextElementData.aspectRatioLock =
        nextElementData.width / nextElementData.height;
    }

    await projectService.ensureRepository();
    const { ownerPayloadKey, createElement } = getSliderCreateOwnerConfig(
      resourceType,
      projectService,
    );
    const createResult = await createElement({
      [ownerPayloadKey]: layoutId,
      elementId: nextElementId,
      data: nextElementData,
      parentId,
      position: "first",
    });

    if (createResult?.valid === false) {
      appService.showAlert({
        message: getResultErrorMessage(
          createResult,
          copy.failedCreateParticle ?? "Failed to create particle.",
        ),
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
    return;
  }

  const spriteAction = resolveSpriteCreateAction(payload?._event?.detail);
  const sliderAction = resolveSliderCreateAction(payload?._event?.detail);
  if (!spriteAction && !sliderAction) {
    await handleBaseFileExplorerAction(deps, payload);
    return;
  }

  const { appService, projectService, store } = deps;
  const parentId = payload?._event?.detail?.itemId ?? null;

  if (spriteAction) {
    let spriteDialogResult;

    try {
      spriteDialogResult = await showSpriteCreateDialog(
        appService,
        spriteAction,
        copy,
      );
    } catch {
      appService.showAlert({
        message: copy.failedOpenImageDialog ?? "Failed to open image dialog.",
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    if (!spriteDialogResult || spriteDialogResult.actionId !== "create") {
      return;
    }

    const values = spriteDialogResult.values ?? {};
    const name = values.name?.trim();
    if (!name) {
      appService.showAlert({
        message: copy.imageNameRequired ?? "Image name is required.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }

    const imageId = values.imageId;
    if (!imageId) {
      appService.showAlert({
        message: copy.imageRequired ?? "Image is required.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }

    const layoutId = store.selectLayoutId();
    const resourceType = store.selectLayoutResourceType();
    if (!layoutId) {
      const { ownerMissingMessage } = getLayoutEditorOwnerConfig(
        resourceType,
        projectService,
        copy,
      );
      appService.showAlert({
        message: ownerMissingMessage,
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    const nextElementId = generateId();
    const nextElementData = {
      ...getLayoutEditorCreateDefinition("sprite", {
        projectResolution: store.selectProjectResolution(),
      }).template,
      name,
      imageId,
    };
    const image = store.selectImages()?.items?.[imageId];
    if (Number.isFinite(image?.width) && image.width > 0) {
      nextElementData.width = image.width;
    }
    if (Number.isFinite(image?.height) && image.height > 0) {
      nextElementData.height = image.height;
    }
    if (
      Number.isFinite(nextElementData.width) &&
      Number.isFinite(nextElementData.height) &&
      nextElementData.width > 0 &&
      nextElementData.height > 0
    ) {
      nextElementData.aspectRatioLock =
        nextElementData.width / nextElementData.height;
    }

    await projectService.ensureRepository();
    const { ownerPayloadKey, createElement } = getSliderCreateOwnerConfig(
      resourceType,
      projectService,
    );
    const createResult = await createElement({
      [ownerPayloadKey]: layoutId,
      elementId: nextElementId,
      data: nextElementData,
      parentId,
      position: "first",
    });

    if (createResult?.valid === false) {
      appService.showAlert({
        message: getResultErrorMessage(
          createResult,
          copy.failedCreateImage ?? "Failed to create image.",
        ),
        title: copy.errorTitle ?? "Error",
      });
      return;
    }

    await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
    return;
  }

  let dialogResult;

  try {
    dialogResult = await showSliderCreateDialog(appService, sliderAction, copy);
  } catch {
    appService.showAlert({
      message: copy.failedOpenSliderDialog ?? "Failed to open slider dialog.",
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  if (!dialogResult || dialogResult.actionId !== "create") {
    return;
  }

  const values = dialogResult.values ?? {};
  const name = values.name?.trim();
  if (!name) {
    appService.showAlert({
      message: copy.sliderNameRequired ?? "Slider name is required.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const barImageId = values.barImageId;
  const thumbImageId = values.thumbImageId;
  const hoverBarImageId = values.hoverBarImageId;
  const hoverThumbImageId = values.hoverThumbImageId;

  if (!barImageId) {
    appService.showAlert({
      message: copy.barImageRequired ?? "Bar image is required.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  if (!thumbImageId) {
    appService.showAlert({
      message: copy.thumbImageRequired ?? "Thumb image is required.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const direction = values.direction === "vertical" ? "vertical" : "horizontal";
  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  if (!layoutId) {
    const { ownerMissingMessage } = getLayoutEditorOwnerConfig(
      resourceType,
      projectService,
      copy,
    );
    appService.showAlert({
      message: ownerMissingMessage,
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  const createType =
    direction === "vertical" ? "slider-vertical" : "slider-horizontal";
  const baseItem = getLayoutEditorCreateDefinition(createType, {
    projectResolution: store.selectProjectResolution(),
  }).template;
  const nextElementId = generateId();
  const nextElementData = {
    ...baseItem,
    name,
    barImageId,
    thumbImageId,
  };
  if (hoverBarImageId) {
    nextElementData.hoverBarImageId = hoverBarImageId;
  }
  if (hoverThumbImageId) {
    nextElementData.hoverThumbImageId = hoverThumbImageId;
  }

  await projectService.ensureRepository();
  const { ownerPayloadKey, createElement } = getSliderCreateOwnerConfig(
    resourceType,
    projectService,
  );
  const createResult = await createElement({
    [ownerPayloadKey]: layoutId,
    elementId: nextElementId,
    data: nextElementData,
    parentId,
    position: "first",
  });

  if (createResult?.valid === false) {
    appService.showAlert({
      message: getResultErrorMessage(
        createResult,
        copy.failedCreateSlider ?? "Failed to create slider.",
      ),
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  await refreshLayoutEditorData(deps, { selectedItemId: nextElementId });
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
      store: deps.store,
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

/**
 * Handler for debounced element updates (saves to repository)
 * @param {Object} payload - Update payload
 * @param {Object} deps - Component dependencies
 * @param {boolean} skipUIUpdate - Skip UI updates for drag operations
 */
async function handleDebouncedUpdate(deps, payload) {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
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
        showLayoutEditorError({
          appService,
          store,
          error: persistResult.updateResult?.error,
          fallbackMessage: getResultErrorMessage(
            persistResult.updateResult,
            copy.failedSaveLayoutChanges ?? "Failed to save layout changes.",
          ),
          lockedMessage:
            copy.databaseBusySaveLayoutChanges ??
            "The project database is busy. RouteVN couldn't save the latest layout changes. Please wait a moment and try again.",
          throttle: true,
          copy,
        });
        return {
          ok: false,
        };
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
    } catch (error) {
      console.error("[layoutEditor] Failed to save layout changes", {
        error,
        layoutId,
        resourceType,
        selectedItemId,
      });
      showLayoutEditorError({
        appService,
        store,
        error,
        fallbackMessage:
          copy.failedSaveLayoutChanges ?? "Failed to save layout changes.",
        lockedMessage:
          copy.databaseBusySaveLayoutChanges ??
          "The project database is busy. RouteVN couldn't save the latest layout changes. Please wait a moment and try again.",
        throttle: true,
        copy,
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
const buildPanelUpdatedItem = (store, detail, currentItem) => {
  const nextAspectRatioLock =
    Number.isFinite(detail.formValues?.aspectRatioLock) &&
    detail.formValues.aspectRatioLock > 0
      ? detail.formValues.aspectRatioLock
      : currentItem.aspectRatioLock;
  const currentItemWithEditorFlags = {
    ...currentItem,
    aspectRatioLock: nextAspectRatioLock,
  };
  let updatedItem;

  if (detail.name === "aspectRatioMode") {
    updatedItem = structuredClone(currentItem);
    if (detail.value === "fixed") {
      const currentWidth = Number(
        detail.formValues?.width ?? currentItem.width,
      );
      const currentHeight = Number(
        detail.formValues?.height ?? currentItem.height,
      );
      updatedItem.aspectRatioLock =
        Number.isFinite(currentWidth) &&
        Number.isFinite(currentHeight) &&
        currentWidth > 0 &&
        currentHeight > 0
          ? currentWidth / currentHeight
          : undefined;
    } else {
      delete updatedItem.aspectRatioLock;
    }
    delete updatedItem.aspectRatioMode;
  } else {
    if (detail.name === "spritesheetSelection") {
      const { resourceId, animationName } =
        parseSpritesheetAnimationSelectionValue(detail.value);
      updatedItem = {
        ...structuredClone(currentItemWithEditorFlags),
        resourceId,
        animationName,
      };
    } else {
      updatedItem = applyLayoutItemFieldChange({
        item: currentItemWithEditorFlags,
        name: detail.name,
        value: detail.value,
        imagesData: store.selectImages(),
      });

      const soundVolumeConfig =
        INTERACTION_SOUND_VOLUME_CONFIG_BY_ID_FIELD[detail.name];
      if (soundVolumeConfig) {
        updatedItem = applyLayoutItemFieldChange({
          item: updatedItem,
          name: soundVolumeConfig.volumeName,
          value:
            detail.formValues?.[soundVolumeConfig.interactionName]?.soundVolume,
          imagesData: store.selectImages(),
        });
      }
    }
  }

  // Other fields the change moves with it, such as the other scale while
  // the aspect ratio is kept.
  for (const [linkedName, linkedValue] of Object.entries(
    detail.linkedValues ?? {},
  )) {
    updatedItem = applyLayoutItemFieldChange({
      item: updatedItem,
      name: linkedName,
      value: linkedValue,
      imagesData: store.selectImages(),
    });
  }

  if (
    (detail.name === "width" || detail.name === "height") &&
    Number.isFinite(detail.formValues?.aspectRatioLock) &&
    detail.formValues.aspectRatioLock > 0
  ) {
    const nextWidth = Number(detail.formValues.width);
    const nextHeight = Number(detail.formValues.height);

    if (Number.isFinite(nextWidth) && nextWidth > 0) {
      updatedItem.width = Math.round(nextWidth);
    }

    if (Number.isFinite(nextHeight) && nextHeight > 0) {
      updatedItem.height = Math.round(nextHeight);
    }
  }

  return updatedItem;
};

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
