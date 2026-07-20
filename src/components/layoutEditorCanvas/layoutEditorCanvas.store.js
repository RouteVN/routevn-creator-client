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
  activeRenderRequestId: undefined,
  selectionOccurrencesById: {},
  selectionOccurrenceIdsByOwner: {},
  hoveredSelection: undefined,
  selectedOccurrenceId: undefined,
  selectedOccurrenceOwnerId: undefined,
  pointerGesture: undefined,
  pendingClickGesture: undefined,
  doubleClickSequence: undefined,
  lastPointerPosition: undefined,
  deepSelectActive: false,
  hoverFrameId: undefined,
  canvasRenderElements: [],
  canvasUnitsPerCssPixel: 1,
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

export const setActiveRenderRequestId = ({ state }, { requestId } = {}) => {
  state.activeRenderRequestId = requestId;
};

export const setSelectionOccurrences = (
  { state },
  { occurrencesById = {}, occurrenceIdsByOwner = {} } = {},
) => {
  state.selectionOccurrencesById = occurrencesById;
  state.selectionOccurrenceIdsByOwner = occurrenceIdsByOwner;

  const selectedOccurrence = occurrencesById[state.selectedOccurrenceId];
  if (
    state.selectedOccurrenceId &&
    selectedOccurrence?.ownerItemId !== state.selectedOccurrenceOwnerId
  ) {
    state.selectedOccurrenceId = undefined;
    state.selectedOccurrenceOwnerId = undefined;
  }
};

export const setHoveredSelection = ({ state }, { selection } = {}) => {
  state.hoveredSelection = selection;
};

export const clearHoveredSelection = ({ state }, _payload = {}) => {
  state.hoveredSelection = undefined;
};

export const setSelectedOccurrence = (
  { state },
  { occurrenceId, ownerItemId } = {},
) => {
  state.selectedOccurrenceId = occurrenceId;
  state.selectedOccurrenceOwnerId = ownerItemId;
};

export const clearSelectedOccurrence = ({ state }, _payload = {}) => {
  state.selectedOccurrenceId = undefined;
  state.selectedOccurrenceOwnerId = undefined;
};

export const setPointerGesture = ({ state }, { gesture } = {}) => {
  state.pointerGesture = gesture;
};

export const clearPointerGesture = ({ state }, _payload = {}) => {
  state.pointerGesture = undefined;
};

export const setPendingClickGesture = ({ state }, { gesture } = {}) => {
  state.pendingClickGesture = gesture;
};

export const clearPendingClickGesture = ({ state }, _payload = {}) => {
  state.pendingClickGesture = undefined;
};

export const setDoubleClickSequence = ({ state }, { sequence } = {}) => {
  state.doubleClickSequence = sequence;
};

export const clearDoubleClickSequence = ({ state }, _payload = {}) => {
  state.doubleClickSequence = undefined;
};

export const setLastPointerPosition = ({ state }, { position } = {}) => {
  state.lastPointerPosition = position;
};

export const clearLastPointerPosition = ({ state }, _payload = {}) => {
  state.lastPointerPosition = undefined;
};

export const setDeepSelectActive = ({ state }, { value = false } = {}) => {
  state.deepSelectActive = value === true;
};

export const setHoverFrameId = ({ state }, { frameId } = {}) => {
  state.hoverFrameId = frameId;
};

export const setCanvasRenderState = (
  { state },
  { elements = [], canvasUnitsPerCssPixel = 1 } = {},
) => {
  state.canvasRenderElements = elements;
  state.canvasUnitsPerCssPixel = canvasUnitsPerCssPixel;
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

export const selectActiveRenderRequestId = ({ state }) => {
  return state.activeRenderRequestId;
};

export const selectSelectionOccurrencesById = ({ state }) => {
  return state.selectionOccurrencesById;
};

export const selectHoveredSelection = ({ state }) => {
  return state.hoveredSelection;
};

export const selectSelectedOccurrenceId = ({ state }) => {
  return state.selectedOccurrenceId;
};

export const selectSelectedOccurrenceOwnerId = ({ state }) => {
  return state.selectedOccurrenceOwnerId;
};

export const selectResolvedSelectedOccurrenceId = ({ state, props }) => {
  return (
    state.selectedOccurrenceId ??
    state.selectionOccurrenceIdsByOwner[props.selectedItemId]?.[0]
  );
};

export const selectPointerGesture = ({ state }) => {
  return state.pointerGesture;
};

export const selectPendingClickGesture = ({ state }) => {
  return state.pendingClickGesture;
};

export const selectDoubleClickSequence = ({ state }) => {
  return state.doubleClickSequence;
};

export const selectLastPointerPosition = ({ state }) => {
  return state.lastPointerPosition;
};

export const selectDeepSelectActive = ({ state }) => {
  return state.deepSelectActive;
};

export const selectHoverFrameId = ({ state }) => {
  return state.hoverFrameId;
};

export const selectCanvasRenderState = ({ state }) => {
  return {
    elements: state.canvasRenderElements,
    canvasUnitsPerCssPixel: state.canvasUnitsPerCssPixel,
  };
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
