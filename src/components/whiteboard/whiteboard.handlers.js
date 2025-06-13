import { fromEvent, tap } from "rxjs";

let dragOffset = { x: 0, y: 0 };

export const handleCanvasMouseDown = (event, deps) => {
  const { store } = deps;
  
  if (store.selectIsPanMode()) {
    // Start panning
    store.startPanning({
      mouseX: event.clientX,
      mouseY: event.clientY
    });
  } else {
    // Deselect items when clicking on canvas
    deps.dispatchEvent(new CustomEvent('item-deselected'));
  }
};

export const handleCanvasWheel = (event, deps) => {
  event.preventDefault();
  const { store, getRefIds, render } = deps;
  
  // Calculate mouse position relative to canvas
  const canvas = getRefIds().canvas.elm;
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  
  // Determine zoom direction and scale factor
  const zoomIntensity = 0.1;
  const scaleFactor = event.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
  
  console.log('Zoom:', event.deltaY < 0 ? 'in' : 'out', 'at', mouseX, mouseY);
  
  store.zoomAt({ mouseX, mouseY, scaleFactor });
  render();
};

export const handleItemMouseDown = (event, deps) => {
  event.stopPropagation();
  const { store, getRefIds } = deps;
  
  if (store.selectIsPanMode()) {
    // Don't drag items in pan mode
    return;
  }
  
  const itemId = event.currentTarget.id.replace('item-', '');
  const itemElement = event.currentTarget;
  const rect = itemElement.getBoundingClientRect();
  const canvas = getRefIds().canvas.elm;
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
  dragOffset.x = mouseInCanvasX - itemX;
  dragOffset.y = mouseInCanvasY - itemY;
  
  console.log('Drag start - Mouse in canvas:', mouseInCanvasX, mouseInCanvasY, 'Item pos:', itemX, itemY, 'Offset:', dragOffset.x, dragOffset.y);
  
  console.log('Starting drag for item:', itemId);
  store.startDragging({ itemId });
  
  // Dispatch selection event
  deps.dispatchEvent(new CustomEvent('item-selected', {
    detail: { itemId }
  }));
};

export const handleWindowMouseMove = (event, deps) => {
  const { store, getRefIds, dispatchEvent, render } = deps;
  
  if (store.selectIsPanning()) {
    // Handle panning
    store.updatePan({
      mouseX: event.clientX,
      mouseY: event.clientY
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
    const mouseInCanvasX = (event.clientX - canvasRect.left - pan.x) / zoomLevel;
    const mouseInCanvasY = (event.clientY - canvasRect.top - pan.y) / zoomLevel;
    
    // Calculate new item position by subtracting the drag offset
    const newX = mouseInCanvasX - dragOffset.x;
    const newY = mouseInCanvasY - dragOffset.y;
    
    // Keep within canvas bounds (relative to unpanned, unzoomed canvas)
    const constrainedX = Math.max(0, Math.min(newX, 1000 - 120)); // Larger canvas area
    const constrainedY = Math.max(0, Math.min(newY, 1000 - 60));
    
    const snappedX = Math.round(constrainedX / 5) * 5;
    const snappedY = Math.round(constrainedY / 5) * 5;
    
    // Update the element position directly for immediate visual feedback
    const itemElement = getRefIds()[`item-${dragItemId}`];
    if (itemElement && itemElement.elm) {
      itemElement.elm.style.left = snappedX + 'px';
      itemElement.elm.style.top = snappedY + 'px';
    }
  }
};

export const handleWindowMouseUp = (event, deps) => {
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
      dispatchEvent(new CustomEvent('item-position-changed', {
        detail: {
          itemId: dragItemId,
          x: finalX,
          y: finalY
        }
      }));
    }
    
    store.stopDragging();
  }
};

// Keyboard event handlers
export const handleWindowKeyDown = (event, deps) => {
  const { store, render } = deps;
  
  if (event.code === 'Space' && !store.selectIsPanMode()) {
    event.preventDefault();
    console.log('Pan mode activated');
    store.togglePanMode({ isPanMode: true });
    render();
  }
};

export const handleWindowKeyUp = (event, deps) => {
  const { store, render } = deps;
  
  if (event.code === 'Space' && store.selectIsPanMode()) {
    event.preventDefault();
    console.log('Pan mode deactivated');
    store.togglePanMode({ isPanMode: false });
    render();
  }
};

export const subscriptions = (deps) => {
  return [
    fromEvent(window, "mousemove").pipe(
      tap((event) => deps.handlers.handleWindowMouseMove(event, deps))
    ),
    fromEvent(window, "mouseup").pipe(
      tap((event) => deps.handlers.handleWindowMouseUp(event, deps))
    ),
    fromEvent(window, "keydown").pipe(
      tap((event) => deps.handlers.handleWindowKeyDown(event, deps))
    ),
    fromEvent(window, "keyup").pipe(
      tap((event) => deps.handlers.handleWindowKeyUp(event, deps))
    ),
  ];
};