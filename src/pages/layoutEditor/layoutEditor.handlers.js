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
import { applyLayoutItemFieldChange } from "../../internal/layoutEditorMutations.js";
import { createLayoutElementsFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { normalizeInteractionValue } from "../../internal/project/interactionPayload.js";

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

const getRepositoryResourceCollection = (repositoryState, resourceType) => {
  return resourceType === "controls"
    ? repositoryState.controls || { items: {}, tree: [] }
    : repositoryState.layouts || { items: {}, tree: [] };
};

const getEditorElementOwnerKey = (resourceType) => {
  return resourceType === "controls" ? "controlId" : "layoutId";
};

const isPlainObject = (value) => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const areValuesEqual = (left, right) => {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => areValuesEqual(value, right[index]))
    );
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(right, key) && areValuesEqual(left[key], right[key]),
      )
    );
  }

  return false;
};

const createObjectPatch = (previousValue, nextValue) => {
  const previousObject = isPlainObject(previousValue) ? previousValue : {};
  const nextObject = isPlainObject(nextValue) ? nextValue : {};
  const patch = {};
  let hasChanges = false;
  let requiresReplace = false;

  for (const key of Object.keys(previousObject)) {
    if (!Object.hasOwn(nextObject, key)) {
      requiresReplace = true;
      break;
    }
  }

  for (const [key, value] of Object.entries(nextObject)) {
    if (!Object.hasOwn(previousObject, key)) {
      patch[key] = structuredClone(value);
      hasChanges = true;
      continue;
    }

    const previousEntry = previousObject[key];

    if (areValuesEqual(previousEntry, value)) {
      continue;
    }

    if (isPlainObject(previousEntry) && isPlainObject(value)) {
      const nestedResult = createObjectPatch(previousEntry, value);
      if (nestedResult.requiresReplace) {
        requiresReplace = true;
      } else if (nestedResult.hasChanges) {
        patch[key] = nestedResult.patch;
        hasChanges = true;
      }
      continue;
    }

    patch[key] = structuredClone(value);
    hasChanges = true;
  }

  return {
    patch,
    hasChanges,
    requiresReplace,
  };
};

const normalizeLayoutElementInteractions = (item = {}) => {
  if (!item || typeof item !== "object") {
    return item;
  }

  const nextItem = structuredClone(item);

  for (const key of ["click", "rightClick", "change"]) {
    if (nextItem[key] !== undefined) {
      nextItem[key] = normalizeInteractionValue(nextItem[key]);
    }
  }

  return nextItem;
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

const syncLayoutEditorState = (
  deps,
  repositoryState,
  layoutId,
  resourceType = "layouts",
) => {
  const { store } = deps;
  const { images, textStyles, colors, fonts, variables } = repositoryState;
  const resourceCollection = getRepositoryResourceCollection(
    repositoryState,
    resourceType,
  );
  const layout = layoutId ? resourceCollection.items?.[layoutId] : undefined;

  store.setLayout({ id: layoutId, layout, resourceType });
  store.setItems({ layoutData: layout?.elements || { items: {}, tree: [] } });
  store.setImages({ images: images || { items: {}, tree: [] } });
  store.setTextStylesData({
    textStylesData: textStyles || { items: {}, tree: [] },
  });
  store.setColorsData({ colorsData: colors || { items: {}, tree: [] } });
  store.setFontsData({ fontsData: fonts || { items: {}, tree: [] } });
  store.setVariablesData({
    variablesData: variables || { items: {}, tree: [] },
  });
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService, render, refs, graphicsService } = deps;
  const payload = getEditorPayload(appService);
  const { layoutId, resourceType } = payload;
  await projectService.ensureRepository();
  syncLayoutEditorState(
    deps,
    projectService.getRepositoryState(),
    layoutId,
    resourceType,
  );

  const { canvas } = refs;
  await graphicsService.init({ canvas: canvas });

  await renderLayoutEditorPreview(deps);
  render();
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
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const itemId = detail.id || detail.itemId || detail.item?.id;
  if (!itemId) {
    return;
  }
  store.setSelectedItemId({ itemId: itemId });
  render();
  await renderLayoutEditorPreview(deps);
};

export const handleAddLayoutClick = handleRenderOnly;

const refreshLayoutEditorData = async (deps, payload = {}) => {
  const { appService, projectService, render, store, refs } = deps;
  const { layoutId, resourceType } = getEditorPayload(appService);
  await projectService.ensureRepository();
  syncLayoutEditorState(
    deps,
    projectService.getRepositoryState(),
    layoutId,
    resourceType,
  );
  if (payload.selectedItemId) {
    store.setSelectedItemId({ itemId: payload.selectedItemId });
    refs.fileExplorer.selectItem({ itemId: payload.selectedItemId });
  }
  render();
  await renderLayoutEditorPreview(deps);
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createLayoutElementsFileExplorerHandlers({
    getLayoutId: (deps) => deps.store.selectLayoutId(),
    getResourceType: (deps) => deps.store.selectLayoutResourceType(),
    refresh: refreshLayoutEditorData,
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export const handleDataChanged = refreshLayoutEditorData;

const shouldSaveLayoutEditImmediately = (name) => {
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }

  return (
    name === "click" ||
    name.startsWith("click.") ||
    name === "rightClick" ||
    name.startsWith("rightClick.") ||
    name === "change" ||
    name.startsWith("change.")
  );
};

export const handleDialogueFormChange = async (deps, payload) => {
  const { store, render } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.setDialogueDefaultValue({ name, fieldValue });
  render();

  await renderLayoutEditorPreview(deps);
};

export const handleChoiceFormChange = async (deps, payload) => {
  const { store, render } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.setChoiceDefaultValue({ name, fieldValue });
  render();

  await renderLayoutEditorPreview(deps);
};

export const handleArrowKeyDown = async (deps, payload) => {
  const { store, render } = deps;
  const { _event: e } = payload;

  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }

  const unit = e.shiftKey ? KEYBOARD_UNITS.FAST : KEYBOARD_UNITS.NORMAL;
  let change = {};
  const layoutId = store.selectLayoutId();

  if (payload._event.key === "ArrowUp") {
    if (e.metaKey) {
      change = {
        height: Math.round(currentItem.height - unit),
      };
    } else {
      change = {
        y: Math.round(currentItem.y - unit),
      };
    }
  } else if (payload._event.key === "ArrowDown") {
    if (e.metaKey) {
      change = {
        height: Math.round(currentItem.height + unit),
      };
    } else {
      change = {
        y: Math.round(currentItem.y + unit),
      };
    }
  } else if (payload._event.key === "ArrowLeft") {
    if (e.metaKey) {
      change = {
        width: Math.round(currentItem.width - unit),
      };
    } else {
      change = {
        x: Math.round(currentItem.x - unit),
      };
    }
  } else if (payload._event.key === "ArrowRight") {
    if (e.metaKey) {
      change = {
        width: Math.round(currentItem.width + unit),
      };
    } else {
      change = {
        x: Math.round(currentItem.x + unit),
      };
    }
  }

  const updatedItem = { ...currentItem, ...change };
  store.updateSelectedItem({ updatedItem: updatedItem });
  render();
  await renderLayoutEditorPreview(deps);
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
  const ownerCollection = getRepositoryResourceCollection(
    projectService.getRepositoryState(),
    resourceType,
  );
  const currentItem =
    ownerCollection?.items?.[layoutId]?.elements?.items?.[selectedItemId];

  if (!currentItem || !updatedItem) {
    return;
  }

  const previousItem = normalizeLayoutElementInteractions({
    id: selectedItemId,
    ...currentItem,
  });
  const normalizedUpdatedItem = normalizeLayoutElementInteractions(updatedItem);
  const diff = createObjectPatch(previousItem, normalizedUpdatedItem);

  if (!diff.hasChanges && !diff.requiresReplace) {
    return;
  }

  const shouldReplace = replace === true || diff.requiresReplace;
  const { id: _ignoredItemId, ...nextReplaceData } = normalizedUpdatedItem;

  const ownerPayloadKey = getEditorElementOwnerKey(resourceType);
  const updateElement =
    resourceType === "controls"
      ? projectService.updateControlElement.bind(projectService)
      : projectService.updateLayoutElement.bind(projectService);

  await updateElement({
    [ownerPayloadKey]: layoutId,
    elementId: selectedItemId,
    data: shouldReplace ? nextReplaceData : diff.patch,
    replace: shouldReplace,
  });

  // For form/keyboard updates, sync store with repository
  const currentPayload = getEditorPayload(appService);
  syncLayoutEditorState(
    deps,
    projectService.getRepositoryState(),
    currentPayload.layoutId || layoutId,
    currentPayload.resourceType || resourceType,
  );
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
  const { store, render } = deps;
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
  render();

  if (shouldSaveLayoutEditImmediately(detail.name)) {
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

  await renderLayoutEditorPreview(deps);
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

  const updatedItem = {
    ...item,
    x: drag.dragStartPosition.itemStartX + x - drag.dragStartPosition.x,
    y: drag.dragStartPosition.itemStartY + y - drag.dragStartPosition.y,
  };

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
