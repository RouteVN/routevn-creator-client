import { drawArrowBetweenScenes } from "../../utils/arrowUtils";

// Natural zoom levels
const ZOOM_LEVELS = [0.2, 0.3, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

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

export const createInitialState = () => ({
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

  // Clamp zoom level between 0.2x and 2x, snapping to limits if exceeded
  let clampedZoom = newZoom;
  if (newZoom < 0.2) {
    clampedZoom = 0.2;
  } else if (newZoom > 2) {
    clampedZoom = 2.0;
  }

  // Don't update if already at the limit and trying to go further
  if (clampedZoom === state.zoomLevel) return;

  // Calculate the point in canvas coordinates before zoom
  const canvasX = (mouseX - state.panX) / state.zoomLevel;
  const canvasY = (mouseY - state.panY) / state.zoomLevel;

  // Update zoom level
  state.zoomLevel = clampedZoom;

  // Calculate new pan to keep the canvas point under the mouse
  state.panX = mouseX - canvasX * clampedZoom;
  state.panY = mouseY - canvasY * clampedZoom;
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

export const selectIsDragging = ({ state }) => {
  return state.isDragging;
};

export const selectDragItemId = ({ state }) => state.dragItemId;

export const selectIsPanMode = ({ state }) => state.isPanMode;
export const selectIsPanning = ({ state }) => state.isPanning;
export const selectPan = ({ state }) => ({
  x: state.panX,
  y: state.panY,
});
export const selectZoomLevel = ({ state }) => state.zoomLevel;

export const setInitialZoomAndPan = (state, { zoomLevel, panX, panY }) => {
  state.zoomLevel = zoomLevel;
  state.panX = panX;
  state.panY = panY;
};

const generateMinimapData = (items, pan) => {
  if (!items || items.length === 0) {
    return {};
  }

  let x_tl = Infinity;
  let y_tl = Infinity;
  let x_br = -Infinity;
  let y_br = -Infinity;

  items.forEach((item) => {
    x_tl = Math.min(x_tl, item.x);
    y_tl = Math.min(y_tl, item.y);
    x_br = Math.max(x_br, item.x);
    y_br = Math.max(y_br, item.y);
  });

  const minimapWidth = 200;
  const minimapHeight = 150;
  const itemWidth = 120;
  const itemHeight = 60;
  const padding = 30;
  const standardWidth = x_br - x_tl + itemWidth + 60;
  const standardHeight = y_br - y_tl + itemHeight + 60;

  const scale = Math.min(
    minimapWidth / standardWidth,
    minimapHeight / standardHeight,
  );
  const scaledWidth = standardWidth * scale;
  const scaledHeight = standardHeight * scale;
  const scaledItemWidth = 120 * scale;
  const scaledItemHeight = 60 * scale;

  const offsetX = (minimapWidth - scaledWidth) / 2;
  const offsetY = (minimapHeight - scaledHeight) / 2;

  const minimapItems = items.map((item) => ({
    id: item.id,
    x: (item.x - x_tl + padding) * scale + offsetX,
    y: (item.y - y_tl + padding) * scale + offsetY,
  }));

  const scaledPanX = pan.x * scale;
  const scaledPanY = pan.y * scale;

  return {
    items: minimapItems,
    scale,
    minimap: { width: minimapWidth, height: minimapHeight },
    scaledScreen: { width: scaledWidth, height: scaledHeight },
    scaledItem: { width: scaledItemWidth, height: scaledItemHeight },
    offset: { x: offsetX, y: offsetY },
    scaledPan: { x: scaledPanX, y: scaledPanY },
  };
};

export const selectViewData = ({ state, props }) => {
  const items = (props.items || []).map((item) => ({
    ...item,
    borderColor: props.selectedItemId === item.id ? "fg" : "ac",
  }));

  // Use framework cursor values: grab, grabbing, or undefined (for default)
  const containerCursor =
    props.cursor ||
    (state.isPanning ? "grabbing" : state.isPanMode ? "grab" : undefined);

  // Calculate adaptive grid size for container background
  const getAdaptiveGridSize = (zoomLevel) => {
    // Fixed canvas grid size
    const canvasGridSize = 20;
    const visualGridSize = canvasGridSize * zoomLevel;

    // This prevents dots from becoming too dense while maintaining grid alignment
    if (visualGridSize < 8) {
      // At very low zoom, merge 4x4 grid cells into one (multiply by 4)
      return canvasGridSize * 4 * zoomLevel;
    } else if (visualGridSize < 12) {
      // At low zoom, merge 2x2 grid cells into one (multiply by 2)
      return canvasGridSize * 2 * zoomLevel;
    }

    // Normal case: no merging needed
    return visualGridSize;
  };

  const arrowsList = [];

  // Generate arrows for each scene's transitions
  items.forEach((sourceItem) => {
    if (sourceItem.transitions && sourceItem.transitions.length > 0) {
      sourceItem.transitions.forEach((targetSceneId) => {
        const targetItem = items.find((item) => item.id === targetSceneId);
        if (targetItem && targetItem.id !== sourceItem.id) {
          const arrowData = drawArrowBetweenScenes(sourceItem, targetItem);
          // Add unique identifier for DOM reference
          arrowData.id = `arrow-${sourceItem.id}-to-${targetSceneId}`;
          arrowsList.push(arrowData);
        }
      });
    }
  });

  return {
    items,
    minimapData: generateMinimapData(items, { x: state.panX, y: state.panY }),
    arrowsList,
    selectedItemId: props.selectedItemId,
    isPanMode: state.isPanMode,
    panModeV: state.isPanMode ? "pr" : "gh",
    panX: state.panX,
    panY: state.panY,
    zoomLevel: state.zoomLevel,
    zoomLevelPercent: Math.round(state.zoomLevel * 100),
    containerCursor: containerCursor,
    itemCursor: state.isPanMode ? undefined : "m", // Use "m" for move cursor
    gridSize: getAdaptiveGridSize(state.zoomLevel),
  };
};
