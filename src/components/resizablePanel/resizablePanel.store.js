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

export const setResizeStart = (state, { startX, startWidth }) => {
  state.startX = startX;
  state.startWidth = startWidth;
};

export const initializePanelWidth = (state, attrs) => {
  const panelType = attrs.panelType || "file-explorer";

  // Set different default widths based on panel type
  let defaultWidth;
  if (panelType === "detail-panel") {
    defaultWidth = parseInt(attrs.w) || 270; // Default width for detail panels
  } else {
    defaultWidth = parseInt(attrs.w) || 280; // Normal width for file explorer
  }

  state.panelWidth = defaultWidth;
  state.startWidth = defaultWidth;
};

export const toViewData = ({ state, attrs }) => {
  return {
    w: parseInt(attrs.w) || 280,
    minW: parseInt(attrs["min-w"]) || 200,
    maxW: parseInt(attrs["max-w"]) || 600,
    resizeSide: attrs["resize-side"] || "right",
    panelType: attrs.panelType || "file-explorer",
    panelWidth: state.panelWidth,
    isResizing: state.isResizing,
  };
};
