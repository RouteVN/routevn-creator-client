import { fromEvent, tap } from "rxjs";

let dragOffset = { x: 0, y: 0 };

export const handleContainerContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  const { store, getRefIds, dispatchEvent } = deps;

  // Calculate click position in canvas coordinates
  const container = getRefIds().container.elm;
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
  const { store, render } = deps;
  const isPanMode = store.selectIsPanMode();
  store.togglePanMode({ isPanMode: !isPanMode });
  render();
}

export const handleContainerMouseDown = (deps, payload) => {
  const { store, getRefIds } = deps;

  if (store.selectIsPanMode()) {
    // Start panning
    store.startPanning({
      mouseX: payload._event.clientX,
      mouseY: payload._event.clientY,
    });
  } else {
    // Calculate click position in canvas coordinates using container coordinates
    const container = getRefIds().container.elm;
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
  const { store, getRefIds, render, dispatchEvent } = deps;

  // Calculate mouse position relative to container
  const container = getRefIds().container.elm;
  const rect = container.getBoundingClientRect();
  const mouseX = payload._event.clientX - rect.left;
  const mouseY = payload._event.clientY - rect.top;

  // Determine zoom direction and scale factor
  const zoomIntensity = 0.1;
  const scaleFactor = event.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;

  event.preventDefault();
  store.zoomAt({ mouseX, mouseY, scaleFactor });
  render();

  // Dispatch zoom change event to parent
  dispatchEvent(
    new CustomEvent("zoom-changed", {
      detail: { zoomLevel: store.selectZoomLevel() },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleZoomInClick = (deps) => {
  const { store, getRefIds, render, dispatchEvent } = deps;

  const container = getRefIds().container.elm;
  const rect = container.getBoundingClientRect();

  store.zoomFromCenter({
    direction: 1,
    containerWidth: rect.width,
    containerHeight: rect.height,
  });

  render();

  // Dispatch zoom change event to parent
  dispatchEvent(
    new CustomEvent("zoom-changed", {
      detail: { zoomLevel: store.selectZoomLevel() },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleZoomOutClick = (deps) => {
  const { store, getRefIds, render, dispatchEvent } = deps;

  const container = getRefIds().container.elm;
  const rect = container.getBoundingClientRect();

  store.zoomFromCenter({
    direction: -1,
    containerWidth: rect.width,
    containerHeight: rect.height,
  });

  render();

  // Dispatch zoom change event to parent
  dispatchEvent(
    new CustomEvent("zoom-changed", {
      detail: { zoomLevel: store.selectZoomLevel() },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleItemMouseDown = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, getRefIds } = deps;

  if (store.selectIsPanMode()) {
    // Don't drag items in pan mode
    return;
  }

  const itemId = payload._event.currentTarget.id.replace("item-", "");
  const itemElement = payload._event.currentTarget;
  const canvas = getRefIds().canvas.elm;
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
  dragOffset.x = mouseInCanvasX - itemX;
  dragOffset.y = mouseInCanvasY - itemY;

  console.log(
    "Drag start - Mouse in canvas:",
    mouseInCanvasX,
    mouseInCanvasY,
    "Item pos:",
    itemX,
    itemY,
    "Offset:",
    dragOffset.x,
    dragOffset.y,
  );

  console.log("Starting drag for item:", itemId);
  store.startDragging({ itemId });

  // Dispatch selection event
  deps.dispatchEvent(
    new CustomEvent("item-selected", {
      detail: { itemId },
    }),
  );
};

export const handleItemDoubleClick = (deps, payload) => {
  payload._event.stopPropagation();

  const fullId = payload._event.currentTarget.id;
  const itemId = fullId ? fullId.replace("item-", "") : "";

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
  const fullId = payload._event.currentTarget.id;
  const itemId = fullId ? fullId.replace("item-", "") : "";

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

export const handleWindowMouseMove = (deps, payload) => {
  const { store, getRefIds, render, dispatchEvent } = deps;

  if (store.selectIsPanning()) {
    // Handle panning
    store.updatePan({
      mouseX: payload._event.clientX,
      mouseY: payload._event.clientY,
    });
    render();
  } else if (store.selectIsDragging()) {
    // Handle item dragging
    const canvas = getRefIds().canvas.elm;
    const canvasRect = canvas.getBoundingClientRect();
    const dragItemId = store.selectDragItemId();
    const pan = store.selectPan();
    const zoomLevel = store.selectZoomLevel();

    // Calculate current mouse position in canvas coordinate space
    const mouseInCanvasX =
      (payload._event.clientX - canvasRect.left - pan.x) / zoomLevel;
    const mouseInCanvasY =
      (payload._event.clientY - canvasRect.top - pan.y) / zoomLevel;

    // Calculate new item position by subtracting the drag offset
    const newX = mouseInCanvasX - dragOffset.x;
    const newY = mouseInCanvasY - dragOffset.y;

    // Get the container's visible area
    const container = getRefIds().container.elm;
    const containerRect = container.getBoundingClientRect();
    const panState = store.selectPan();

    // Calculate visible area in canvas coordinates based on actual container size
    const viewportLeft = -panState.x / zoomLevel;
    const viewportTop = -panState.y / zoomLevel;
    const viewportRight = viewportLeft + containerRect.width / zoomLevel;
    const viewportBottom = viewportTop + containerRect.height / zoomLevel;

    // Item dimensions
    const itemWidth = 120;
    const itemHeight = 60;

    // Keep item fully within viewport bounds (no edge overlap)
    const maxX = viewportRight - itemWidth;
    const maxY = viewportBottom - itemHeight;

    const constrainedX = Math.max(viewportLeft, Math.min(newX, maxX));
    const constrainedY = Math.max(viewportTop, Math.min(newY, maxY));

    const snappedX = Math.round(constrainedX / 5) * 5;
    const snappedY = Math.round(constrainedY / 5) * 5;

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
  }
};

export const handleWindowMouseUp = (deps) => {
  const { store, getRefIds, dispatchEvent } = deps;

  if (store.selectIsPanning()) {
    store.stopPanning();
  } else if (store.selectIsDragging()) {
    const dragItemId = store.selectDragItemId();
    const itemElement = getRefIds()[`item-${dragItemId}`];

    if (itemElement && itemElement.elm) {
      const finalX = parseInt(itemElement.elm.style.left, 10);
      const finalY = parseInt(itemElement.elm.style.top, 10);

      // Dispatch the final position to update the data
      dispatchEvent(
        new CustomEvent("item-position-changed", {
          detail: {
            itemId: dragItemId,
            x: finalX,
            y: finalY,
          },
        }),
      );
    }

    store.stopDragging();
  }
};

// Keyboard event handlers
export const handleWindowKeyDown = (deps, payload) => {
  const { store, render } = deps;

  if (event.code === "Space" && !store.selectIsPanMode()) {
    payload._event.preventDefault();
    store.togglePanMode({ isPanMode: true });
    render();
  }
};

export const handleWindowKeyUp = (deps, payload) => {
  const { store, render } = deps;

  if (event.code === "Space" && store.selectIsPanMode()) {
    payload._event.preventDefault();
    store.togglePanMode({ isPanMode: false });
    render();
  }
};

export const subscriptions = (deps) => {
  return [
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
