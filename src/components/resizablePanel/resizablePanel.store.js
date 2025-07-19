export const INITIAL_STATE = Object.freeze({
  panelWidth: 280, // Will be updated based on attrs
  isResizing: false,
  startX: 0,
  startWidth: 280,
});

export const setPanelWidth = (state, width, attrs = {}) => {
  // Use attrs for min/max if available, otherwise use defaults
  const minWidth = parseInt(attrs["min-w"]) || 200;
  const maxWidth = parseInt(attrs["max-w"]) || 600;
  const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, width));
  state.panelWidth = constrainedWidth;
};

export const setIsResizing = (state, isResizing) => {
  state.isResizing = isResizing;
};

export const startResize = (state, { startX, startWidth }) => {
  state.isResizing = true;
  state.startX = startX;
  state.startWidth = startWidth;
};

export const initializePanelWidth = (state, { width, minWidth, maxWidth }) => {
  const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, width));
  state.panelWidth = constrainedWidth;
  state.startWidth = constrainedWidth;
};

export const toViewData = ({ state, attrs }) => {
  return {
    w: parseInt(attrs.w) || 280,
    minW: parseInt(attrs["min-w"]) || 200,
    maxW: parseInt(attrs["max-w"]) || 600,
    resizeSide: attrs["resize-side"] || "right",
    panelType: attrs["panel-type"] || "file-explorer",
    panelWidth: state.panelWidth,
    isResizing: state.isResizing,
  };
};

export const selectPanelWidth = ({ state }) => {
  return state.panelWidth;
};

export const selectIsResizing = ({ state }) => {
  return state.isResizing;
};

export const selectStartX = ({ state }) => {
  return state.startX;
};

export const selectStartWidth = ({ state }) => {
  return state.startWidth;
};
