const VIEWPORT_SIZE = 320;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const MAX_OUTPUT_SIZE = 256;
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

const getPointerMetrics = (pointers) => {
  const [first, second] = pointers;
  if (!second) {
    return { x: first.x, y: first.y, distance: 0 };
  }

  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
};

const rebaseGesture = (state) => {
  if (state.pointers.length === 0) {
    state.gesture = undefined;
    return;
  }

  const { x, y, distance } = getPointerMetrics(state.pointers);
  state.gesture = {
    x,
    y,
    distance,
    zoomLevel: state.zoomLevel,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
  };
};

export const createInitialState = () => ({
  imageUrl: undefined,
  imageWidth: 0,
  imageHeight: 0,
  zoomLevel: MIN_ZOOM,
  offsetX: 0,
  offsetY: 0,
  pointers: [],
  gesture: undefined,
});

export const setImage = (
  { state },
  { imageUrl, imageWidth, imageHeight } = {},
) => {
  state.imageUrl = imageUrl;
  state.imageWidth = imageWidth ?? 0;
  state.imageHeight = imageHeight ?? 0;
  state.pointers = [];
  state.gesture = undefined;
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
  state.pointers = [];
  state.gesture = undefined;
};

export const startPointer = ({ state }, { pointerId, x, y }) => {
  if (
    !hasImage(state) ||
    state.pointers.length >= 2 ||
    state.pointers.some((pointer) => pointer.pointerId === pointerId)
  ) {
    return;
  }

  state.pointers.push({ pointerId, x, y });
  rebaseGesture(state);
};

export const movePointer = ({ state }, { pointerId, x, y }) => {
  const pointer = state.pointers.find((item) => item.pointerId === pointerId);
  if (!pointer || !state.gesture) {
    return;
  }

  pointer.x = x;
  pointer.y = y;
  const current = getPointerMetrics(state.pointers);
  const start = state.gesture;
  const zoomRatio = start.distance > 0 ? current.distance / start.distance : 1;
  const zoomLevel = clamp(
    start.zoomLevel * zoomRatio,
    MIN_ZOOM,
    getEffectiveMaxZoom(state),
  );
  const scaleRatio = zoomLevel / start.zoomLevel;
  // Keep the image point under the fingers' midpoint anchored while zooming
  // and translating. With one pointer, this is simply a drag.
  const offsets = clampOffsets(state, {
    offsetX: current.x - (start.x - start.offsetX) * scaleRatio,
    offsetY: current.y - (start.y - start.offsetY) * scaleRatio,
    zoomLevel,
  });
  state.zoomLevel = zoomLevel;
  state.offsetX = offsets.offsetX;
  state.offsetY = offsets.offsetY;
  // Rebase after clamping so reversing direction at an edge responds immediately.
  rebaseGesture(state);
};

export const endPointer = ({ state }, { pointerId }) => {
  const index = state.pointers.findIndex(
    (pointer) => pointer.pointerId === pointerId,
  );
  if (index < 0) {
    return;
  }

  state.pointers.splice(index, 1);
  // Lifting either finger must not move the image or jump on the next drag.
  rebaseGesture(state);
};

export const cancelGesture = ({ state }) => {
  state.pointers = [];
  state.gesture = undefined;
};

export const setZoomLevel = ({ state }, { zoomLevel } = {}) => {
  const value = Number(zoomLevel);
  applyZoomLevel(state, Number.isFinite(value) ? value : MIN_ZOOM);
  rebaseGesture(state);
};

export const nudgeZoomLevel = ({ state }, { delta } = {}) => {
  applyZoomLevel(state, state.zoomLevel + (delta ?? 0));
  rebaseGesture(state);
};

export const selectImageUrl = ({ state }) => state.imageUrl;
export const selectIsDragging = ({ state }) => state.pointers.length > 0;
export const selectHasPointer = ({ state }, { pointerId }) =>
  state.pointers.some((pointer) => pointer.pointerId === pointerId);
export const selectViewportSize = () => VIEWPORT_SIZE;
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
    cropCursor:
      state.pointers.length > 0 ? "grabbing" : isReady ? "grab" : "default",
    imageFrameStyle: [
      "position:absolute",
      // Render in the same normalized coordinates used by pointer gestures and
      // crop export, so resizing the dialog preserves the selected image area.
      `left:${(offsets.offsetX / VIEWPORT_SIZE) * 100}%`,
      `top:${(offsets.offsetY / VIEWPORT_SIZE) * 100}%`,
      `width:${(width / VIEWPORT_SIZE) * 100}%`,
      `height:${(height / VIEWPORT_SIZE) * 100}%`,
      "pointer-events:none",
    ].join("; "),
    zoomLevel,
    zoomPercent: Math.round(zoomLevel * 100),
    minZoom: MIN_ZOOM,
    maxZoom,
    zoomStep: ZOOM_STEP,
  };
};
