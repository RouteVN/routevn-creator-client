export const createInitialState = () => ({
  panelWidth: 280, // Will be updated based on attrs
  isResizing: false,
  isHandleHovered: false,
  isTouchMode: false,
  startX: 0,
  startWidth: 280,
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const setPanelWidth = ({ state, props: attrs }, { width } = {}) => {
  // Use attrs for min/max if available, otherwise use defaults
  const minWidth = parseInt(attrs.minW) || 200;
  const maxWidth = parseInt(attrs.maxW) || 600;
  const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, width));
  state.panelWidth = constrainedWidth;
};

export const setIsResizing = ({ state }, { isResizing } = {}) => {
  state.isResizing = isResizing;
};

export const setIsHandleHovered = ({ state }, { isHandleHovered } = {}) => {
  state.isHandleHovered = isHandleHovered;
};

export const startResize = ({ state }, { startX, startWidth } = {}) => {
  state.isResizing = true;
  state.startX = startX;
  state.startWidth = startWidth;
};

export const initializePanelWidth = (
  { state },
  { width, minWidth, maxWidth } = {},
) => {
  const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, width));
  state.panelWidth = constrainedWidth;
  state.startWidth = constrainedWidth;
};

export const selectViewData = ({ state, props: attrs }) => {
  const panelType = attrs.panelType || "file-explorer";
  const shouldHideForTouch =
    state.isTouchMode &&
    (panelType === "file-explorer" || panelType === "detail-panel");

  return {
    w: parseInt(attrs.w) || 280,
    minW: parseInt(attrs.minW) || 200,
    maxW: parseInt(attrs.maxW) || 600,
    resizeSide: attrs.resizeSide || "right",
    panelType,
    panelWidth: state.panelWidth,
    isResizing: state.isResizing,
    dividerColor: state.isHandleHovered ? "ac" : "mu",
    panelDisplayStyle: shouldHideForTouch
      ? "display: none;"
      : "overflow: visible;",
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
