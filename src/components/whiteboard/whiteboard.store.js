// Natural zoom levels
const ZOOM_LEVELS = [
  0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0,
];

const findNearestZoomLevel = (currentZoom) => {
  let closest = ZOOM_LEVELS[0];
  let minDiff = Math.abs(currentZoom - closest);

  for (const level of ZOOM_LEVELS) {
    const diff = Math.abs(currentZoom - level);
    if (diff < minDiff) {
      minDiff = diff;
      closest = level;
    }
  }
  return closest;
};

const getNextZoomLevel = (currentZoom, direction) => {
  const currentIndex = ZOOM_LEVELS.findIndex(
    (level) => Math.abs(level - currentZoom) < 0.01,
  );

  if (currentIndex === -1) {
    // If current zoom is not exactly on a preset level, find nearest
    const nearest = findNearestZoomLevel(currentZoom);
    const nearestIndex = ZOOM_LEVELS.indexOf(nearest);
    return direction > 0
      ? ZOOM_LEVELS[Math.min(nearestIndex + 1, ZOOM_LEVELS.length - 1)]
      : ZOOM_LEVELS[Math.max(nearestIndex - 1, 0)];
  }

  if (direction > 0) {
    return ZOOM_LEVELS[Math.min(currentIndex + 1, ZOOM_LEVELS.length - 1)];
  } else {
    return ZOOM_LEVELS[Math.max(currentIndex - 1, 0)];
  }
};

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

  // Calculate the point in canvas coordinates before zoom
  const canvasX = (mouseX - state.panX) / state.zoomLevel;
  const canvasY = (mouseY - state.panY) / state.zoomLevel;

  // Update zoom level
  state.zoomLevel = newZoom;

  // Calculate new pan to keep the canvas point under the mouse
  state.panX = mouseX - canvasX * newZoom;
  state.panY = mouseY - canvasY * newZoom;
};

export const zoomFromCenter = (
  state,
  { direction, containerWidth, containerHeight },
) => {
  const newZoom = getNextZoomLevel(state.zoomLevel, direction);

  // No change if already at min/max
  if (newZoom === state.zoomLevel) return;

  // Calculate center point
  const centerX = containerWidth / 2;
  const centerY = containerHeight / 2;

  // Calculate the point in canvas coordinates before zoom
  const canvasX = (centerX - state.panX) / state.zoomLevel;
  const canvasY = (centerY - state.panY) / state.zoomLevel;

  // Update zoom level
  state.zoomLevel = newZoom;

  // Calculate new pan to keep the canvas point at center
  state.panX = centerX - canvasX * newZoom;
  state.panY = centerY - canvasY * newZoom;
};

export const selectIsDragging = ({ state, props }, payload) => {
  return state.isDragging;
};

export const selectDragItemId = ({ state, props }, payload) => state.dragItemId;

export const selectIsPanMode = ({ state, props }, payload) => state.isPanMode;
export const selectIsPanning = ({ state, props }, payload) => state.isPanning;
export const selectPan = ({ state, props }, payload) => ({
  x: state.panX,
  y: state.panY,
});
export const selectZoomLevel = ({ state, props }, payload) => state.zoomLevel;

export const toViewData = ({ state, props }) => {
  const items = props.items || [];

  // Initialize zoom level from props if provided and not already set
  if (props.initialZoomLevel && state.zoomLevel === 1) {
    state.zoomLevel = props.initialZoomLevel;
  }

  return {
    items,
    isPanMode: state.isPanMode,
    panX: state.panX,
    panY: state.panY,
    zoomLevel: state.zoomLevel,
    zoomLevelPercent: Math.round(state.zoomLevel * 100),
    containerCursor: state.isPanMode ? "grab" : "default",
    itemCursor: state.isPanMode ? "default" : "move",
  };
};
