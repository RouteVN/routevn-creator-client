import { debounceTime, filter, fromEvent, tap } from "rxjs";
import {
  DEFAULT_PROJECT_RESOLUTION,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import {
  canResizeLayoutEditorItemHeight,
  canResizeLayoutEditorItemWidth,
} from "../../internal/layoutEditorElementRegistry.js";
import { captureCanvasThumbnailImage } from "../../internal/runtime/graphicsEngineRuntime.js";
import {
  createLayoutEditorRenderedElements,
  loadLayoutEditorAssets,
} from "./support/layoutEditorCanvasRender.js";

const KEYBOARD_SAVE_DELAY = 1000;

const KEYBOARD_UNITS = {
  NORMAL: 1,
  FAST: 10,
};
const MIN_RESIZE_DIMENSION = 1;
const RESIZE_TARGET_PREFIX = "selected-border-resize-";

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

const renderLayoutEditorCanvas = async (
  deps,
  props = deps.props,
  { clearFirst = false, updatedItem } = {},
) => {
  if (!deps.store.selectIsGraphicsReady()) {
    return;
  }

  try {
    await deps.graphicsService.waitUntilReady?.();
    const repositoryState = await getRepositoryState(deps);
    const layoutData = updatedItem
      ? createLayoutDataWithUpdatedItem(
          props.layoutState?.elements,
          updatedItem,
        )
      : props.layoutState?.elements;
    const layoutState = {
      id: props.layoutState?.id,
      layoutType: props.layoutState?.layoutType,
      elements: layoutData,
    };
    const { elements, fileReferences, selectedElementMetrics } =
      createLayoutEditorRenderedElements({
        layoutState,
        repositoryState,
        previewData: props.previewData,
        resolution: props.resolution,
        selectedItemId: props.selectedItemId,
        disableMoveDrag: props.disableMoveDrag === true,
        graphicsService: deps.graphicsService,
      });

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
        id: `layout-editor-preview-clear-${Date.now()}`,
        elements: [],
        animations: [],
      });
    }

    let assets = await loadLayoutEditorAssets({
      projectService: deps.projectService,
      selectCachedFileContent: deps.store.selectCachedFileContent,
      clearCachedFileContent: deps.store.clearCachedFileContent,
      cacheFileContent: deps.store.cacheFileContent,
      fileReferences,
      fontsItems: repositoryState?.fonts?.items || {},
    });
    try {
      await deps.graphicsService.loadAssets(assets);
    } catch {
      deps.store.clearFileContentCache();
      assets = await loadLayoutEditorAssets({
        projectService: deps.projectService,
        selectCachedFileContent: deps.store.selectCachedFileContent,
        clearCachedFileContent: deps.store.clearCachedFileContent,
        cacheFileContent: deps.store.cacheFileContent,
        fileReferences,
        fontsItems: repositoryState?.fonts?.items || {},
      });
      await deps.graphicsService.loadAssets(assets);
    }

    deps.graphicsService.render({
      elements,
      animations: [],
    });
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

const handleKeyboardMove = async (deps, event) => {
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
  await renderLayoutEditorCanvas(deps, deps.props, { updatedItem });
  dispatchCanvasItemEvent(deps, "drag-update", updatedItem);
  deps.subject.dispatch("layoutEditorCanvas.keyboardNavigationMoved", {
    itemId: currentItem.id,
  });
};

const handleBorderDragStart = (deps, payload = {}) => {
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
  await renderLayoutEditorCanvas(deps, deps.props, { updatedItem });
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
    cleanupSubscriptions?.();
    void deps.graphicsService.destroy();
  };
};

export const handleAfterMount = async (deps) => {
  await initCanvasGraphics(deps);
  await renderLayoutEditorCanvas(deps);
};

export const restartPreview = async (deps) => {
  await renderLayoutEditorCanvas(deps, deps.props, {
    clearFirst: true,
    updatedItem: deps.store.selectPendingUpdatedItem(),
  });
};

export const handleOnUpdate = async (deps, changes) => {
  const { oldProps = {}, newProps = {} } = changes;
  const didResolutionChange =
    oldProps.resolution?.width !== newProps.resolution?.width ||
    oldProps.resolution?.height !== newProps.resolution?.height;

  if (didResolutionChange) {
    await initCanvasGraphics(deps, newProps);
  }

  if (!deps.store.selectIsGraphicsReady()) {
    return;
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

  await renderLayoutEditorCanvas(deps, newProps, {
    updatedItem: deps.store.selectPendingUpdatedItem(),
  });
};
