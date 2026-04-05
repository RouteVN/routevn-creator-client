const VIEWPORT_SIZE = 320;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const MAX_OUTPUT_SIZE = 512;
const MIN_OUTPUT_SIZE = 64;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const hasImage = (state) => state.imageWidth > 0 && state.imageHeight > 0;

const getEffectiveMaxZoom = (state) => {
  if (!hasImage(state)) {
    return MAX_ZOOM;
  }

  return Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, Math.min(state.imageWidth, state.imageHeight) / 64),
  );
};

const getRenderedMetrics = (state, zoomLevel = state.zoomLevel) => {
  if (!hasImage(state)) {
    return {
      scale: 1,
      width: VIEWPORT_SIZE,
      height: VIEWPORT_SIZE,
    };
  }

  const coverScale = Math.max(
    VIEWPORT_SIZE / state.imageWidth,
    VIEWPORT_SIZE / state.imageHeight,
  );
  const scale = coverScale * zoomLevel;

  return {
    scale,
    width: state.imageWidth * scale,
    height: state.imageHeight * scale,
  };
};

const clampOffsets = (
  state,
  {
    offsetX = state.offsetX,
    offsetY = state.offsetY,
    zoomLevel = state.zoomLevel,
  } = {},
) => {
  const { width, height } = getRenderedMetrics(state, zoomLevel);
  const minOffsetX = Math.min(0, VIEWPORT_SIZE - width);
  const minOffsetY = Math.min(0, VIEWPORT_SIZE - height);

  return {
    offsetX: clamp(offsetX, minOffsetX, 0),
    offsetY: clamp(offsetY, minOffsetY, 0),
  };
};

const getCenteredOffsets = (state, zoomLevel = state.zoomLevel) => {
  const { width, height } = getRenderedMetrics(state, zoomLevel);

  return clampOffsets(state, {
    offsetX: (VIEWPORT_SIZE - width) / 2,
    offsetY: (VIEWPORT_SIZE - height) / 2,
    zoomLevel,
  });
};

const applyZoomLevel = (state, zoomLevel) => {
  const maxZoomLevel = getEffectiveMaxZoom(state);

  if (!hasImage(state)) {
    state.zoomLevel = clamp(zoomLevel, MIN_ZOOM, maxZoomLevel);
    return;
  }

  const nextZoomLevel = clamp(zoomLevel, MIN_ZOOM, maxZoomLevel);
  const currentZoomLevel = clamp(state.zoomLevel, MIN_ZOOM, maxZoomLevel);
  const currentOffsets = clampOffsets(state, {
    offsetX: state.offsetX,
    offsetY: state.offsetY,
    zoomLevel: currentZoomLevel,
  });
  const currentMetrics = getRenderedMetrics(state, currentZoomLevel);

  const centerRatioX =
    currentMetrics.width > 0
      ? (VIEWPORT_SIZE / 2 - currentOffsets.offsetX) / currentMetrics.width
      : 0.5;
  const centerRatioY =
    currentMetrics.height > 0
      ? (VIEWPORT_SIZE / 2 - currentOffsets.offsetY) / currentMetrics.height
      : 0.5;

  state.zoomLevel = nextZoomLevel;

  const nextMetrics = getRenderedMetrics(state, nextZoomLevel);
  const nextOffsets = clampOffsets(state, {
    offsetX: VIEWPORT_SIZE / 2 - centerRatioX * nextMetrics.width,
    offsetY: VIEWPORT_SIZE / 2 - centerRatioY * nextMetrics.height,
    zoomLevel: nextZoomLevel,
  });

  state.offsetX = nextOffsets.offsetX;
  state.offsetY = nextOffsets.offsetY;
};

export const createInitialState = () => ({
  imageUrl: undefined,
  imageWidth: 0,
  imageHeight: 0,
  zoomLevel: MIN_ZOOM,
  offsetX: 0,
  offsetY: 0,
  isDragging: false,
  dragStartMouseX: 0,
  dragStartMouseY: 0,
  dragStartOffsetX: 0,
  dragStartOffsetY: 0,
});

export const setImage = (
  { state },
  { imageUrl, imageWidth, imageHeight } = {},
) => {
  state.imageUrl = imageUrl;
  state.imageWidth = imageWidth ?? 0;
  state.imageHeight = imageHeight ?? 0;
  state.isDragging = false;
  state.dragStartMouseX = 0;
  state.dragStartMouseY = 0;
  state.dragStartOffsetX = 0;
  state.dragStartOffsetY = 0;
  state.zoomLevel = MIN_ZOOM;

  const centeredOffsets = getCenteredOffsets(state, MIN_ZOOM);
  state.offsetX = centeredOffsets.offsetX;
  state.offsetY = centeredOffsets.offsetY;
};

export const clearImage = ({ state }) => {
  state.imageUrl = undefined;
  state.imageWidth = 0;
  state.imageHeight = 0;
  state.zoomLevel = MIN_ZOOM;
  state.offsetX = 0;
  state.offsetY = 0;
  state.isDragging = false;
  state.dragStartMouseX = 0;
  state.dragStartMouseY = 0;
  state.dragStartOffsetX = 0;
  state.dragStartOffsetY = 0;
};

export const startDragging = ({ state }, { mouseX, mouseY } = {}) => {
  if (!hasImage(state)) {
    return;
  }

  state.isDragging = true;
  state.dragStartMouseX = mouseX ?? 0;
  state.dragStartMouseY = mouseY ?? 0;
  state.dragStartOffsetX = state.offsetX;
  state.dragStartOffsetY = state.offsetY;
};

export const updateDragging = ({ state }, { mouseX, mouseY } = {}) => {
  if (!state.isDragging || !hasImage(state)) {
    return;
  }

  const nextOffsets = clampOffsets(state, {
    offsetX: state.dragStartOffsetX + ((mouseX ?? 0) - state.dragStartMouseX),
    offsetY: state.dragStartOffsetY + ((mouseY ?? 0) - state.dragStartMouseY),
  });

  state.offsetX = nextOffsets.offsetX;
  state.offsetY = nextOffsets.offsetY;
};

export const stopDragging = ({ state }) => {
  state.isDragging = false;
};

export const setZoomLevel = ({ state }, { zoomLevel } = {}) => {
  applyZoomLevel(state, Number(zoomLevel) || MIN_ZOOM);
};

export const nudgeZoomLevel = ({ state }, { delta } = {}) => {
  applyZoomLevel(state, state.zoomLevel + (delta ?? 0));
};

export const selectImageUrl = ({ state }) => state.imageUrl;
export const selectIsDragging = ({ state }) => state.isDragging;
export const selectZoomLevel = ({ state }) => state.zoomLevel;

export const selectCropSelection = ({ state }) => {
  if (!hasImage(state)) {
    return undefined;
  }

  const zoomLevel = clamp(
    state.zoomLevel,
    MIN_ZOOM,
    getEffectiveMaxZoom(state),
  );
  const { scale } = getRenderedMetrics(state, zoomLevel);
  const offsets = clampOffsets(state, {
    offsetX: state.offsetX,
    offsetY: state.offsetY,
    zoomLevel,
  });
  const sourceSize = Math.min(
    state.imageWidth,
    state.imageHeight,
    VIEWPORT_SIZE / scale,
  );
  const maxSourceX = Math.max(0, state.imageWidth - sourceSize);
  const maxSourceY = Math.max(0, state.imageHeight - sourceSize);
  const sourceX = clamp(-offsets.offsetX / scale, 0, maxSourceX);
  const sourceY = clamp(-offsets.offsetY / scale, 0, maxSourceY);

  return {
    sourceX,
    sourceY,
    sourceSize,
    outputSize: clamp(Math.round(sourceSize), MIN_OUTPUT_SIZE, MAX_OUTPUT_SIZE),
  };
};

export const selectViewData = ({ state }) => {
  const isReady = hasImage(state) && Boolean(state.imageUrl);
  const maxZoom = getEffectiveMaxZoom(state);
  const zoomLevel = clamp(state.zoomLevel, MIN_ZOOM, maxZoom);
  const { width, height } = getRenderedMetrics(state, zoomLevel);
  const offsets = clampOffsets(state, {
    offsetX: state.offsetX,
    offsetY: state.offsetY,
    zoomLevel,
  });

  return {
    imageUrl: state.imageUrl,
    isReady,
    cropCursor: state.isDragging ? "grabbing" : isReady ? "grab" : "default",
    imageFrameStyle: [
      "position:absolute",
      `left:${offsets.offsetX}px`,
      `top:${offsets.offsetY}px`,
      `width:${width}px`,
      `height:${height}px`,
      "pointer-events:none",
    ].join("; "),
    viewportSize: VIEWPORT_SIZE,
    zoomLevel,
    zoomPercent: Math.round(zoomLevel * 100),
    minZoom: MIN_ZOOM,
    maxZoom,
    zoomStep: ZOOM_STEP,
  };
};
