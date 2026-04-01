import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";

export const createInitialState = () => ({
  isDragging: false,
  dragStartPosition: undefined,
  pendingUpdatedItem: undefined,
  fileContentCacheById: {},
});

export const startDragging = ({ state }, _payload = {}) => {
  state.isDragging = true;
};

export const setDragStartPosition = (
  { state },
  { x, y, itemStartX, itemStartY } = {},
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
};

export const stopDragging = ({ state }, _payload = {}) => {
  state.isDragging = false;
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
    dragStartPosition: state.dragStartPosition,
  };
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
    canvasCursor: state.isDragging ? "all-scroll" : "default",
  };
};
