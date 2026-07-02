import { fromEvent, merge, tap } from "rxjs";
import {
  SCENE_BOX_HEIGHT,
  SCENE_BOX_WIDTH,
} from "../../internal/whiteboard/constants.js";

const DEFAULT_ENSURE_VISIBLE_PAN_DURATION_MS = 160;
const MAX_ENSURE_VISIBLE_PAN_DURATION_MS = 320;
const MOUSE_ITEM_DRAG_THRESHOLD_PX = 3;
const TOUCH_ITEM_DRAG_THRESHOLD_PX = 6;
const TOUCH_ITEM_LONG_PRESS_MS = 500;
const TOUCH_DOUBLE_TAP_MS = 320;
const TOUCH_DOUBLE_TAP_DISTANCE_PX = 28;

const syncContainerSize = ({ store, refs } = {}) => {
  const container = refs?.container;
  if (!container) {
    return false;
  }

  const rect = container.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const currentSize = store.selectContainerSize();

  if (currentSize.width === width && currentSize.height === height) {
    return false;
  }

  store.setContainerSize({ width, height });
  return true;
};

const normalizeCursorValue = (cursor) => {
  if (!cursor) {
    return undefined;
  }

  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
    return cursor;
  }

  return CSS.supports("cursor", cursor) ? cursor : undefined;
};

const syncCursorStyles = ({ store, refs, props } = {}) => {
  const container = refs?.container;
  if (!container) {
    return;
  }

  const isPanMode = store.selectIsPanMode();
  const isPanning = store.selectIsPanning();
  const panCursor = isPanning ? "grabbing" : isPanMode ? "grab" : undefined;
  const overrideCursor = normalizeCursorValue(props?.cursor);
  const containerCursor = panCursor || overrideCursor || "default";
  const itemCursor = panCursor || overrideCursor || "move";

  container.style.cursor = containerCursor;

  Object.values(refs || {}).forEach((ref) => {
    if (!ref?.dataset?.itemId) {
      return;
    }

    ref.style.cursor = itemCursor;
    const firstChild = ref.firstElementChild;
    if (firstChild instanceof HTMLElement) {
      firstChild.style.cursor = itemCursor;
    }
  });
};

const renderWithCursorSync = (deps) => {
  deps.render();
  syncCursorStyles(deps);
};

const getAdaptiveGridSize = (zoomLevel) => {
  const canvasGridSize = 20;
  const visualGridSize = canvasGridSize * zoomLevel;
  const minVisualGridSize = 28;
  const gridMultiplier = Math.max(
    1,
    Math.ceil(minVisualGridSize / visualGridSize),
  );

  return canvasGridSize * gridMultiplier * zoomLevel;
};

const syncPanPresentation = ({ store, refs, props } = {}) => {
  const pan = store.selectPan();
  const zoomLevel = store.selectZoomLevel();

  if (refs?.container) {
    const gridSize = getAdaptiveGridSize(zoomLevel);
    refs.container.style.backgroundPosition = `${pan.x}px ${pan.y}px`;
    refs.container.style.backgroundSize = `${gridSize}px ${gridSize}px`;
  }

  if (refs?.canvas) {
    refs.canvas.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`;
  }

  if (refs?.minimapViewport && typeof store.selectMinimapData === "function") {
    const minimapData = store.selectMinimapData({
      items: props?.items || [],
      heightScale: props?.minimapHeightScale,
    });
    const viewport = minimapData?.viewport;
    const minimapItemRefs =
      refs.minimapContainer?.querySelectorAll?.("[data-minimap-item]") || [];

    (minimapData?.items || []).forEach((item, itemIndex) => {
      const itemRef = minimapItemRefs[itemIndex];
      if (!itemRef) {
        return;
      }

      itemRef.style.left = `${item.x}px`;
      itemRef.style.top = `${item.y}px`;

      const marker = itemRef.firstElementChild;
      if (marker?.style) {
        marker.style.width = `${minimapData.scaledItem.width}px`;
        marker.style.height = `${minimapData.scaledItem.height}px`;
      }
    });

    if (!viewport?.visible) {
      refs.minimapViewport.style.display = "none";
      return;
    }

    refs.minimapViewport.style.display = "";
    refs.minimapViewport.style.left = `${viewport.x}px`;
    refs.minimapViewport.style.top = `${viewport.y}px`;
    refs.minimapViewport.style.width = `${viewport.width}px`;
    refs.minimapViewport.style.height = `${viewport.height}px`;
  }
};

const getPointerPositionWithinElement = (event, element) => {
  if (!element) {
    return {
      x: 0,
      y: 0,
    };
  }

  const rect = element.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
};

const preventTouchDefault = (event) => {
  if (event && event.cancelable !== false) {
    event.preventDefault();
  }
};

const getTouchPointWithinElement = (touch, element) => {
  if (!touch || !element) {
    return undefined;
  }

  const rect = element.getBoundingClientRect();
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top,
  };
};

const getPrimaryTouchPoint = (event, element) => {
  return getTouchPointWithinElement(event?.touches?.[0], element);
};

const getTouchClientPoint = (event) => {
  const touch = event?.touches?.[0];
  if (!touch) {
    return undefined;
  }

  return {
    clientX: touch.clientX,
    clientY: touch.clientY,
  };
};

const getTouchPairMetrics = (event, element) => {
  const firstPoint = getTouchPointWithinElement(event?.touches?.[0], element);
  const secondPoint = getTouchPointWithinElement(event?.touches?.[1], element);

  if (!firstPoint || !secondPoint) {
    return undefined;
  }

  const deltaX = secondPoint.x - firstPoint.x;
  const deltaY = secondPoint.y - firstPoint.y;
  const distance = Math.hypot(deltaX, deltaY);

  return {
    centerX: (firstPoint.x + secondPoint.x) / 2,
    centerY: (firstPoint.y + secondPoint.y) / 2,
    distance,
  };
};

const getGesturePointWithinElement = (event, element) => {
  if (!element) {
    return undefined;
  }

  const rect = element.getBoundingClientRect();
  const clientX = Number(event?.clientX);
  const clientY = Number(event?.clientY);

  if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  return {
    x: rect.width / 2,
    y: rect.height / 2,
  };
};

const getActiveElement = (root = document) => {
  let active = root?.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
};

const isTextEntryFocused = () => {
  const active = getActiveElement(document);
  if (!active) {
    return false;
  }

  if (active instanceof HTMLElement && active.isContentEditable) {
    return true;
  }

  const tagName = active.tagName;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(tagName);
};

const isSpaceKey = (event) => {
  const key = String(event?.key || "");
  const code = String(event?.code || "");
  return code === "Space" || key === " " || key === "Spacebar";
};

const isPrimaryMouseButton = (event) => {
  return event?.button === 0 && !event?.ctrlKey;
};

const getItemIdFromElement = (element) => {
  return element?.dataset?.itemId || "";
};

const getItemElementByIdFromRefs = (refs, itemId) => {
  if (!itemId) {
    return undefined;
  }

  return Object.values(refs || {}).find(
    (candidate) => candidate?.dataset?.itemId === itemId,
  );
};

const getItemElementFromEventTarget = (event, container) => {
  const path =
    typeof event?.composedPath === "function" ? event.composedPath() : [];
  const pathItemElement = path.find((candidate) => candidate?.dataset?.itemId);

  if (
    pathItemElement &&
    (typeof container?.contains !== "function" ||
      container.contains(pathItemElement))
  ) {
    return pathItemElement;
  }

  const target = event?.target;
  const targetElement =
    typeof target?.closest === "function" ? target : target?.parentElement;
  const itemElement = targetElement?.closest?.("[data-item-id]");

  if (!itemElement) {
    return undefined;
  }

  if (
    typeof container?.contains === "function" &&
    !container.contains(itemElement)
  ) {
    return undefined;
  }

  return itemElement;
};

const dispatchItemSelected = ({ dispatchEvent } = {}, { itemId } = {}) => {
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("item-selected", {
      detail: { itemId },
    }),
  );
};

const dispatchItemDoubleClick = ({ dispatchEvent } = {}, { itemId } = {}) => {
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("item-double-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

const dispatchItemContextMenu = (
  { dispatchEvent } = {},
  { itemId, clientX, clientY } = {},
) => {
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("item-context-menu", {
      detail: {
        itemId,
        x: clientX,
        y: clientY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const getCanvasPointerPosition = (
  { store, refs } = {},
  { clientX, clientY } = {},
) => {
  const canvas = refs?.canvas;
  const nextClientX = Number(clientX);
  const nextClientY = Number(clientY);

  if (
    !canvas ||
    !Number.isFinite(nextClientX) ||
    !Number.isFinite(nextClientY)
  ) {
    return undefined;
  }

  const canvasRect = canvas.getBoundingClientRect();
  const zoomLevel = store.selectZoomLevel();
  const pan = store.selectPan();

  return {
    x: (nextClientX - canvasRect.left - pan.x) / zoomLevel,
    y: (nextClientY - canvasRect.top - pan.y) / zoomLevel,
  };
};

const parseItemStylePosition = (position) => {
  const numericPosition = parseInt(position ?? "", 10);
  return Number.isFinite(numericPosition) ? numericPosition : 0;
};

const startItemDrag = (
  deps,
  {
    itemElement,
    itemId,
    clientX,
    clientY,
    shouldDispatchSelection = true,
  } = {},
) => {
  const { store, dispatchEvent } = deps;
  if (!itemElement || !itemId) {
    return false;
  }

  const pointerPosition = getCanvasPointerPosition(deps, {
    clientX,
    clientY,
  });
  if (!pointerPosition) {
    return false;
  }

  const itemX = parseItemStylePosition(itemElement.style.left);
  const itemY = parseItemStylePosition(itemElement.style.top);

  store.setDragOffset({
    x: pointerPosition.x - itemX,
    y: pointerPosition.y - itemY,
  });

  store.startDragging({ itemId });
  store.setLastDraggedPosition({
    itemId,
    x: itemX,
    y: itemY,
  });

  if (shouldDispatchSelection) {
    dispatchItemSelected({ dispatchEvent }, { itemId });
  }

  return true;
};

const clearTouchLongPressTimeout = ({ store } = {}) => {
  const gesture = store?.selectTouchGesture?.();
  const timeoutId = gesture?.longPressTimeoutId;
  if (
    timeoutId !== undefined &&
    typeof globalThis.clearTimeout === "function"
  ) {
    globalThis.clearTimeout(timeoutId);
  }
  store?.clearTouchLongPressTimeoutId?.();
};

const stopTouchGesture = (deps) => {
  clearTouchLongPressTimeout(deps);
  deps.store.stopTouchGesture();
};

const resolveEventTimestamp = (event) => {
  const timestamp = Number(event?.timeStamp);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
};

const isTouchDoubleTap = (
  previousTap,
  { itemId, clientX, clientY, timestamp } = {},
) => {
  if (!previousTap || previousTap.itemId !== itemId) {
    return false;
  }

  const elapsedMs = timestamp - previousTap.timestamp;
  const distance = Math.hypot(
    clientX - previousTap.clientX,
    clientY - previousTap.clientY,
  );

  return (
    elapsedMs >= 0 &&
    elapsedMs <= TOUCH_DOUBLE_TAP_MS &&
    distance <= TOUCH_DOUBLE_TAP_DISTANCE_PX
  );
};

const completeTouchItemTap = (deps, { gesture, event } = {}) => {
  const { store, dispatchEvent } = deps;
  if (
    gesture?.type !== "item-press" ||
    gesture.hasMoved ||
    gesture.longPressFired
  ) {
    store.clearLastTouchTap();
    return;
  }

  const tap = {
    itemId: gesture.itemId,
    clientX: gesture.startClientX,
    clientY: gesture.startClientY,
    timestamp: resolveEventTimestamp(event),
  };

  if (isTouchDoubleTap(store.selectLastTouchTap(), tap)) {
    store.clearLastTouchTap();
    dispatchItemDoubleClick({ dispatchEvent }, { itemId: gesture.itemId });
    return;
  }

  store.setLastTouchTap(tap);
};

const startTouchItemPress = (
  deps,
  { itemElement, itemId, clientX, clientY } = {},
) => {
  const { store, dispatchEvent } = deps;
  if (!itemElement || !itemId) {
    return false;
  }

  const timeoutId =
    typeof globalThis.setTimeout === "function"
      ? globalThis.setTimeout(() => {
          const gesture = store.selectTouchGesture();
          if (
            gesture?.type !== "item-press" ||
            gesture.itemId !== itemId ||
            gesture.hasMoved ||
            gesture.longPressFired
          ) {
            return;
          }

          store.markTouchItemLongPressed();
          store.clearLastTouchTap();
          dispatchItemContextMenu(
            { dispatchEvent },
            {
              itemId,
              clientX,
              clientY,
            },
          );
        }, TOUCH_ITEM_LONG_PRESS_MS)
      : undefined;

  store.startTouchItemPress({
    itemId,
    startClientX: clientX,
    startClientY: clientY,
    longPressTimeoutId: timeoutId,
  });
  dispatchItemSelected({ dispatchEvent }, { itemId });
  return true;
};

const startItemDragFromTouchPress = (deps, { clientX, clientY } = {}) => {
  const { store, refs } = deps;
  const gesture = store.selectTouchGesture();
  if (gesture?.type !== "item-press" || gesture.longPressFired) {
    return false;
  }

  const itemElement = getItemElementByIdFromRefs(refs, gesture.itemId);
  clearTouchLongPressTimeout(deps);
  store.clearLastTouchTap();
  const didStartDrag = startItemDrag(deps, {
    itemElement,
    itemId: gesture.itemId,
    clientX: gesture.startClientX,
    clientY: gesture.startClientY,
    shouldDispatchSelection: false,
  });

  if (didStartDrag) {
    store.stopTouchGesture();
    updateItemDrag(deps, { clientX, clientY });
    return true;
  }

  store.stopTouchGesture();
  return false;
};

const startItemDragFromMousePress = (deps, { clientX, clientY } = {}) => {
  const { store, refs } = deps;
  const press = store.selectMouseItemPress();
  if (press?.type !== "item-press") {
    return false;
  }

  const itemElement = getItemElementByIdFromRefs(refs, press.itemId);
  store.clearMouseItemPress();

  const didStartDrag = startItemDrag(deps, {
    itemElement,
    itemId: press.itemId,
    clientX: press.startClientX,
    clientY: press.startClientY,
    shouldDispatchSelection: false,
  });

  if (didStartDrag) {
    updateItemDrag(deps, { clientX, clientY });
    return true;
  }

  return false;
};

const updateItemDrag = (deps, { clientX, clientY } = {}) => {
  const { store, refs, dispatchEvent } = deps;
  const pointerPosition = getCanvasPointerPosition(deps, {
    clientX,
    clientY,
  });
  if (!pointerPosition) {
    return false;
  }

  const dragItemId = store.selectDragItemId();
  const zoomLevel = store.selectZoomLevel();
  const dragOffset = store.selectDragOffset();
  const newX = pointerPosition.x - dragOffset.x;
  const newY = pointerPosition.y - dragOffset.y;

  const container = refs.container;
  const containerRect = container.getBoundingClientRect();
  const panState = store.selectPan();

  const viewportLeft = -panState.x / zoomLevel;
  const viewportTop = -panState.y / zoomLevel;
  const viewportRight = viewportLeft + containerRect.width / zoomLevel;
  const viewportBottom = viewportTop + containerRect.height / zoomLevel;

  const itemWidth = SCENE_BOX_WIDTH;
  const itemHeight = SCENE_BOX_HEIGHT;

  const maxX = viewportRight - itemWidth;
  const maxY = viewportBottom - itemHeight;

  const constrainedX = Math.max(viewportLeft, Math.min(newX, maxX));
  const constrainedY = Math.max(viewportTop, Math.min(newY, maxY));

  const snappedX = Math.round(constrainedX / 5) * 5;
  const snappedY = Math.round(constrainedY / 5) * 5;
  store.setLastDraggedPosition({
    itemId: dragItemId,
    x: snappedX,
    y: snappedY,
  });

  dispatchEvent(
    new CustomEvent("item-position-updating", {
      detail: {
        itemId: dragItemId,
        x: snappedX,
        y: snappedY,
      },
    }),
  );

  return true;
};

const finishItemDrag = (deps) => {
  const { store, refs, dispatchEvent } = deps;
  const dragItemId = store.selectDragItemId();
  const itemElement = Object.values(refs || {}).find(
    (candidate) => candidate?.dataset?.itemId === dragItemId,
  );

  const lastDraggedPosition = store.selectLastDraggedPosition();
  let finalX = lastDraggedPosition?.x;
  let finalY = lastDraggedPosition?.y;

  if (!Number.isFinite(finalX) || !Number.isFinite(finalY)) {
    finalX = parseInt(itemElement?.style?.left || "", 10);
    finalY = parseInt(itemElement?.style?.top || "", 10);
  }

  if (Number.isFinite(finalX) && Number.isFinite(finalY)) {
    dispatchEvent(
      new CustomEvent("item-position-changed", {
        detail: {
          itemId: dragItemId,
          x: finalX,
          y: finalY,
        },
      }),
    );
  } else {
    console.error("[whiteboard] failed to resolve final dragged position", {
      itemId: dragItemId,
      finalX,
      finalY,
    });
  }

  store.stopDragging();
  store.clearLastDraggedPosition();
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const easeOutCubic = (progress) => 1 - (1 - progress) ** 3;

const normalizePanDuration = (durationMs) => {
  const numericDuration = Number(durationMs);
  if (!Number.isFinite(numericDuration)) {
    return DEFAULT_ENSURE_VISIBLE_PAN_DURATION_MS;
  }

  return clamp(numericDuration, 0, MAX_ENSURE_VISIBLE_PAN_DURATION_MS);
};

const cancelPanAnimation = ({ store } = {}) => {
  const frameId = store?.selectPanAnimationFrameId?.();
  if (
    frameId !== undefined &&
    typeof globalThis.cancelAnimationFrame === "function"
  ) {
    globalThis.cancelAnimationFrame(frameId);
  }

  store?.clearPanAnimationFrameId?.();
};

const dispatchPanChanged = ({ store, dispatchEvent } = {}) => {
  const pan = store.selectPan();

  dispatchEvent(
    new CustomEvent("pan-changed", {
      detail: { panX: pan.x, panY: pan.y },
      bubbles: true,
      composed: true,
    }),
  );
};

const dispatchZoomChanged = ({ store, dispatchEvent } = {}) => {
  dispatchEvent(
    new CustomEvent("zoom-changed", {
      detail: { zoomLevel: store.selectZoomLevel() },
      bubbles: true,
      composed: true,
    }),
  );
};

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);
  return () => {
    cancelPanAnimation(deps);
    cleanupSubscriptions();
  };
};

export const handleAfterMount = (deps) => {
  const didUpdateSize = syncContainerSize(deps);

  if (didUpdateSize) {
    deps.render();
  }

  syncCursorStyles(deps);
};

export const handleContainerContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  const { store, refs, dispatchEvent } = deps;

  // Calculate click position in canvas coordinates
  const container = refs.container;
  const containerRect = container.getBoundingClientRect();
  const pan = store.selectPan();
  const zoomLevel = store.selectZoomLevel();

  const canvasX =
    (payload._event.clientX - containerRect.left - pan.x) / zoomLevel;
  const canvasY =
    (payload._event.clientY - containerRect.top - pan.y) / zoomLevel;

  // Emit canvas right-click event
  dispatchEvent(
    new CustomEvent("canvas-context-menu", {
      detail: {
        formX: payload._event.clientX,
        formY: payload._event.clientY,
        whiteboardX: canvasX,
        whiteboardY: canvasY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handlePanButtonClick = (deps) => {
  const { store } = deps;
  const isPanMode = store.selectIsPinnedPanMode();
  store.setPinnedPanMode({ isPanMode: !isPanMode });
  renderWithCursorSync(deps);
};

export const handleContainerMouseDown = (deps, payload) => {
  const { store, refs } = deps;
  const { _event: event } = payload;

  if (!isPrimaryMouseButton(event)) {
    return;
  }

  cancelPanAnimation(deps);

  if (store.selectIsPanMode()) {
    // Start panning
    store.startPanning({
      mouseX: event.clientX,
      mouseY: event.clientY,
    });
    syncCursorStyles(deps);
  } else {
    // Calculate click position in canvas coordinates using container coordinates
    const container = refs.container;
    const containerRect = container.getBoundingClientRect();
    const pan = store.selectPan();
    const zoomLevel = store.selectZoomLevel();

    // Use container coordinates instead of canvas coordinates for proper zoom calculation
    const canvasX = (event.clientX - containerRect.left - pan.x) / zoomLevel;
    const canvasY = (event.clientY - containerRect.top - pan.y) / zoomLevel;

    // Emit click event with coordinates
    deps.dispatchEvent(
      new CustomEvent("canvas-click", {
        detail: {
          formX: event.clientX,
          formY: event.clientY,
          whiteboardX: canvasX,
          whiteboardY: canvasY,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
};

export const handleContainerWheel = (deps, payload) => {
  const { _event: event } = payload;
  const { store, refs, dispatchEvent } = deps;

  if (store.selectIsDraggingMinimapViewport()) {
    event.preventDefault();
    return;
  }

  cancelPanAnimation(deps);

  // Calculate mouse position relative to container
  const container = refs.container;
  const rect = container.getBoundingClientRect();
  const mouseX = payload._event.clientX - rect.left;
  const mouseY = payload._event.clientY - rect.top;

  // Determine zoom direction and scale factor
  const zoomIntensity = 0.1;
  const scaleFactor = event.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;

  event.preventDefault();
  store.zoomAt({ mouseX, mouseY, scaleFactor });
  syncContainerSize(deps);
  renderWithCursorSync(deps);

  dispatchZoomChanged({ store, dispatchEvent });
  dispatchPanChanged({ store, dispatchEvent });
};

export const handleContainerTouchStart = (deps, payload) => {
  const { store, refs } = deps;
  const { _event: event } = payload;
  const touchCount = event?.touches?.length ?? 0;

  if (touchCount === 0) {
    return;
  }

  cancelPanAnimation(deps);
  syncContainerSize(deps);

  if (touchCount >= 2) {
    clearTouchLongPressTimeout(deps);
    store.clearLastTouchTap();
    preventTouchDefault(event);
    event.stopPropagation();

    const metrics = getTouchPairMetrics(event, refs.container);
    if (!metrics) {
      return;
    }

    store.startTouchPinch(metrics);
    return;
  }

  const point = getPrimaryTouchPoint(event, refs.container);
  if (!point) {
    return;
  }

  const itemElement = getItemElementFromEventTarget(event, refs.container);
  const itemId = getItemIdFromElement(itemElement);
  if (itemId && !store.selectIsPanMode()) {
    const touchClientPoint = getTouchClientPoint(event);
    preventTouchDefault(event);
    event.stopPropagation();
    startTouchItemPress(deps, {
      itemElement,
      itemId,
      clientX: touchClientPoint?.clientX,
      clientY: touchClientPoint?.clientY,
    });
    return;
  }

  store.clearLastTouchTap();
  store.startTouchPan({
    touchX: point.x,
    touchY: point.y,
  });
};

export const handleContainerTouchMove = (deps, payload) => {
  const { store, refs, dispatchEvent } = deps;
  const { _event: event } = payload;
  const touchCount = event?.touches?.length ?? 0;

  if (touchCount === 0) {
    return;
  }

  preventTouchDefault(event);
  event.stopPropagation();
  syncContainerSize(deps);

  if (store.selectIsDragging()) {
    const touchClientPoint = getTouchClientPoint(event);
    updateItemDrag(deps, {
      clientX: touchClientPoint?.clientX,
      clientY: touchClientPoint?.clientY,
    });
    return;
  }

  const gesture = store.selectTouchGesture();
  if (gesture?.type === "item-press") {
    preventTouchDefault(event);
    event.stopPropagation();

    if (gesture.longPressFired) {
      return;
    }

    const touchClientPoint = getTouchClientPoint(event);
    if (!touchClientPoint) {
      return;
    }

    if (touchCount >= 2) {
      clearTouchLongPressTimeout(deps);
      const metrics = getTouchPairMetrics(event, refs.container);
      if (metrics) {
        store.startTouchPinch(metrics);
      }
      return;
    }

    store.updateTouchItemPress({
      clientX: touchClientPoint.clientX,
      clientY: touchClientPoint.clientY,
      moveThreshold: TOUCH_ITEM_DRAG_THRESHOLD_PX,
    });

    if (store.selectTouchGesture()?.hasMoved) {
      startItemDragFromTouchPress(deps, touchClientPoint);
    }
    return;
  }

  if (touchCount >= 2) {
    const metrics = getTouchPairMetrics(event, refs.container);
    if (!metrics) {
      return;
    }

    if (store.selectTouchGesture()?.type !== "pinch") {
      store.startTouchPinch(metrics);
    }

    store.updateTouchPinch(metrics);
    syncPanPresentation(deps);
    dispatchZoomChanged({ store, dispatchEvent });
    dispatchPanChanged({ store, dispatchEvent });
    return;
  }

  const point = getPrimaryTouchPoint(event, refs.container);
  if (!point) {
    return;
  }

  if (store.selectTouchGesture()?.type !== "pan") {
    store.startTouchPan({
      touchX: point.x,
      touchY: point.y,
    });
  }

  store.updateTouchPan({
    touchX: point.x,
    touchY: point.y,
  });
  syncPanPresentation(deps);
  dispatchPanChanged({ store, dispatchEvent });
};

export const handleContainerTouchEnd = (deps, payload) => {
  const { store, refs } = deps;
  const { _event: event } = payload;
  const touchCount = event?.touches?.length ?? 0;
  const gesture = store.selectTouchGesture();

  if (store.selectIsDragging()) {
    preventTouchDefault(event);
    event.stopPropagation();

    if (touchCount === 0) {
      finishItemDrag(deps);
    }
    return;
  }

  if (gesture?.type === "item-press") {
    preventTouchDefault(event);
    event.stopPropagation();

    if (touchCount === 0) {
      completeTouchItemTap(deps, { gesture, event });
      stopTouchGesture(deps);
    }
    return;
  }

  if (gesture?.hasMoved || gesture?.type === "pinch") {
    preventTouchDefault(event);
  }

  if (touchCount >= 2) {
    const metrics = getTouchPairMetrics(event, refs.container);
    if (metrics) {
      store.startTouchPinch(metrics);
    }
    return;
  }

  if (touchCount === 1) {
    const point = getPrimaryTouchPoint(event, refs.container);
    if (point) {
      store.startTouchPan({
        touchX: point.x,
        touchY: point.y,
      });
    }
    return;
  }

  stopTouchGesture(deps);
};

export const handleContainerTouchCancel = (deps, payload) => {
  preventTouchDefault(payload?._event);
  deps.store.clearLastTouchTap();
  if (deps.store.selectIsDragging()) {
    deps.store.stopDragging();
    deps.store.clearLastDraggedPosition();
  }
  stopTouchGesture(deps);
};

export const handleContainerGestureEvent = (deps, payload) => {
  const { store, refs, dispatchEvent } = deps;
  const event = payload?._event;

  preventTouchDefault(event);
  event?.stopPropagation?.();

  if (store.selectIsDraggingMinimapViewport()) {
    return;
  }

  const point = getGesturePointWithinElement(event, refs.container);
  if (!point) {
    return;
  }

  if (event?.type === "gesturestart") {
    cancelPanAnimation(deps);
    syncContainerSize(deps);
    store.startTrackpadPinch({
      centerX: point.x,
      centerY: point.y,
    });
    return;
  }

  if (event?.type === "gesturechange") {
    cancelPanAnimation(deps);
    syncContainerSize(deps);

    if (!store.selectTrackpadPinchGesture?.()) {
      store.startTrackpadPinch({
        centerX: point.x,
        centerY: point.y,
      });
    }

    store.updateTrackpadPinch({
      centerX: point.x,
      centerY: point.y,
      scale: event.scale,
    });
    renderWithCursorSync(deps);
    dispatchZoomChanged({ store, dispatchEvent });
    dispatchPanChanged({ store, dispatchEvent });
    return;
  }

  if (event?.type === "gestureend") {
    store.stopTrackpadPinch();
  }
};

export const handleZoomInClick = (deps) => {
  const { store, refs, dispatchEvent } = deps;

  if (store.selectIsDraggingMinimapViewport()) {
    return;
  }

  cancelPanAnimation(deps);

  const container = refs.container;
  const rect = container.getBoundingClientRect();

  store.zoomFromCenter({
    direction: 1,
    containerWidth: rect.width,
    containerHeight: rect.height,
  });

  syncContainerSize(deps);
  renderWithCursorSync(deps);

  dispatchZoomChanged({ store, dispatchEvent });
  dispatchPanChanged({ store, dispatchEvent });
};

export const handleZoomOutClick = (deps) => {
  const { store, refs, dispatchEvent } = deps;

  if (store.selectIsDraggingMinimapViewport()) {
    return;
  }

  cancelPanAnimation(deps);

  const container = refs.container;
  const rect = container.getBoundingClientRect();

  store.zoomFromCenter({
    direction: -1,
    containerWidth: rect.width,
    containerHeight: rect.height,
  });

  syncContainerSize(deps);
  renderWithCursorSync(deps);

  dispatchZoomChanged({ store, dispatchEvent });
  dispatchPanChanged({ store, dispatchEvent });
};

export const handleMinimapViewportMouseDown = (deps, payload) => {
  const { store, refs } = deps;
  const { _event: event } = payload;

  if (!isPrimaryMouseButton(event)) {
    return;
  }

  cancelPanAnimation(deps);

  const minimapContainer = refs.minimapContainer;
  if (!minimapContainer) {
    return;
  }

  const minimapData = store.selectMinimapData({
    items: deps.props?.items || [],
    heightScale: deps.props?.minimapHeightScale,
  });
  if (!minimapData?.viewport?.visible) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const { x: mouseX, y: mouseY } = getPointerPositionWithinElement(
    event,
    minimapContainer,
  );

  store.startMinimapViewportDragging({
    mouseX,
    mouseY,
    minimapData,
  });
  renderWithCursorSync(deps);
};

export const handleItemMouseDown = (deps, payload) => {
  const { store, dispatchEvent } = deps;
  const { _event: event } = payload;

  if (!isPrimaryMouseButton(event)) {
    return;
  }

  cancelPanAnimation(deps);

  if (store.selectIsPanMode()) {
    // Let the event bubble to the container so Space-pan can start viewport drag.
    return;
  }

  event.stopPropagation();

  const itemId =
    event.currentTarget?.dataset?.itemId ||
    event.currentTarget?.id?.replace("item", "");

  store.startMouseItemPress({
    itemId,
    startClientX: event.clientX,
    startClientY: event.clientY,
  });
  dispatchItemSelected({ dispatchEvent }, { itemId });
};

export const handleItemDoubleClick = (deps, payload) => {
  payload._event.stopPropagation();

  const itemElement =
    getItemElementFromEventTarget(payload._event, deps.refs?.container) ??
    payload._event.currentTarget;
  const itemId = getItemIdFromElement(itemElement);

  if (!itemId) {
    console.error("ERROR: No itemId found for double-click");
    return;
  }

  dispatchItemDoubleClick(deps, { itemId });
};

export const handleItemContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  payload._event.stopPropagation();

  const { dispatchEvent } = deps;
  const itemId =
    payload._event.currentTarget?.dataset?.itemId ||
    payload._event.currentTarget?.id?.replace("item", "") ||
    "";

  if (!itemId) {
    console.error("ERROR: No itemId found for context menu");
    return;
  }

  // Dispatch context menu event to parent
  dispatchEvent(
    new CustomEvent("item-context-menu", {
      detail: {
        itemId,
        x: payload._event.clientX,
        y: payload._event.clientY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleItemMouseEnter = (deps, payload) => {
  const { store } = deps;
  const itemId =
    payload._event.currentTarget?.dataset?.itemId ||
    payload._event.currentTarget?.id?.replace("item", "") ||
    "";
  if (!itemId) {
    return;
  }

  store.setHoveredItemId({ itemId });
  renderWithCursorSync(deps);
};

export const handleItemMouseLeave = (deps) => {
  const { store } = deps;
  store.setHoveredItemId({ itemId: undefined });
  renderWithCursorSync(deps);
};

export const handleWindowMouseMove = (deps, payload) => {
  const { store, refs, dispatchEvent } = deps;

  if (store.selectIsDraggingMinimapViewport()) {
    const minimapContainer = refs.minimapContainer;
    if (!minimapContainer) {
      store.stopMinimapViewportDragging();
      renderWithCursorSync(deps);
      return;
    }

    const { x: mouseX, y: mouseY } = getPointerPositionWithinElement(
      payload._event,
      minimapContainer,
    );

    store.updatePanFromMinimapViewportDragging({
      mouseX,
      mouseY,
    });
    syncPanPresentation(deps);
  } else if (store.selectIsPanning()) {
    // Handle panning
    store.updatePan({
      mouseX: payload._event.clientX,
      mouseY: payload._event.clientY,
    });

    // Dispatch pan changed event
    dispatchPanChanged({ store, dispatchEvent });

    syncPanPresentation(deps);
  } else if (store.selectIsDragging()) {
    updateItemDrag(deps, {
      clientX: payload._event.clientX,
      clientY: payload._event.clientY,
    });
  } else if (store.selectMouseItemPress()?.type === "item-press") {
    store.updateMouseItemPress({
      clientX: payload._event.clientX,
      clientY: payload._event.clientY,
      moveThreshold: MOUSE_ITEM_DRAG_THRESHOLD_PX,
    });

    if (store.selectMouseItemPress()?.hasMoved) {
      startItemDragFromMousePress(deps, {
        clientX: payload._event.clientX,
        clientY: payload._event.clientY,
      });
    }
  } else if (syncContainerSize(deps)) {
    renderWithCursorSync(deps);
  }
};

export const handleWindowMouseUp = (deps) => {
  const { store, dispatchEvent } = deps;

  if (store.selectIsDraggingMinimapViewport()) {
    store.stopMinimapViewportDragging();
    dispatchPanChanged({ store, dispatchEvent });
    renderWithCursorSync(deps);
    return;
  }

  if (store.selectIsPanning()) {
    store.stopPanning();
    renderWithCursorSync(deps);
  } else if (store.selectIsDragging()) {
    finishItemDrag(deps);
  } else if (store.selectMouseItemPress()?.type === "item-press") {
    store.clearMouseItemPress();
  }

  syncCursorStyles(deps);
};

// Keyboard event handlers
export const handleWindowKeyDown = (deps, payload) => {
  const { store } = deps;
  const isTextFocused = isTextEntryFocused();

  if (isTextFocused) {
    return;
  }

  if (isSpaceKey(payload._event) && !store.selectIsKeyboardPanMode()) {
    payload._event.preventDefault();
    store.setKeyboardPanMode({ isPanMode: true });
    renderWithCursorSync(deps);
  }
};

export const handleWindowKeyUp = (deps, payload) => {
  const { store } = deps;
  const isTextFocused = isTextEntryFocused();

  if (isTextFocused && !store.selectIsKeyboardPanMode()) {
    return;
  }

  if (isSpaceKey(payload._event) && store.selectIsKeyboardPanMode()) {
    payload._event.preventDefault();
    store.setKeyboardPanMode({ isPanMode: false });
    if (store.selectIsPanning()) {
      store.stopPanning();
    }
    renderWithCursorSync(deps);
  }
};

export const handleWindowBlur = (deps) => {
  const { store } = deps;
  let didChange = false;

  if (store.selectIsKeyboardPanMode()) {
    store.setKeyboardPanMode({ isPanMode: false });
    didChange = true;
  }

  if (store.selectIsPanning()) {
    store.stopPanning();
    didChange = true;
  }

  if (store.selectIsDraggingMinimapViewport()) {
    store.stopMinimapViewportDragging();
    didChange = true;
  }

  if (store.selectTouchGesture()) {
    clearTouchLongPressTimeout(deps);
    store.stopTouchGesture();
    didChange = true;
  }

  if (store.selectTrackpadPinchGesture?.()) {
    store.stopTrackpadPinch?.();
    didChange = true;
  }

  if (store.selectIsDragging()) {
    store.stopDragging();
    store.clearLastDraggedPosition();
    didChange = true;
  }

  if (didChange) {
    renderWithCursorSync(deps);
  }
};

const subscriptions = (deps) => {
  const windowKeyDown$ = fromEvent(window, "keydown");
  const documentKeyDown$ = fromEvent(document, "keydown", {
    capture: true,
  });
  const windowKeyUp$ = fromEvent(window, "keyup");
  const documentKeyUp$ = fromEvent(document, "keyup", {
    capture: true,
  });

  return [
    fromEvent(window, "resize").pipe(
      tap((event) => deps.handlers.handleWindowResize(deps, { _event: event })),
    ),
    fromEvent(window, "mousemove").pipe(
      tap((event) =>
        deps.handlers.handleWindowMouseMove(deps, { _event: event }),
      ),
    ),
    fromEvent(window, "mouseup").pipe(
      tap((event) =>
        deps.handlers.handleWindowMouseUp(deps, { _event: event }),
      ),
    ),
    merge(windowKeyDown$, documentKeyDown$).pipe(
      tap((event) =>
        deps.handlers.handleWindowKeyDown(deps, { _event: event }),
      ),
    ),
    merge(windowKeyUp$, documentKeyUp$).pipe(
      tap((event) => deps.handlers.handleWindowKeyUp(deps, { _event: event })),
    ),
    fromEvent(window, "blur").pipe(
      tap((event) => deps.handlers.handleWindowBlur(deps, { _event: event })),
    ),
  ];
};

export const handleInitialZoomAndPanSetup = (deps, payload) => {
  const { store } = deps;
  const { zoomLevel, panX, panY } = payload;

  store.setInitialZoomAndPan({ zoomLevel, panX, panY });
  syncContainerSize(deps);
};

export const handleWindowResize = (deps) => {
  if (syncContainerSize(deps)) {
    renderWithCursorSync(deps);
  }
};

export const handleEnsureItemVisible = (deps, payload) => {
  const { store, refs, props, dispatchEvent } = deps;
  const detail = payload?._event?.detail || {};
  const itemId = detail.itemId;
  if (!itemId || !refs.container) {
    return;
  }

  cancelPanAnimation(deps);
  syncContainerSize(deps);

  const item = (props.items || []).find((candidate) => candidate.id === itemId);
  if (!item) {
    return;
  }

  const rect = refs.container.getBoundingClientRect();
  const zoomLevel = store.selectZoomLevel();
  const pan = store.selectPan();
  const padding = 20;
  const itemLeft = item.x * zoomLevel + pan.x;
  const itemTop = item.y * zoomLevel + pan.y;
  const itemRight = (item.x + SCENE_BOX_WIDTH) * zoomLevel + pan.x;
  const itemBottom = (item.y + SCENE_BOX_HEIGHT) * zoomLevel + pan.y;
  const minX = padding;
  const minY = padding;
  const maxX = rect.width - padding;
  const maxY = rect.height - padding;

  const isVisible =
    itemLeft >= minX &&
    itemRight <= maxX &&
    itemTop >= minY &&
    itemBottom <= maxY;
  if (isVisible) {
    return;
  }

  const nextPanX = rect.width / 2 - (item.x + SCENE_BOX_WIDTH / 2) * zoomLevel;
  const nextPanY =
    rect.height / 2 - (item.y + SCENE_BOX_HEIGHT / 2) * zoomLevel;

  if (nextPanX === pan.x && nextPanY === pan.y) {
    return;
  }

  if (detail.behavior === "smooth") {
    const durationMs = normalizePanDuration(detail.durationMs);

    if (
      durationMs > 0 &&
      typeof globalThis.requestAnimationFrame === "function"
    ) {
      let startedAt;
      const step = (timestamp) => {
        const timestampMs = Number(timestamp);
        const currentTime = Number.isFinite(timestampMs)
          ? timestampMs
          : (globalThis.performance?.now?.() ?? Date.now());

        if (startedAt === undefined) {
          startedAt = currentTime;
        }

        const progress = clamp((currentTime - startedAt) / durationMs, 0, 1);
        const easedProgress = easeOutCubic(progress);
        const panX = pan.x + (nextPanX - pan.x) * easedProgress;
        const panY = pan.y + (nextPanY - pan.y) * easedProgress;

        store.setPan({ panX, panY });
        syncPanPresentation(deps);

        if (progress < 1) {
          const frameId = globalThis.requestAnimationFrame(step);
          store.setPanAnimationFrameId?.({ frameId });
          return;
        }

        store.clearPanAnimationFrameId?.();
        dispatchPanChanged({ store, dispatchEvent });
      };

      const frameId = globalThis.requestAnimationFrame(step);
      store.setPanAnimationFrameId?.({ frameId });
      return;
    }
  }

  store.setPan({ panX: nextPanX, panY: nextPanY });
  syncPanPresentation(deps);
  dispatchPanChanged({ store, dispatchEvent });
};
