import { debounceTime, filter, fromEvent, tap } from "rxjs";
import {
  DEFAULT_PROJECT_RESOLUTION,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import { generateId, generatePrefixedId } from "../../internal/id.js";
import {
  canResizeLayoutEditorItemHeight,
  canResizeLayoutEditorItemWidth,
} from "../../internal/layoutEditorElementRegistry.js";
import { captureCanvasThumbnailImage } from "../../internal/runtime/graphicsEngineRuntime.js";
import {
  createLayoutEditorAssetReferences,
  createLayoutEditorHoverOverlay,
  createLayoutEditorRenderedElements,
  loadLayoutEditorAssets,
} from "./support/layoutEditorCanvasRender.js";
import {
  resolveLayoutEditorCanvasHitPath,
  selectLayoutEditorCanvasHit,
  selectLayoutEditorCanvasHover,
  selectNextLayoutEditorCanvasHit,
} from "./support/layoutEditorCanvasSelection.js";

const KEYBOARD_SAVE_DELAY = 1000;

const KEYBOARD_UNITS = {
  NORMAL: 1,
  FAST: 10,
};
const MIN_RESIZE_DIMENSION = 1;
const RESIZE_TARGET_PREFIX = "selected-border-resize-";
const POINTER_DRAG_THRESHOLD = 4;

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const requireCanvasResolution = (props = {}) => {
  return requireProjectResolution(
    props.resolution ?? DEFAULT_PROJECT_RESOLUTION,
    "Layout editor canvas resolution",
  );
};

const getSelectedItem = (props = {}, pendingUpdatedItem) => {
  if (pendingUpdatedItem) {
    return pendingUpdatedItem;
  }

  const itemId = props.selectedItemId;
  const item = props.layoutState?.elements?.items?.[itemId];
  if (!itemId || !item) {
    return undefined;
  }

  return {
    id: itemId,
    ...item,
  };
};

const toStoredItem = (item = {}) => {
  const nextItem = {};

  for (const [key, value] of Object.entries(item)) {
    if (key === "id") {
      continue;
    }

    nextItem[key] = value;
  }

  return nextItem;
};

const createLayoutDataWithUpdatedItem = (layoutData, updatedItem) => {
  if (!updatedItem?.id) {
    return layoutData;
  }

  const nextItems = Object.assign({}, layoutData?.items);
  nextItems[updatedItem.id] = toStoredItem(updatedItem);

  return {
    tree: layoutData?.tree ?? [],
    items: nextItems,
  };
};

const getRepositoryState = async (deps) => {
  await deps.projectService.ensureRepository();
  return deps.projectService.getRepositoryState();
};

const areCanvasItemsEquivalent = (left, right) => {
  if (!left || !right) {
    return false;
  }

  return (
    left.id === right.id &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
};

const areCanvasLayoutStatesEquivalent = (left = {}, right = {}) => {
  return (
    left?.id === right?.id &&
    left?.layoutType === right?.layoutType &&
    left?.layoutSchemaVersion === right?.layoutSchemaVersion &&
    left?.elements === right?.elements
  );
};

const isCanvasRenderRequestStale = (deps, renderRequestId) => {
  return deps.store.selectActiveRenderRequestId() !== renderRequestId;
};

const finishStaleCanvasRender = (deps, renderRequestId) => {
  if (!isCanvasRenderRequestStale(deps, renderRequestId)) {
    return false;
  }
  return true;
};

export const applyCanvasItemDragChange = ({
  item,
  dragStartPosition,
  x,
  y,
} = {}) => {
  if (
    !item ||
    !dragStartPosition ||
    typeof x !== "number" ||
    typeof y !== "number"
  ) {
    return item;
  }

  return {
    ...item,
    x: dragStartPosition.itemStartX + x - dragStartPosition.x,
    y: dragStartPosition.itemStartY + y - dragStartPosition.y,
  };
};

const getAspectRatioLock = (item = {}) => {
  const aspectRatioLock = Number(item.aspectRatioLock);
  if (Number.isFinite(aspectRatioLock) && aspectRatioLock > 0) {
    return aspectRatioLock;
  }

  return undefined;
};

const canResizeCanvasItemForEdge = (item = {}, resizeEdge) => {
  if (resizeEdge === "left" || resizeEdge === "right") {
    return canResizeLayoutEditorItemWidth(item);
  }

  if (resizeEdge === "top" || resizeEdge === "bottom") {
    return canResizeLayoutEditorItemHeight(item);
  }

  return false;
};

const clampResizeDimension = (value) => {
  if (!Number.isFinite(value)) {
    return MIN_RESIZE_DIMENSION;
  }

  return Math.max(MIN_RESIZE_DIMENSION, Math.round(value));
};

export const applyCanvasItemResizeChange = ({
  item,
  dragStartPosition,
  resizeEdge,
  x,
  y,
} = {}) => {
  if (
    !item ||
    !dragStartPosition ||
    typeof resizeEdge !== "string" ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof dragStartPosition.itemStartWidth !== "number" ||
    typeof dragStartPosition.itemStartHeight !== "number"
  ) {
    return item;
  }

  const deltaX = x - dragStartPosition.x;
  const deltaY = y - dragStartPosition.y;
  const nextItem = {
    ...item,
  };
  const aspectRatioLock = getAspectRatioLock(item);

  if (!canResizeCanvasItemForEdge(item, resizeEdge)) {
    return item;
  }

  if (resizeEdge === "left") {
    nextItem.width = clampResizeDimension(
      dragStartPosition.itemStartWidth - deltaX,
    );
    nextItem.x =
      dragStartPosition.itemStartX +
      (dragStartPosition.itemStartWidth - nextItem.width);
    if (aspectRatioLock) {
      nextItem.height = clampResizeDimension(nextItem.width / aspectRatioLock);
    }
  } else if (resizeEdge === "right") {
    nextItem.width = clampResizeDimension(
      dragStartPosition.itemStartWidth + deltaX,
    );
    if (aspectRatioLock) {
      nextItem.height = clampResizeDimension(nextItem.width / aspectRatioLock);
    }
  } else if (resizeEdge === "top") {
    nextItem.height = clampResizeDimension(
      dragStartPosition.itemStartHeight - deltaY,
    );
    nextItem.y =
      dragStartPosition.itemStartY +
      (dragStartPosition.itemStartHeight - nextItem.height);
    if (aspectRatioLock) {
      nextItem.width = clampResizeDimension(nextItem.height * aspectRatioLock);
    }
  } else if (resizeEdge === "bottom") {
    nextItem.height = clampResizeDimension(
      dragStartPosition.itemStartHeight + deltaY,
    );
    if (aspectRatioLock) {
      nextItem.width = clampResizeDimension(nextItem.height * aspectRatioLock);
    }
  }

  return nextItem;
};

const getDragModeFromTargetId = (targetId) => {
  if (targetId?.startsWith(RESIZE_TARGET_PREFIX)) {
    return targetId.slice(RESIZE_TARGET_PREFIX.length);
  }

  return "move";
};

const isDeepSelectModifierActive = (event = {}) => {
  return event.metaKey === true || event.ctrlKey === true;
};

const toRendererPointerPosition = (deps, event = {}) => {
  const canvasBounds = deps.refs.canvas.getBoundingClientRect();
  if (canvasBounds.width <= 0 || canvasBounds.height <= 0) {
    return undefined;
  }

  const { width, height } = requireCanvasResolution(deps.props);
  const localX = event.clientX - canvasBounds.left;
  const localY = event.clientY - canvasBounds.top;

  if (
    localX < 0 ||
    localY < 0 ||
    localX > canvasBounds.width ||
    localY > canvasBounds.height
  ) {
    return undefined;
  }

  return {
    x: (localX / canvasBounds.width) * width,
    y: (localY / canvasBounds.height) * height,
    clientX: event.clientX,
    clientY: event.clientY,
  };
};

const getCanvasUnitsPerCssPixel = (deps, props = deps.props) => {
  const canvasBounds = deps.refs.canvas.getBoundingClientRect();
  if (canvasBounds.width <= 0) {
    return 1;
  }

  const { width } = requireCanvasResolution(props);
  return width / canvasBounds.width;
};

const hitTestCanvasPosition = (deps, position) => {
  if (!position) {
    return {
      blocked: false,
      path: [],
    };
  }

  const hits = deps.graphicsService.hitTestElementBounds({
    x: position.x,
    y: position.y,
  });

  return resolveLayoutEditorCanvasHitPath({
    hits,
    occurrencesById: deps.store.selectSelectionOccurrencesById(),
  });
};

const areBoundsCornersEqual = (left, right) => {
  const leftCorners = left?.corners ?? [];
  const rightCorners = right?.corners ?? [];

  return (
    leftCorners.length === rightCorners.length &&
    leftCorners.every((corner, index) => {
      return (
        corner.x === rightCorners[index]?.x &&
        corner.y === rightCorners[index]?.y
      );
    })
  );
};

const areCanvasSelectionsEqual = (left, right) => {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.itemId === right.itemId &&
    left.occurrenceId === right.occurrenceId &&
    areBoundsCornersEqual(left.bounds, right.bounds)
  );
};

const renderCanvasHoverOverlay = (deps, selection) => {
  const { elements, canvasUnitsPerCssPixel } =
    deps.store.selectCanvasRenderState();
  if (elements.length === 0) {
    return;
  }

  const hoverElements = createLayoutEditorHoverOverlay({
    bounds: selection?.bounds,
    canvasUnitsPerCssPixel,
  });
  const selectionOverlayIndex = elements.findIndex(({ id }) => {
    return id?.startsWith("selected-border");
  });
  const renderedElements =
    selectionOverlayIndex < 0
      ? [...elements, ...hoverElements]
      : [
          ...elements.slice(0, selectionOverlayIndex),
          ...hoverElements,
          ...elements.slice(selectionOverlayIndex),
        ];
  deps.graphicsService.render({
    elements: renderedElements,
    animations: [],
  });
};

const clearCanvasHover = (deps) => {
  if (!deps.store.selectHoveredSelection()) {
    return;
  }

  deps.store.clearHoveredSelection();
  renderCanvasHoverOverlay(deps);
};

const updateCanvasHover = (deps) => {
  const position = deps.store.selectLastPointerPosition();
  const pointerGesture = deps.store.selectPointerGesture();
  if (!position || pointerGesture?.moved === true) {
    clearCanvasHover(deps);
    return;
  }

  const hitResolution = hitTestCanvasPosition(deps, position);
  const selection = selectLayoutEditorCanvasHover(hitResolution, {
    deepSelect: deps.store.selectDeepSelectActive(),
    selectedOccurrenceId: deps.store.selectResolvedSelectedOccurrenceId(),
  });
  const currentSelection = deps.store.selectHoveredSelection();

  if (areCanvasSelectionsEqual(currentSelection, selection)) {
    return;
  }

  deps.store.setHoveredSelection({ selection });
  renderCanvasHoverOverlay(deps, selection);
};

const scheduleCanvasHoverUpdate = (deps) => {
  if (deps.store.selectHoverFrameId() !== undefined) {
    return;
  }

  if (typeof globalThis.requestAnimationFrame !== "function") {
    updateCanvasHover(deps);
    return;
  }

  const frameId = globalThis.requestAnimationFrame(() => {
    deps.store.setHoverFrameId({ frameId: undefined });
    updateCanvasHover(deps);
  });
  deps.store.setHoverFrameId({ frameId });
};

const dispatchCanvasSelection = (deps, selection) => {
  if (selection) {
    deps.store.setSelectedOccurrence({
      occurrenceId: selection.occurrenceId,
      ownerItemId: selection.itemId,
    });
  } else {
    deps.store.clearSelectedOccurrence();
  }

  deps.dispatchEvent(
    new CustomEvent("selection-change", {
      detail: {
        itemId: selection?.itemId,
        occurrenceId: selection?.occurrenceId,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const applyCanvasItemKeyboardChange = ({
  item,
  key,
  unit = 1,
  resize = false,
} = {}) => {
  if (!item || typeof key !== "string") {
    return item;
  }

  let change;

  if (key === "ArrowUp") {
    if (resize && !canResizeLayoutEditorItemHeight(item)) {
      return item;
    }
    change = resize
      ? { height: Math.round(item.height - unit) }
      : { y: Math.round(item.y - unit) };
  } else if (key === "ArrowDown") {
    if (resize && !canResizeLayoutEditorItemHeight(item)) {
      return item;
    }
    change = resize
      ? { height: Math.round(item.height + unit) }
      : { y: Math.round(item.y + unit) };
  } else if (key === "ArrowLeft") {
    if (resize && !canResizeLayoutEditorItemWidth(item)) {
      return item;
    }
    change = resize
      ? { width: Math.round(item.width - unit) }
      : { x: Math.round(item.x - unit) };
  } else if (key === "ArrowRight") {
    if (resize && !canResizeLayoutEditorItemWidth(item)) {
      return item;
    }
    change = resize
      ? { width: Math.round(item.width + unit) }
      : { x: Math.round(item.x + unit) };
  } else {
    return item;
  }

  return {
    ...item,
    ...change,
  };
};

const dispatchCanvasItemEvent = (deps, eventName, updatedItem) => {
  if (!updatedItem?.id) {
    return;
  }

  deps.dispatchEvent(
    new CustomEvent(eventName, {
      detail: {
        itemId: updatedItem.id,
        updatedItem,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const prefetchLayoutEditorAssets = async (
  deps,
  props = deps.props,
  _options = {},
) => {
  if (!deps.store.selectIsGraphicsReady()) {
    return;
  }

  try {
    await deps.graphicsService.waitUntilReady?.();
    const repositoryState = await getRepositoryState(deps);
    const layoutState = {
      id: props.layoutState?.id,
      layoutType: props.layoutState?.layoutType,
      layoutSchemaVersion: props.layoutState?.layoutSchemaVersion,
      elements: props.layoutState?.elements,
    };
    const { fileReferences } = createLayoutEditorAssetReferences({
      layoutState,
      repositoryState,
      previewData: props.previewData,
      resolution: props.resolution,
    });

    if (fileReferences.length === 0) {
      return;
    }

    const assets = await loadLayoutEditorAssets({
      projectService: deps.projectService,
      selectCachedFileContent: deps.store.selectCachedFileContent,
      clearCachedFileContent: deps.store.clearCachedFileContent,
      cacheFileContent: deps.store.cacheFileContent,
      hasLoadedAsset: deps.graphicsService.hasLoadedAsset,
      fileReferences,
      fontsItems: repositoryState?.fonts?.items || {},
    });
    await deps.graphicsService.loadAssets(assets);
  } catch (error) {
    console.error("[layoutEditorCanvas] Failed to prefetch assets", error);
  }
};

const renderLayoutEditorCanvas = async (
  deps,
  props = deps.props,
  { clearFirst = false, updatedItem } = {},
) => {
  const renderRequestId = generateId();
  deps.store.setActiveRenderRequestId({
    requestId: renderRequestId,
  });
  if (!deps.store.selectIsGraphicsReady()) {
    return;
  }

  try {
    await deps.graphicsService.waitUntilReady?.();
    if (finishStaleCanvasRender(deps, renderRequestId)) {
      return;
    }
    const repositoryState = await getRepositoryState(deps);
    if (finishStaleCanvasRender(deps, renderRequestId)) {
      return;
    }
    const layoutData = updatedItem
      ? createLayoutDataWithUpdatedItem(
          props.layoutState?.elements,
          updatedItem,
        )
      : props.layoutState?.elements;
    const layoutState = {
      id: props.layoutState?.id,
      layoutType: props.layoutState?.layoutType,
      layoutSchemaVersion: props.layoutState?.layoutSchemaVersion,
      elements: layoutData,
    };
    const canvasUnitsPerCssPixel = getCanvasUnitsPerCssPixel(deps, props);
    const {
      elements,
      fileReferences,
      selectedElementMetrics,
      occurrencesById,
      occurrenceIdsByOwner,
    } = createLayoutEditorRenderedElements({
      layoutState,
      repositoryState,
      previewData: props.previewData,
      resolution: props.resolution,
      selectedItemId: props.selectedItemId,
      selectedOccurrenceId: deps.store.selectSelectedOccurrenceId(),
      disableMoveDrag: props.disableMoveDrag === true,
      canvasUnitsPerCssPixel,
      graphicsService: deps.graphicsService,
    });
    if (finishStaleCanvasRender(deps, renderRequestId)) {
      return;
    }

    deps.dispatchEvent(
      new CustomEvent("selected-element-metrics-change", {
        detail: {
          metrics: selectedElementMetrics,
        },
        bubbles: true,
        composed: true,
      }),
    );

    if (clearFirst) {
      deps.graphicsService.render({
        id: generatePrefixedId("layout-editor-preview-clear-"),
        elements: [],
        animations: [],
      });
    }

    let assets = await loadLayoutEditorAssets({
      projectService: deps.projectService,
      selectCachedFileContent: deps.store.selectCachedFileContent,
      clearCachedFileContent: deps.store.clearCachedFileContent,
      cacheFileContent: deps.store.cacheFileContent,
      hasLoadedAsset: deps.graphicsService.hasLoadedAsset,
      fileReferences,
      fontsItems: repositoryState?.fonts?.items || {},
    });
    if (finishStaleCanvasRender(deps, renderRequestId)) {
      return;
    }
    try {
      await deps.graphicsService.loadAssets(assets);
      if (finishStaleCanvasRender(deps, renderRequestId)) {
        return;
      }
    } catch {
      deps.store.clearFileContentCache();
      assets = await loadLayoutEditorAssets({
        projectService: deps.projectService,
        selectCachedFileContent: deps.store.selectCachedFileContent,
        clearCachedFileContent: deps.store.clearCachedFileContent,
        cacheFileContent: deps.store.cacheFileContent,
        hasLoadedAsset: deps.graphicsService.hasLoadedAsset,
        fileReferences,
        fontsItems: repositoryState?.fonts?.items || {},
      });
      if (finishStaleCanvasRender(deps, renderRequestId)) {
        return;
      }
      await deps.graphicsService.loadAssets(assets);
      if (finishStaleCanvasRender(deps, renderRequestId)) {
        return;
      }
    }

    deps.graphicsService.render({
      elements,
      animations: [],
    });
    deps.store.setCanvasRenderState({
      elements,
      canvasUnitsPerCssPixel,
    });
    deps.store.setSelectionOccurrences({
      occurrencesById,
      occurrenceIdsByOwner,
    });
    if (deps.store.selectLastPointerPosition()) {
      scheduleCanvasHoverUpdate(deps);
    }
  } catch (error) {
    console.error("[layoutEditorCanvas] Failed to render canvas", error);
  }
};

const initCanvasGraphics = async (deps, props = deps.props) => {
  const { width, height } = requireCanvasResolution(props);

  deps.store.setGraphicsReady({ value: false });
  await deps.graphicsService.init({
    canvas: deps.refs.canvas,
    width,
    height,
  });
  deps.store.setGraphicsReady({ value: true });
};

export const handleCaptureThumbnailImage = async (deps) => {
  return captureCanvasThumbnailImage(deps.graphicsService, deps.refs.canvas);
};

export const handleCanvasPointerMove = (deps, payload) => {
  const event = payload._event;
  const position = toRendererPointerPosition(deps, event);
  const deepSelectActive = isDeepSelectModifierActive(event);
  deps.store.setDeepSelectActive({ value: deepSelectActive });

  if (!position) {
    deps.store.clearLastPointerPosition();
    clearCanvasHover(deps);
    return;
  }

  deps.store.setLastPointerPosition({ position });
  const pointerGesture = deps.store.selectPointerGesture();
  if (
    pointerGesture?.pointerId === event.pointerId &&
    pointerGesture.moved !== true
  ) {
    const distance = Math.hypot(
      position.clientX - pointerGesture.startClientX,
      position.clientY - pointerGesture.startClientY,
    );

    if (distance >= POINTER_DRAG_THRESHOLD) {
      deps.store.setPointerGesture({
        gesture: {
          ...pointerGesture,
          moved: true,
        },
      });
      clearCanvasHover(deps);
      return;
    }
  }

  scheduleCanvasHoverUpdate(deps);
};

export const handleCanvasPointerLeave = (deps) => {
  deps.store.clearLastPointerPosition();
  clearCanvasHover(deps);
};

export const handleCanvasPointerDown = (deps, payload) => {
  const event = payload._event;
  if (event.button !== 0 || event.isPrimary === false) {
    return;
  }

  const position = toRendererPointerPosition(deps, event);
  const hitResolution = hitTestCanvasPosition(deps, position);
  deps.store.clearPendingClickGesture();

  if (!position || hitResolution.blocked === true) {
    deps.store.clearPointerGesture();
    clearCanvasHover(deps);
    return;
  }

  deps.store.setPointerGesture({
    gesture: {
      pointerId: event.pointerId,
      startClientX: position.clientX,
      startClientY: position.clientY,
      hitResolution,
      selectedItemIdAtStart: deps.props.selectedItemId,
      moved: false,
    },
  });
};

export const handleCanvasPointerUp = (deps, payload) => {
  const event = payload._event;
  const pointerGesture = deps.store.selectPointerGesture();
  if (!pointerGesture || pointerGesture.pointerId !== event.pointerId) {
    return;
  }

  deps.store.clearPointerGesture();
  if (pointerGesture.moved === true) {
    deps.store.clearPendingClickGesture();
    return;
  }

  deps.store.setPendingClickGesture({
    gesture: {
      hitResolution: pointerGesture.hitResolution,
      selectedItemIdAtStart: pointerGesture.selectedItemIdAtStart,
    },
  });
};

export const handleCanvasPointerCancel = (deps) => {
  deps.store.clearPointerGesture();
  deps.store.clearPendingClickGesture();
  clearCanvasHover(deps);
};

export const handleCanvasClick = (deps, payload) => {
  const event = payload._event;
  const clickGesture = deps.store.selectPendingClickGesture();
  deps.store.clearPendingClickGesture();

  if (!clickGesture) {
    return;
  }

  const clickCount = event.detail ?? 1;
  const currentSequence = deps.store.selectDoubleClickSequence();
  if (clickCount > 1) {
    deps.store.setDoubleClickSequence({
      sequence: {
        selectedItemIdAtStart:
          currentSequence?.selectedItemIdAtStart ??
          clickGesture.selectedItemIdAtStart,
        hitResolution: clickGesture.hitResolution,
      },
    });
    return;
  }

  deps.store.setDoubleClickSequence({
    sequence: {
      selectedItemIdAtStart: clickGesture.selectedItemIdAtStart,
      hitResolution: clickGesture.hitResolution,
    },
  });
  const selection = selectLayoutEditorCanvasHit(clickGesture.hitResolution, {
    deepSelect: isDeepSelectModifierActive(event),
  });
  dispatchCanvasSelection(deps, selection);
};

export const handleCanvasDoubleClick = (deps) => {
  const sequence = deps.store.selectDoubleClickSequence();
  deps.store.clearDoubleClickSequence();
  deps.store.clearPendingClickGesture();
  if (!sequence) {
    return;
  }

  const selection = selectNextLayoutEditorCanvasHit(sequence.hitResolution, {
    selectedItemId: sequence.selectedItemIdAtStart,
  });
  dispatchCanvasSelection(deps, selection);
};

const handleCanvasModifierChange = (deps, event) => {
  if (event.key !== "Meta" && event.key !== "Control") {
    return;
  }

  const deepSelectActive = isDeepSelectModifierActive(event);
  if (deps.store.selectDeepSelectActive() === deepSelectActive) {
    return;
  }

  deps.store.setDeepSelectActive({ value: deepSelectActive });
  if (deps.store.selectLastPointerPosition()) {
    scheduleCanvasHoverUpdate(deps);
  }
};

export const handleUseDefaultSelectionOccurrence = async (deps) => {
  deps.store.clearSelectedOccurrence();
  await renderLayoutEditorCanvas(deps, deps.props, {
    updatedItem: deps.store.selectPendingUpdatedItem(),
    reason: "default-selection-occurrence",
  });
};

const handleKeyboardMove = async (deps, event) => {
  if (deps.props.disableInteraction === true) {
    return;
  }

  const pendingUpdatedItem = deps.store.selectPendingUpdatedItem();
  const currentItem = getSelectedItem(deps.props, pendingUpdatedItem);
  if (!currentItem) {
    return;
  }

  event.preventDefault();

  const updatedItem = applyCanvasItemKeyboardChange({
    item: currentItem,
    key: event.key,
    unit: event.shiftKey ? KEYBOARD_UNITS.FAST : KEYBOARD_UNITS.NORMAL,
    resize: event.metaKey || deps.props.disableMoveDrag === true,
  });
  if (updatedItem === currentItem) {
    return;
  }

  deps.store.setPendingUpdatedItem({ updatedItem });
  await renderLayoutEditorCanvas(deps, deps.props, {
    updatedItem,
    reason: "keyboard-move",
  });
  dispatchCanvasItemEvent(deps, "drag-update", updatedItem);
  deps.subject.dispatch("layoutEditorCanvas.keyboardNavigationMoved", {
    itemId: currentItem.id,
  });
};

const handleBorderDragStart = (deps, payload = {}) => {
  if (deps.props.disableInteraction === true) {
    return;
  }

  const currentItem = getSelectedItem(
    deps.props,
    deps.store.selectPendingUpdatedItem(),
  );
  if (!currentItem) {
    return;
  }

  const dragMode = getDragModeFromTargetId(payload.targetId);
  if (
    dragMode !== "move" &&
    !canResizeCanvasItemForEdge(currentItem, dragMode)
  ) {
    return;
  }

  deps.store.startDragging({
    dragMode,
  });
  deps.store.clearPointerGesture();
  deps.store.clearPendingClickGesture();
  clearCanvasHover(deps);
  deps.render();
};

const handleBorderDragMove = async (deps, payload = {}) => {
  if (typeof payload.x !== "number" || typeof payload.y !== "number") {
    return;
  }

  const currentItem = getSelectedItem(
    deps.props,
    deps.store.selectPendingUpdatedItem(),
  );
  if (!currentItem) {
    return;
  }

  const dragging = deps.store.selectDragging();
  if (!dragging.dragStartPosition) {
    deps.store.setDragStartPosition({
      x: payload.x,
      y: payload.y,
      itemStartX: currentItem.x,
      itemStartY: currentItem.y,
      itemStartWidth: currentItem.width,
      itemStartHeight: currentItem.height,
    });
    return;
  }

  const updatedItem =
    dragging.dragMode === "move"
      ? applyCanvasItemDragChange({
          item: currentItem,
          dragStartPosition: dragging.dragStartPosition,
          x: payload.x,
          y: payload.y,
        })
      : applyCanvasItemResizeChange({
          item: currentItem,
          dragStartPosition: dragging.dragStartPosition,
          resizeEdge: dragging.dragMode,
          x: payload.x,
          y: payload.y,
        });
  if (updatedItem === currentItem) {
    return;
  }

  deps.store.setPendingUpdatedItem({ updatedItem });
  await renderLayoutEditorCanvas(deps, deps.props, {
    updatedItem,
    reason: "border-drag-move",
  });
  dispatchCanvasItemEvent(deps, "drag-update", updatedItem);
};

const handleBorderDragEnd = async (deps) => {
  const pendingUpdatedItem = getSelectedItem(
    deps.props,
    deps.store.selectPendingUpdatedItem(),
  );

  deps.store.stopDragging();
  deps.render();

  if (!pendingUpdatedItem) {
    return;
  }

  await renderLayoutEditorCanvas(deps, deps.props, {
    updatedItem: pendingUpdatedItem,
    reason: "border-drag-end",
  });
  dispatchCanvasItemEvent(deps, "update", pendingUpdatedItem);
};

const subscriptions = (deps) => {
  const { appService, subject } = deps;

  return [
    fromEvent(window, "keydown").pipe(
      filter((event) => {
        if (appService.isInputFocused()) {
          return false;
        }

        return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          event.key,
        );
      }),
      tap((event) => {
        handleKeyboardMove(deps, event);
      }),
    ),
    fromEvent(window, "keydown").pipe(
      tap((event) => {
        handleCanvasModifierChange(deps, event);
      }),
    ),
    fromEvent(window, "keyup").pipe(
      tap((event) => {
        handleCanvasModifierChange(deps, event);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-start"),
      tap(({ payload }) => {
        handleBorderDragStart(deps, payload);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-move"),
      tap(({ payload }) => {
        handleBorderDragMove(deps, payload);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-end"),
      tap(() => {
        handleBorderDragEnd(deps);
      }),
    ),
    subject.pipe(
      filter(
        ({ action }) => action === "layoutEditorCanvas.keyboardNavigationMoved",
      ),
      debounceTime(KEYBOARD_SAVE_DELAY),
      tap(async ({ payload }) => {
        const pendingUpdatedItem = getSelectedItem(
          deps.props,
          deps.store.selectPendingUpdatedItem(),
        );
        if (!pendingUpdatedItem || pendingUpdatedItem.id !== payload?.itemId) {
          return;
        }

        dispatchCanvasItemEvent(deps, "update", pendingUpdatedItem);
      }),
    ),
  ];
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);

  return () => {
    const hoverFrameId = deps.store.selectHoverFrameId();
    if (
      hoverFrameId !== undefined &&
      typeof globalThis.cancelAnimationFrame === "function"
    ) {
      globalThis.cancelAnimationFrame(hoverFrameId);
    }
    cleanupSubscriptions?.();
    void deps.graphicsService.destroy();
  };
};

export const handleAfterMount = async (deps) => {
  await initCanvasGraphics(deps);
  await prefetchLayoutEditorAssets(deps, deps.props, {
    reason: "after-mount",
  });
  await renderLayoutEditorCanvas(deps, deps.props, {
    reason: "after-mount",
  });
};

export const prefetchAssets = async (
  deps,
  { reason = "manual-prefetch", reasonDetails } = {},
) => {
  await prefetchLayoutEditorAssets(deps, deps.props, {
    reason,
    reasonDetails,
  });
};

export const restartPreview = async (deps) => {
  await renderLayoutEditorCanvas(deps, deps.props, {
    clearFirst: true,
    updatedItem: deps.store.selectPendingUpdatedItem(),
    reason: "restart-preview",
  });
};

export const handleOnUpdate = async (deps, changes) => {
  const { oldProps = {}, newProps = {} } = changes;
  const didResolutionChange =
    oldProps.resolution?.width !== newProps.resolution?.width ||
    oldProps.resolution?.height !== newProps.resolution?.height;
  const didCanvasInputsChange =
    didResolutionChange ||
    oldProps.selectedItemId !== newProps.selectedItemId ||
    oldProps.previewData !== newProps.previewData ||
    oldProps.disableMoveDrag !== newProps.disableMoveDrag ||
    oldProps.disableInteraction !== newProps.disableInteraction ||
    !areCanvasLayoutStatesEquivalent(
      oldProps.layoutState,
      newProps.layoutState,
    );

  if (didResolutionChange) {
    await initCanvasGraphics(deps, newProps);
  }

  if (!deps.store.selectIsGraphicsReady()) {
    return;
  }

  if (
    deps.store.selectSelectedOccurrenceOwnerId() &&
    deps.store.selectSelectedOccurrenceOwnerId() !== newProps.selectedItemId
  ) {
    deps.store.clearSelectedOccurrence();
  }

  const pendingUpdatedItem = deps.store.selectPendingUpdatedItem();
  if (pendingUpdatedItem && newProps.selectedItemId !== pendingUpdatedItem.id) {
    deps.store.clearPendingUpdatedItem();
  }

  const nextSelectedItem = getSelectedItem(newProps);
  if (
    areCanvasItemsEquivalent(
      nextSelectedItem,
      deps.store.selectPendingUpdatedItem(),
    )
  ) {
    deps.store.clearPendingUpdatedItem();
  }

  if (!didCanvasInputsChange) {
    return;
  }

  const nextPendingUpdatedItem = deps.store.selectPendingUpdatedItem();
  await renderLayoutEditorCanvas(deps, newProps, {
    updatedItem: nextPendingUpdatedItem,
  });
};
