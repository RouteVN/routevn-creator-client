import { fromEvent, tap } from "rxjs";
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

const syncCursorStyles = ({ store, refs, props } = {}) => {
  const container = refs?.container;
  if (!container) {
    return;
  }

  const isPanMode = store.selectIsPanMode();
  const isPanning = store.selectIsPanning();
  const panCursor = isPanning ? "grabbing" : isPanMode ? "grab" : undefined;
  const overrideCursor = props?.cursor;
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
  const isPanMode = store.selectIsPanMode();
  store.togglePanMode({ isPanMode: !isPanMode });
  renderWithCursorSync(deps);
};

export const handleContainerMouseDown = (deps, payload) => {
  const { store, refs } = deps;

  if (store.selectIsPanMode()) {
    // Start panning
    store.startPanning({
      mouseX: payload._event.clientX,
      mouseY: payload._event.clientY,
    });
    syncCursorStyles(deps);
  } else {
    // Calculate click position in canvas coordinates using container coordinates
    const container = refs.container;
    const containerRect = container.getBoundingClientRect();
    const pan = store.selectPan();
    const zoomLevel = store.selectZoomLevel();

    // Use container coordinates instead of canvas coordinates for proper zoom calculation
    const canvasX =
      (payload._event.clientX - containerRect.left - pan.x) / zoomLevel;
    const canvasY =
      (payload._event.clientY - containerRect.top - pan.y) / zoomLevel;

    // Emit click event with coordinates
    deps.dispatchEvent(
      new CustomEvent("canvas-click", {
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
  }
};

export const handleContainerWheel = (deps, payload) => {
  const { _event: event } = payload;
  const { store, refs, dispatchEvent } = deps;

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

export const handleZoomInClick = (deps) => {
  const { store, refs, dispatchEvent } = deps;

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

export const handleItemMouseDown = (deps, payload) => {
  const { store, refs } = deps;

  if (store.selectIsPanMode()) {
    // Let the event bubble to the container so Space-pan can start viewport drag.
    return;
  }

  payload._event.stopPropagation();

  const itemId =
    payload._event.currentTarget?.dataset?.itemId ||
    payload._event.currentTarget?.id?.replace("item", "");
  const itemElement = payload._event.currentTarget;
  const canvas = refs.canvas;
  const canvasRect = canvas.getBoundingClientRect();
  const zoomLevel = store.selectZoomLevel();
  const pan = store.selectPan();

  // Calculate the mouse position relative to the canvas coordinate space
  const mouseInCanvasX =
    (payload._event.clientX - canvasRect.left - pan.x) / zoomLevel;
  const mouseInCanvasY =
    (payload._event.clientY - canvasRect.top - pan.y) / zoomLevel;

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
  const didUpdateSize = syncContainerSize(deps);

  if (store.selectIsPanning()) {
    // Handle panning
    store.updatePan({
      mouseX: payload._event.clientX,
      mouseY: payload._event.clientY,
    });

    // Dispatch pan changed event
    dispatchPanChanged({ store, dispatchEvent });

    renderWithCursorSync(deps);
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
  } else if (didUpdateSize) {
    renderWithCursorSync(deps);
  }
};

export const handleWindowMouseUp = (deps) => {
  const { store, refs, dispatchEvent } = deps;

  if (store.selectIsPanning()) {
    store.stopPanning();
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
  const { store, appService } = deps;

  if (appService.isInputFocused()) {
    return;
  }

  if (payload._event.code === "Space" && !store.selectIsPanMode()) {
    payload._event.preventDefault();
    store.togglePanMode({ isPanMode: true });
    renderWithCursorSync(deps);
  }
};

export const handleWindowKeyUp = (deps, payload) => {
  const { store, appService } = deps;

  if (appService.isInputFocused()) {
    return;
  }

  if (payload._event.code === "Space" && store.selectIsPanMode()) {
    payload._event.preventDefault();
    store.togglePanMode({ isPanMode: false });
    renderWithCursorSync(deps);
  }
};

const subscriptions = (deps) => {
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
    fromEvent(window, "keydown").pipe(
      tap((event) =>
        deps.handlers.handleWindowKeyDown(deps, { _event: event }),
      ),
    ),
    fromEvent(window, "keyup").pipe(
      tap((event) => deps.handlers.handleWindowKeyUp(deps, { _event: event })),
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
