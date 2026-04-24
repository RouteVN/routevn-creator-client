import { drawArrowBetweenScenes } from "../../internal/whiteboard/arrowUtils.js";
import {
  SCENE_BOX_HEIGHT,
  SCENE_BOX_WIDTH,
} from "../../internal/whiteboard/constants.js";

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

const clampZoomLevel = (zoomLevel) => Math.min(2, Math.max(0.2, zoomLevel));

export const createInitialState = () => ({
  isDragging: false,
  dragItemId: null,
  dragOffset: { x: 0, y: 0 },
  lastDraggedPosition: undefined,
  hoveredItemId: undefined,
  touchGesture: undefined,
  isDraggingMinimapViewport: false,
  minimapViewportDrag: undefined,
  // Pan state
  isPinnedPanMode: false,
  isKeyboardPanMode: false,
  isPanning: false,
  panX: 0,
  panY: 0,
  panStartX: 0,
  panStartY: 0,
  panStartMouseX: 0,
  panStartMouseY: 0,
  // Zoom state
  zoomLevel: 1,
  containerSize: {
    width: 0,
    height: 0,
  },
});

export const startDragging = ({ state }, { itemId } = {}) => {
  state.isDragging = true;
  state.dragItemId = itemId;
};

export const stopDragging = ({ state }, _payload = {}) => {
  state.isDragging = false;
  state.dragItemId = null;
};

export const setDragOffset = ({ state }, { x, y } = {}) => {
  state.dragOffset = {
    x: x ?? 0,
    y: y ?? 0,
  };
};

export const selectDragOffset = ({ state }) => state.dragOffset;

export const setLastDraggedPosition = ({ state }, { itemId, x, y } = {}) => {
  state.lastDraggedPosition = { itemId, x, y };
};

export const clearLastDraggedPosition = ({ state }, _payload = {}) => {
  state.lastDraggedPosition = undefined;
};

export const selectLastDraggedPosition = ({ state }) => {
  return state.lastDraggedPosition;
};

// Pan functions
export const setPinnedPanMode = ({ state }, { isPanMode } = {}) => {
  state.isPinnedPanMode = isPanMode;
};

export const setKeyboardPanMode = ({ state }, { isPanMode } = {}) => {
  state.isKeyboardPanMode = isPanMode;
};

export const startPanning = ({ state }, { mouseX, mouseY } = {}) => {
  state.isPanning = true;
  state.panStartX = state.panX;
  state.panStartY = state.panY;
  state.panStartMouseX = mouseX;
  state.panStartMouseY = mouseY;
};

export const updatePan = ({ state }, { mouseX, mouseY } = {}) => {
  if (!state.isPanning) return;
  state.panX = state.panStartX + (mouseX - state.panStartMouseX);
  state.panY = state.panStartY + (mouseY - state.panStartMouseY);
};

export const stopPanning = ({ state }, _payload = {}) => {
  state.isPanning = false;
};

export const startTouchPan = ({ state }, { touchX, touchY } = {}) => {
  const startX = Number(touchX);
  const startY = Number(touchY);

  if (!Number.isFinite(startX) || !Number.isFinite(startY)) {
    return;
  }

  state.touchGesture = {
    type: "pan",
    startX,
    startY,
    startPanX: state.panX,
    startPanY: state.panY,
    hasMoved: false,
  };
};

export const updateTouchPan = ({ state }, { touchX, touchY } = {}) => {
  const gesture = state.touchGesture;
  const nextX = Number(touchX);
  const nextY = Number(touchY);

  if (
    gesture?.type !== "pan" ||
    !Number.isFinite(nextX) ||
    !Number.isFinite(nextY)
  ) {
    return;
  }

  const deltaX = nextX - gesture.startX;
  const deltaY = nextY - gesture.startY;

  state.panX = gesture.startPanX + deltaX;
  state.panY = gesture.startPanY + deltaY;
  gesture.hasMoved = gesture.hasMoved || Math.hypot(deltaX, deltaY) > 3;
};

export const startTouchPinch = (
  { state },
  { centerX, centerY, distance } = {},
) => {
  const startCenterX = Number(centerX);
  const startCenterY = Number(centerY);
  const startDistance = Number(distance);

  if (
    !Number.isFinite(startCenterX) ||
    !Number.isFinite(startCenterY) ||
    !Number.isFinite(startDistance) ||
    startDistance <= 0
  ) {
    return;
  }

  state.touchGesture = {
    type: "pinch",
    startDistance,
    startZoomLevel: state.zoomLevel,
    anchorCanvasX: (startCenterX - state.panX) / state.zoomLevel,
    anchorCanvasY: (startCenterY - state.panY) / state.zoomLevel,
    hasMoved: false,
  };
};

export const updateTouchPinch = (
  { state },
  { centerX, centerY, distance } = {},
) => {
  const gesture = state.touchGesture;
  const nextCenterX = Number(centerX);
  const nextCenterY = Number(centerY);
  const nextDistance = Number(distance);

  if (
    gesture?.type !== "pinch" ||
    !Number.isFinite(nextCenterX) ||
    !Number.isFinite(nextCenterY) ||
    !Number.isFinite(nextDistance) ||
    nextDistance <= 0
  ) {
    return;
  }

  const nextZoomLevel = clampZoomLevel(
    gesture.startZoomLevel * (nextDistance / gesture.startDistance),
  );

  state.zoomLevel = nextZoomLevel;
  state.panX = nextCenterX - gesture.anchorCanvasX * nextZoomLevel;
  state.panY = nextCenterY - gesture.anchorCanvasY * nextZoomLevel;
  gesture.hasMoved =
    gesture.hasMoved || Math.abs(nextDistance - gesture.startDistance) > 3;
};

export const stopTouchGesture = ({ state }, _payload = {}) => {
  state.touchGesture = undefined;
};

export const selectTouchGesture = ({ state }) => state.touchGesture;

export const startMinimapViewportDragging = (
  { state },
  { mouseX, mouseY, minimapData } = {},
) => {
  const scale = Number(minimapData?.scale);
  const viewport = minimapData?.viewport;

  if (
    !viewport?.visible ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(Number(mouseX)) ||
    !Number.isFinite(Number(mouseY))
  ) {
    return;
  }

  state.isDraggingMinimapViewport = true;
  state.minimapViewportDrag = {
    offsetX: Number(mouseX) - viewport.x,
    offsetY: Number(mouseY) - viewport.y,
    startViewportX: viewport.x,
    startViewportY: viewport.y,
    startPanX: state.panX,
    startPanY: state.panY,
    scale,
    zoomLevel: state.zoomLevel,
  };
};

export const updatePanFromMinimapViewportDragging = (
  { state },
  { mouseX, mouseY } = {},
) => {
  if (!state.isDraggingMinimapViewport || !state.minimapViewportDrag) {
    return;
  }

  const drag = state.minimapViewportDrag;
  const nextMouseX = Number(mouseX);
  const nextMouseY = Number(mouseY);

  if (!Number.isFinite(nextMouseX) || !Number.isFinite(nextMouseY)) {
    return;
  }

  const nextViewportX = nextMouseX - drag.offsetX;
  const nextViewportY = nextMouseY - drag.offsetY;
  const deltaViewportX = nextViewportX - drag.startViewportX;
  const deltaViewportY = nextViewportY - drag.startViewportY;

  state.panX = drag.startPanX - (deltaViewportX / drag.scale) * drag.zoomLevel;
  state.panY = drag.startPanY - (deltaViewportY / drag.scale) * drag.zoomLevel;
};

export const stopMinimapViewportDragging = ({ state }, _payload = {}) => {
  state.isDraggingMinimapViewport = false;
  state.minimapViewportDrag = undefined;
};

// Zoom functions
export const zoomAt = ({ state }, { mouseX, mouseY, scaleFactor } = {}) => {
  const newZoom = state.zoomLevel * scaleFactor;

  // Clamp zoom level between 0.2x and 2x, snapping to limits if exceeded
  const clampedZoom = clampZoomLevel(newZoom);

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
  { state },
  { direction, containerWidth, containerHeight } = {},
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

export const setHoveredItemId = ({ state }, { itemId } = {}) => {
  state.hoveredItemId = itemId;
};

export const selectIsPanMode = ({ state }) =>
  state.isPinnedPanMode || state.isKeyboardPanMode;
export const selectIsPinnedPanMode = ({ state }) => state.isPinnedPanMode;
export const selectIsKeyboardPanMode = ({ state }) => state.isKeyboardPanMode;
export const selectIsPanning = ({ state }) => state.isPanning;
export const selectIsDraggingMinimapViewport = ({ state }) =>
  state.isDraggingMinimapViewport;
export const selectPan = ({ state }) => ({
  x: state.panX,
  y: state.panY,
});
export const selectZoomLevel = ({ state }) => state.zoomLevel;

export const setContainerSize = ({ state }, { width, height } = {}) => {
  state.containerSize = {
    width: width ?? 0,
    height: height ?? 0,
  };
};

export const selectContainerSize = ({ state }) => state.containerSize;

export const setInitialZoomAndPan = (
  { state },
  { zoomLevel, panX, panY } = {},
) => {
  state.zoomLevel = zoomLevel;
  state.panX = panX;
  state.panY = panY;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeCursorValue = (cursor) => {
  if (!cursor) {
    return undefined;
  }

  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
    return cursor;
  }

  return CSS.supports("cursor", cursor) ? cursor : undefined;
};

const getVisibleViewportAxis = (start, end, limit) => {
  const clippedStart = clamp(start, 0, limit);
  const clippedEnd = clamp(end, 0, limit);

  if (clippedEnd > clippedStart) {
    return {
      start: clippedStart,
      size: clippedEnd - clippedStart,
    };
  }

  const edgeSize = limit > 0 ? 1 : 0;

  if (end <= 0) {
    return {
      start: 0,
      size: edgeSize,
    };
  }

  if (start >= limit) {
    return {
      start: Math.max(0, limit - edgeSize),
      size: edgeSize,
    };
  }

  return {
    start: clippedStart,
    size: edgeSize,
  };
};

const generateMinimapData = (items, pan, zoomLevel, containerSize) => {
  if (!items || items.length === 0) {
    return {
      items: [],
      minimap: {
        width: 0,
        height: 0,
      },
      viewport: {
        visible: false,
      },
    };
  }

  const itemWidth = SCENE_BOX_WIDTH;
  const itemHeight = SCENE_BOX_HEIGHT;
  const minimapWidth = 200;
  const minimapHeight = 150;
  const padding = 30;
  const viewportLeft = -pan.x / zoomLevel;
  const viewportTop = -pan.y / zoomLevel;
  const viewportRight = viewportLeft + containerSize.width / zoomLevel;
  const viewportBottom = viewportTop + containerSize.height / zoomLevel;

  let worldLeft = Infinity;
  let worldTop = Infinity;
  let worldRight = -Infinity;
  let worldBottom = -Infinity;

  items.forEach((item) => {
    worldLeft = Math.min(worldLeft, item.x);
    worldTop = Math.min(worldTop, item.y);
    worldRight = Math.max(worldRight, item.x + itemWidth);
    worldBottom = Math.max(worldBottom, item.y + itemHeight);
  });

  worldLeft -= padding;
  worldTop -= padding;
  worldRight += padding;
  worldBottom += padding;

  const standardWidth = Math.max(1, worldRight - worldLeft);
  const standardHeight = Math.max(1, worldBottom - worldTop);

  const scale = Math.min(
    minimapWidth / standardWidth,
    minimapHeight / standardHeight,
  );
  const scaledWidth = standardWidth * scale;
  const scaledHeight = standardHeight * scale;
  const scaledItemWidth = SCENE_BOX_WIDTH * scale;
  const scaledItemHeight = SCENE_BOX_HEIGHT * scale;

  const offsetX = (minimapWidth - scaledWidth) / 2;
  const offsetY = (minimapHeight - scaledHeight) / 2;

  const minimapItems = items.map((item) => ({
    id: item.id,
    x: (item.x - worldLeft) * scale + offsetX,
    y: (item.y - worldTop) * scale + offsetY,
  }));

  const scaledPanX = pan.x * scale;
  const scaledPanY = pan.y * scale;
  const rawViewportLeft = (viewportLeft - worldLeft) * scale + offsetX;
  const rawViewportTop = (viewportTop - worldTop) * scale + offsetY;
  const rawViewportRight = (viewportRight - worldLeft) * scale + offsetX;
  const rawViewportBottom = (viewportBottom - worldTop) * scale + offsetY;
  const visibleViewportX = getVisibleViewportAxis(
    rawViewportLeft,
    rawViewportRight,
    minimapWidth,
  );
  const visibleViewportY = getVisibleViewportAxis(
    rawViewportTop,
    rawViewportBottom,
    minimapHeight,
  );

  return {
    items: minimapItems,
    scale,
    minimap: { width: minimapWidth, height: minimapHeight },
    scaledScreen: { width: scaledWidth, height: scaledHeight },
    scaledItem: { width: scaledItemWidth, height: scaledItemHeight },
    offset: { x: offsetX, y: offsetY },
    scaledPan: { x: scaledPanX, y: scaledPanY },
    viewport: {
      x: visibleViewportX.start,
      y: visibleViewportY.start,
      width: visibleViewportX.size,
      height: visibleViewportY.size,
      visible:
        containerSize.width > 0 &&
        containerSize.height > 0 &&
        visibleViewportX.size > 0 &&
        visibleViewportY.size > 0,
    },
  };
};

export const selectMinimapData = ({ state }, { items = [] } = {}) => {
  return generateMinimapData(
    items,
    { x: state.panX, y: state.panY },
    state.zoomLevel,
    state.containerSize,
  );
};

export const selectViewData = ({ state, props }) => {
  const isTouchMode = props.isTouchMode === true;
  const items = (props.items || []).map((item) => ({
    ...item,
    borderColor:
      props.selectedItemId === item.id || state.hoveredItemId === item.id
        ? "fg"
        : "ac",
    borderWidth:
      props.selectedItemId === item.id
        ? "sm"
        : state.hoveredItemId === item.id
          ? "xs"
          : "sm",
  }));

  const containerCursor = normalizeCursorValue(props.cursor);
  const itemCursor = normalizeCursorValue(props.cursor) || "move";
  const minimapViewportCursor = state.isDraggingMinimapViewport
    ? "grabbing"
    : "grab";

  // Calculate adaptive grid size for container background
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

  const arrowsList = [];
  const startBadgeSize = Math.round(SCENE_BOX_HEIGHT * (5 / 9));
  const startLineWidth = Math.round(SCENE_BOX_WIDTH / 6);
  const startLineHeight = Math.max(2, Math.round(SCENE_BOX_HEIGHT / 45));

  // Generate arrows for each scene's transitions
  items.forEach((sourceItem) => {
    if (sourceItem.transitions && sourceItem.transitions.length > 0) {
      sourceItem.transitions.forEach((targetSceneId) => {
        const targetItem = items.find((item) => item.id === targetSceneId);
        if (targetItem && targetItem.id !== sourceItem.id) {
          const arrowData = drawArrowBetweenScenes(sourceItem, targetItem);
          // Add unique identifier for DOM reference
          arrowData.id = `arrow-${sourceItem.id}-to-${targetSceneId}`;
          const selectedItemId = props.selectedItemId;
          const isConnectedToSelected =
            selectedItemId &&
            (sourceItem.id === selectedItemId ||
              targetSceneId === selectedItemId);
          arrowData.strokeColor = "var(--foreground)";
          arrowData.strokeWidth = isConnectedToSelected ? 2.25 : 1.5;
          arrowsList.push(arrowData);
        }
      });
    }
  });

  return {
    items,
    showMinimap: !isTouchMode && items.length > 1,
    showControls: !isTouchMode,
    minimapData: selectMinimapData(
      { state },
      {
        items,
      },
    ),
    arrowsList,
    selectedItemId: props.selectedItemId,
    isPanMode: state.isPinnedPanMode || state.isKeyboardPanMode,
    panModeV: state.isPinnedPanMode || state.isKeyboardPanMode ? "pr" : "gh",
    panX: state.panX,
    panY: state.panY,
    zoomLevel: state.zoomLevel,
    zoomLevelPercent: Math.round(state.zoomLevel * 100),
    containerCursor,
    itemCursor,
    minimapViewportCursor,
    gridSize: getAdaptiveGridSize(state.zoomLevel),
    sceneBoxWidth: SCENE_BOX_WIDTH,
    sceneBoxHeight: SCENE_BOX_HEIGHT,
    startBadgeSize,
    startLineWidth,
    startLineHeight,
    startBadgeOffsetX: startBadgeSize + startLineWidth,
    startBadgeOffsetY: (SCENE_BOX_HEIGHT - startBadgeSize) / 2,
  };
};
