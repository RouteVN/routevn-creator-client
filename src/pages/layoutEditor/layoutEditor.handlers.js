import { filter, fromEvent, tap, debounceTime } from "rxjs";
import {
  createCollabRemoteRefreshStream,
  matchesRemoteTargets,
} from "../../internal/ui/collabRefresh.js";
import {
  getLayoutEditorBackPath,
  resolveLayoutEditorPayload,
} from "../../internal/layoutEditorRoute.js";
import { renderLayoutEditorPreview } from "../../internal/layoutEditorPreview.js";
import {
  applyLayoutItemDragChange,
  applyLayoutItemFieldChange,
  applyLayoutItemKeyboardChange,
} from "../../internal/layoutEditorMutations.js";
import {
  persistLayoutEditorElementUpdate,
  shouldPersistLayoutEditorFieldImmediately,
  syncLayoutEditorRepositoryState,
} from "../../internal/layoutEditorPersistence.js";
import { createLayoutElementsFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const DEBOUNCE_DELAYS = {
  UPDATE: 500, // Regular updates (forms, etc)
  KEYBOARD: 1000, // Keyboard final save
};

const KEYBOARD_UNITS = {
  NORMAL: 1,
  FAST: 10, // With shift key
};

const getEditorPayload = (appService) =>
  resolveLayoutEditorPayload(appService.getPayload() || {});

const rerenderLayoutEditorSurface = async (
  deps,
  { renderPage = true } = {},
) => {
  if (renderPage) {
    deps.render();
  }

  await renderLayoutEditorPreview(deps);
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);
  return () => {
    const keyboardNavigationTimeoutId =
      deps.store.selectKeyboardNavigationTimeoutId();
    if (keyboardNavigationTimeoutId !== undefined) {
      clearTimeout(keyboardNavigationTimeoutId);
      deps.store.clearKeyboardNavigationTimeout();
    }
    cleanupSubscriptions?.();
  };
};

/**
 * Schedule a final save after keyboard navigation stops
 * @param {Object} deps - Component dependencies
 * @param {string} itemId - The item ID being edited
 * @param {string} layoutId - The layout ID
 */
const scheduleKeyboardSave = (deps, itemId, layoutId) => {
  const { store } = deps;
  const keyboardNavigationTimeoutId = store.selectKeyboardNavigationTimeoutId();
  // Clear existing timeout if still navigating
  if (keyboardNavigationTimeoutId !== undefined) {
    clearTimeout(keyboardNavigationTimeoutId);
  }

  const timeoutId = setTimeout(() => {
    const { subject } = deps;

    // Check if the selected item has changed
    if (store.selectSelectedItemId() !== itemId) {
      store.clearKeyboardNavigationTimeout();
      return;
    }

    // Final render to ensure bounds are properly updated
    renderLayoutEditorPreview(deps);

    // Save final position to repository
    const finalItem = store.selectSelectedItemData();
    if (finalItem) {
      subject.dispatch("layoutEditor.updateElement", {
        layoutId,
        resourceType: store.selectLayoutResourceType(),
        selectedItemId: itemId,
        updatedItem: finalItem,
      });
    }

    store.clearKeyboardNavigationTimeout();
  }, DEBOUNCE_DELAYS.KEYBOARD);

  store.setKeyboardNavigationTimeoutId({ timeoutId });
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService, refs, graphicsService } = deps;
  const payload = getEditorPayload(appService);
  const { layoutId, resourceType } = payload;
  await projectService.ensureRepository();
  syncLayoutEditorRepositoryState({
    store: deps.store,
    repositoryState: projectService.getRepositoryState(),
    layoutId,
    resourceType,
  });

  const { canvas } = refs;
  await graphicsService.init({ canvas: canvas });

  await rerenderLayoutEditorSurface(deps);
};

export const handleBackClick = (deps) => {
  const { appService } = deps;
  const currentPayload = appService.getPayload() || {};
  const nextPath = getLayoutEditorBackPath(currentPayload);
  appService.navigate(nextPath, { p: currentPayload.p });
};

// Simple render handler for events that only need to trigger a re-render
export const handleRenderOnly = (deps) => deps.render();

export const handleFileExplorerItemClick = async (deps, payload) => {
  const { store } = deps;
  const detail = payload._event.detail || {};
  const itemId = detail.id || detail.itemId || detail.item?.id;
  if (!itemId) {
    return;
  }
  store.setSelectedItemId({ itemId: itemId });
  await rerenderLayoutEditorSurface(deps);
};

export const handleAddLayoutClick = handleRenderOnly;

const refreshLayoutEditorData = async (deps, payload = {}) => {
  const { appService, projectService, store, refs } = deps;
  const { layoutId, resourceType } = getEditorPayload(appService);
  await projectService.ensureRepository();
  syncLayoutEditorRepositoryState({
    store,
    repositoryState: projectService.getRepositoryState(),
    layoutId,
    resourceType,
  });
  if (payload.selectedItemId) {
    store.setSelectedItemId({ itemId: payload.selectedItemId });
    refs.fileExplorer.selectItem({ itemId: payload.selectedItemId });
  }
  await rerenderLayoutEditorSurface(deps);
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createLayoutElementsFileExplorerHandlers({
    getLayoutId: (deps) => deps.store.selectLayoutId(),
    getResourceType: (deps) => deps.store.selectLayoutResourceType(),
    refresh: refreshLayoutEditorData,
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export const handleDataChanged = refreshLayoutEditorData;

export const handleDialogueFormChange = async (deps, payload) => {
  const { store } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.setDialogueDefaultValue({ name, fieldValue });
  await rerenderLayoutEditorSurface(deps);
};

export const handleChoiceFormChange = async (deps, payload) => {
  const { store } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.setChoiceDefaultValue({ name, fieldValue });
  await rerenderLayoutEditorSurface(deps);
};

export const handleArrowKeyDown = async (deps, payload) => {
  const { store } = deps;
  const { _event: e } = payload;

  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }

  const unit = e.shiftKey ? KEYBOARD_UNITS.FAST : KEYBOARD_UNITS.NORMAL;
  const layoutId = store.selectLayoutId();
  const updatedItem = applyLayoutItemKeyboardChange({
    item: currentItem,
    key: payload._event.key,
    unit,
    resize: e.metaKey,
  });
  store.updateSelectedItem({ updatedItem: updatedItem });
  await rerenderLayoutEditorSurface(deps);
  scheduleKeyboardSave(deps, currentItem.id, layoutId);
};

/**
 * Handler for debounced element updates (saves to repository)
 * @param {Object} payload - Update payload
 * @param {Object} deps - Component dependencies
 * @param {boolean} skipUIUpdate - Skip UI updates for drag operations
 */
async function handleDebouncedUpdate(deps, payload) {
  const { appService, projectService } = deps;
  const { layoutId, resourceType, selectedItemId, updatedItem, replace } =
    payload;
  const persistResult = await persistLayoutEditorElementUpdate({
    projectService,
    layoutId,
    resourceType,
    selectedItemId,
    updatedItem,
    replace,
  });
  if (!persistResult.didPersist) {
    return;
  }

  const currentPayload = getEditorPayload(appService);
  syncLayoutEditorRepositoryState({
    store: deps.store,
    repositoryState: projectService.getRepositoryState(),
    layoutId: currentPayload.layoutId || layoutId,
    resourceType: currentPayload.resourceType || resourceType,
  });
}

const subscriptions = (deps) => {
  const { subject, appService } = deps;
  const { isInputFocused } = appService;
  return [
    createCollabRemoteRefreshStream({
      deps,
      matches: matchesRemoteTargets([
        "layouts",
        "controls",
        "images",
        "textStyles",
        "colors",
        "fonts",
        "variables",
      ]),
      refresh: refreshLayoutEditorData,
    }),
    fromEvent(window, "keydown").pipe(
      filter((e) => {
        const isInput = isInputFocused();
        if (isInput) {
          return;
        }
        return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.key,
        );
      }),
      tap((e) => {
        handleArrowKeyDown(deps, { _event: e });
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-start"),
      tap(() => {
        handlePointerUp(deps);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-end"),
      tap(() => {
        handlePointerDown(deps);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-move"),
      tap(({ payload }) => {
        handleCanvasMouseMove(deps, payload);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "layoutEditor.updateElement"),
      debounceTime(DEBOUNCE_DELAYS.UPDATE),
      tap(async ({ payload }) => {
        await handleDebouncedUpdate(deps, payload);
      }),
    ),
  ];
};

export const handleLayoutEditPanelUpdateHandler = async (deps, payload) => {
  const { store } = deps;
  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const selectedItemId = store.selectSelectedItemId();
  const detail = payload._event.detail;
  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }
  const updatedItem = applyLayoutItemFieldChange({
    item: currentItem,
    name: detail.name,
    value: detail.value,
    imagesData: store.selectImages(),
  });

  store.updateSelectedItem({ updatedItem: updatedItem });

  if (shouldPersistLayoutEditorFieldImmediately(detail.name)) {
    await handleDebouncedUpdate(deps, {
      layoutId,
      resourceType,
      selectedItemId,
      updatedItem,
    });
  } else {
    const { subject } = deps;
    subject.dispatch("layoutEditor.updateElement", {
      layoutId,
      resourceType,
      selectedItemId,
      updatedItem,
    });
  }

  await rerenderLayoutEditorSurface(deps);
};

export const handleCanvasMouseMove = (deps, payload) => {
  const { store, subject } = deps;
  if (
    !payload ||
    typeof payload.x !== "number" ||
    typeof payload.y !== "number"
  ) {
    return;
  }
  const { x, y } = payload;

  const drag = store.selectDragging();

  const item = store.selectSelectedItemData();
  if (!item) {
    return;
  }
  if (!drag.dragStartPosition) {
    store.setDragStartPosition({
      x,
      y,
      itemStartX: item.x,
      itemStartY: item.y,
    });
    return;
  }

  const updatedItem = applyLayoutItemDragChange({
    item,
    dragStartPosition: drag.dragStartPosition,
    x,
    y,
  });

  store.updateSelectedItem({ updatedItem: updatedItem });
  renderLayoutEditorPreview(deps);

  subject.dispatch("layoutEditor.updateElement", {
    layoutId: store.selectLayoutId(),
    resourceType: store.selectLayoutResourceType(),
    selectedItemId: item.id,
    updatedItem,
  });
};

export const handlePointerUp = (deps) => {
  const { store, render } = deps;
  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }
  store.startDragging({});
  render();
};

export const handlePointerDown = (deps) => {
  const { store, render } = deps;
  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }
  store.stopDragging({ isDragging: false });
  render();
};
