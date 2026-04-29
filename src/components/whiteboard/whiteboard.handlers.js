import { fromEvent, merge, tap } from "rxjs";
import {
  SCENE_BOX_HEIGHT,
  SCENE_BOX_WIDTH,
} from "../../internal/whiteboard/constants.js";

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
  return mountSubscriptions(deps);
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

  syncContainerSize(deps);

  if (touchCount >= 2) {
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

  store.stopTouchGesture();
};

export const handleContainerTouchCancel = (deps, payload) => {
  preventTouchDefault(payload?._event);
  deps.store.stopTouchGesture();
};

export const handleContainerGestureEvent = (_deps, payload) => {
  preventTouchDefault(payload?._event);
  payload?._event?.stopPropagation?.();
};

export const handleZoomInClick = (deps) => {
  const { store, refs, dispatchEvent } = deps;

  if (store.selectIsDraggingMinimapViewport()) {
    return;
  }

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

  const minimapContainer = refs.minimapContainer;
  if (!minimapContainer) {
    return;
  }

  const minimapData = store.selectMinimapData({
    items: deps.props?.items || [],
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
  const { store, refs } = deps;
  const { _event: event } = payload;

  if (!isPrimaryMouseButton(event)) {
    return;
  }

  if (store.selectIsPanMode()) {
    // Let the event bubble to the container so Space-pan can start viewport drag.
    return;
  }

  event.stopPropagation();

  const itemId =
    event.currentTarget?.dataset?.itemId ||
    event.currentTarget?.id?.replace("item", "");
  const itemElement = event.currentTarget;
  const canvas = refs.canvas;
  const canvasRect = canvas.getBoundingClientRect();
  const zoomLevel = store.selectZoomLevel();
  const pan = store.selectPan();

  // Calculate the mouse position relative to the canvas coordinate space
  const mouseInCanvasX = (event.clientX - canvasRect.left - pan.x) / zoomLevel;
  const mouseInCanvasY = (event.clientY - canvasRect.top - pan.y) / zoomLevel;

  // Get the item's current position in canvas coordinates
  const itemX = parseInt(itemElement.style.left, 10) || 0;
  const itemY = parseInt(itemElement.style.top, 10) || 0;

  // Calculate drag offset relative to item's top-left corner
  store.setDragOffset({
    x: mouseInCanvasX - itemX,
    y: mouseInCanvasY - itemY,
  });

  store.startDragging({ itemId });
  store.setLastDraggedPosition({
    itemId,
    x: itemX,
    y: itemY,
  });

  // Dispatch selection event
  deps.dispatchEvent(
    new CustomEvent("item-selected", {
      detail: { itemId },
    }),
  );
};

export const handleItemDoubleClick = (deps, payload) => {
  payload._event.stopPropagation();

  const itemId =
    payload._event.currentTarget?.dataset?.itemId ||
    payload._event.currentTarget?.id?.replace("item", "") ||
    "";

  if (!itemId) {
    console.error("ERROR: No itemId found for double-click");
    return;
  }

  // Dispatch double-click event
  deps.dispatchEvent(
    new CustomEvent("item-double-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
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
    // Handle item dragging
    const canvas = refs.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const dragItemId = store.selectDragItemId();
    const pan = store.selectPan();
    const zoomLevel = store.selectZoomLevel();
    const dragOffset = store.selectDragOffset();

    // Calculate current mouse position in canvas coordinate space
    const mouseInCanvasX =
      (payload._event.clientX - canvasRect.left - pan.x) / zoomLevel;
    const mouseInCanvasY =
      (payload._event.clientY - canvasRect.top - pan.y) / zoomLevel;

    // Calculate new item position by subtracting the drag offset
    const newX = mouseInCanvasX - dragOffset.x;
    const newY = mouseInCanvasY - dragOffset.y;

    // Get the container's visible area
    const container = refs.container;
    const containerRect = container.getBoundingClientRect();
    const panState = store.selectPan();

    // Calculate visible area in canvas coordinates based on actual container size
    const viewportLeft = -panState.x / zoomLevel;
    const viewportTop = -panState.y / zoomLevel;
    const viewportRight = viewportLeft + containerRect.width / zoomLevel;
    const viewportBottom = viewportTop + containerRect.height / zoomLevel;

    // Item dimensions
    const itemWidth = SCENE_BOX_WIDTH;
    const itemHeight = SCENE_BOX_HEIGHT;

    // Keep item fully within viewport bounds (no edge overlap)
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

    // Dispatch real-time position update to parent (scenes page)
    dispatchEvent(
      new CustomEvent("item-position-updating", {
        detail: {
          itemId: dragItemId,
          x: snappedX,
          y: snappedY,
        },
      }),
    );
  } else if (syncContainerSize(deps)) {
    renderWithCursorSync(deps);
  }
};

export const handleWindowMouseUp = (deps) => {
  const { store, refs, dispatchEvent } = deps;

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
      // Dispatch the final position to update persistent data.
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
    store.stopTouchGesture();
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
