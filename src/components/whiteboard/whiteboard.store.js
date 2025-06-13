export const INITIAL_STATE = Object.freeze({
  isDragging: false,
  dragItemId: null,
  // Pan state
  isPanMode: false,
  isPanning: false,
  panX: 0,
  panY: 0,
  panStartX: 0,
  panStartY: 0,
  panStartMouseX: 0,
  panStartMouseY: 0,
  // Zoom state
  zoomLevel: 1,
});

export const startDragging = (state, { itemId }) => {
  state.isDragging = true;
  state.dragItemId = itemId;
};

export const stopDragging = (state) => {
  state.isDragging = false;
  state.dragItemId = null;
};

// Pan functions
export const togglePanMode = (state, { isPanMode }) => {
  state.isPanMode = isPanMode;
};

export const startPanning = (state, { mouseX, mouseY }) => {
  state.isPanning = true;
  state.panStartX = state.panX;
  state.panStartY = state.panY;
  state.panStartMouseX = mouseX;
  state.panStartMouseY = mouseY;
};

export const updatePan = (state, { mouseX, mouseY }) => {
  if (!state.isPanning) return;
  state.panX = state.panStartX + (mouseX - state.panStartMouseX);
  state.panY = state.panStartY + (mouseY - state.panStartMouseY);
};

export const stopPanning = (state) => {
  state.isPanning = false;
};

// Zoom functions
export const zoomAt = (state, { mouseX, mouseY, scaleFactor }) => {
  const newZoom = state.zoomLevel * scaleFactor;
  
  // Clamp zoom level between 0.1x and 3x
  if (newZoom < 0.1 || newZoom > 3) return;
  
  // Calculate the zoom offset to keep the mouse position fixed
  const dx = mouseX * (1 - scaleFactor);
  const dy = mouseY * (1 - scaleFactor);
  
  // Update pan to maintain mouse position
  state.panX += dx;
  state.panY += dy;
  state.zoomLevel = newZoom;
};

export const selectIsDragging = ({ state, props }, payload) => {
  return state.isDragging;
};

export const selectDragItemId = ({ state, props }, payload) => state.dragItemId;

export const selectIsPanMode = ({ state, props }, payload) => state.isPanMode;
export const selectIsPanning = ({ state, props }, payload) => state.isPanning;
export const selectPan = ({ state, props }, payload) => ({ x: state.panX, y: state.panY });
export const selectZoomLevel = ({ state, props }, payload) => state.zoomLevel;

export const toViewData = ({ state, props }) => {
  return {
    items: props.items || [],
    isPanMode: state.isPanMode,
    panX: state.panX,
    panY: state.panY,
    zoomLevel: state.zoomLevel,
    containerCursor: state.isPanMode ? 'grab' : 'default',
    itemCursor: state.isPanMode ? 'default' : 'move',
  };
};