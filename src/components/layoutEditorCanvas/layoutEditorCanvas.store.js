import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";

export const createInitialState = () => ({
  isGraphicsReady: false,
  isDragging: false,
  dragMode: "move",
  dragStartPosition: undefined,
  pendingUpdatedItem: undefined,
  fileContentCacheById: {},
});

export const setGraphicsReady = ({ state }, { value = false } = {}) => {
  state.isGraphicsReady = value === true;
};

export const startDragging = ({ state }, { dragMode = "move" } = {}) => {
  state.isDragging = true;
  state.dragMode = dragMode;
};

export const setDragStartPosition = (
  { state },
  { x, y, itemStartX, itemStartY, itemStartWidth, itemStartHeight } = {},
) => {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof itemStartX !== "number" ||
    typeof itemStartY !== "number"
  ) {
    return;
  }

  state.dragStartPosition = {
    x,
    y,
    itemStartX,
    itemStartY,
  };

  if (typeof itemStartWidth === "number") {
    state.dragStartPosition.itemStartWidth = itemStartWidth;
  }

  if (typeof itemStartHeight === "number") {
    state.dragStartPosition.itemStartHeight = itemStartHeight;
  }
};

export const stopDragging = ({ state }, _payload = {}) => {
  state.isDragging = false;
  state.dragMode = "move";
  state.dragStartPosition = undefined;
};

export const setPendingUpdatedItem = ({ state }, { updatedItem } = {}) => {
  state.pendingUpdatedItem = updatedItem;
};

export const clearPendingUpdatedItem = ({ state }, _payload = {}) => {
  state.pendingUpdatedItem = undefined;
};

export const cacheFileContent = ({ state }, { fileId, url } = {}) => {
  if (!fileId || !url) {
    return;
  }

  state.fileContentCacheById[fileId] = url;
};

export const clearCachedFileContent = ({ state }, { fileId } = {}) => {
  if (!fileId) {
    return;
  }

  delete state.fileContentCacheById[fileId];
};

export const clearFileContentCache = ({ state }, _payload = {}) => {
  state.fileContentCacheById = {};
};

export const selectCachedFileContent = ({ state }, { fileId } = {}) => {
  if (!fileId) {
    return undefined;
  }

  return state.fileContentCacheById[fileId];
};

export const selectDragging = ({ state }) => {
  return {
    isDragging: state.isDragging,
    dragMode: state.dragMode,
    dragStartPosition: state.dragStartPosition,
  };
};

export const selectIsGraphicsReady = ({ state }) => {
  return state.isGraphicsReady === true;
};

export const selectPendingUpdatedItem = ({ state }) => {
  return state.pendingUpdatedItem;
};

export const selectViewData = ({ state, props }) => {
  const resolution = requireProjectResolution(
    props.resolution ?? DEFAULT_PROJECT_RESOLUTION,
    "Layout editor canvas resolution",
  );

  return {
    canvasAspectRatio: formatProjectResolutionAspectRatio(resolution),
    canvasCursor: state.isDragging ? "grabbing" : "default",
  };
};
