const DEFAULT_PANEL_WIDTH = 280;
const DEFAULT_MIN_WIDTH = 200;
const DEFAULT_MAX_WIDTH = 600;

const toNumericCssLength = (value) => {
  const normalizedValue = `${value ?? ""}`.trim();
  const match = normalizedValue.match(/^(-?\d+(?:\.\d+)?)(?:px)?$/);
  return match ? Number(match[1]) : undefined;
};

const toCssLength = (value, fallback) => {
  const normalizedValue = `${value ?? fallback ?? ""}`.trim();
  if (!normalizedValue) {
    return;
  }

  const numericValue = toNumericCssLength(normalizedValue);
  return numericValue === undefined ? normalizedValue : `${numericValue}px`;
};

const constrainNumericWidth = ({ width, minWidth, maxWidth } = {}) => {
  const numericWidth = Number(width);
  if (!Number.isFinite(numericWidth)) {
    return width;
  }

  const effectiveMinWidth = Number.isFinite(minWidth) ? minWidth : -Infinity;
  const effectiveMaxWidth = Number.isFinite(maxWidth) ? maxWidth : Infinity;
  return Math.max(effectiveMinWidth, Math.min(effectiveMaxWidth, numericWidth));
};

export const createInitialState = () => ({
  panelWidth: DEFAULT_PANEL_WIDTH, // Will be updated based on attrs
  isResizing: false,
  isHandleHovered: false,
  isTouchMode: false,
  startX: 0,
  startWidth: DEFAULT_PANEL_WIDTH,
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const setPanelWidth = (
  { state, props: attrs },
  { width, minWidth, maxWidth } = {},
) => {
  const effectiveMinWidth =
    minWidth ?? toNumericCssLength(attrs.minW) ?? DEFAULT_MIN_WIDTH;
  const effectiveMaxWidth =
    maxWidth ?? toNumericCssLength(attrs.maxW) ?? DEFAULT_MAX_WIDTH;

  state.panelWidth = constrainNumericWidth({
    width,
    minWidth: effectiveMinWidth,
    maxWidth: effectiveMaxWidth,
  });
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
  const constrainedWidth = constrainNumericWidth({
    width,
    minWidth,
    maxWidth,
  });
  state.panelWidth = constrainedWidth;
  state.startWidth = Number.isFinite(Number(constrainedWidth))
    ? Number(constrainedWidth)
    : DEFAULT_PANEL_WIDTH;
};

export const selectViewData = ({ state, props: attrs }) => {
  const panelType = attrs.panelType || "file-explorer";
  const shouldHideForTouch =
    state.isTouchMode &&
    (panelType === "file-explorer" || panelType === "detail-panel");

  return {
    w: toNumericCssLength(attrs.w) ?? DEFAULT_PANEL_WIDTH,
    minW: toNumericCssLength(attrs.minW) ?? DEFAULT_MIN_WIDTH,
    maxW: toNumericCssLength(attrs.maxW) ?? DEFAULT_MAX_WIDTH,
    resizeSide: attrs.resizeSide || "right",
    panelType,
    panelWidth: state.panelWidth,
    isResizing: state.isResizing,
    dividerColor: state.isHandleHovered ? "ac" : "mu",
    panelMinWidthStyle: toCssLength(attrs.minW, DEFAULT_MIN_WIDTH),
    panelMaxWidthStyle: toCssLength(attrs.maxW, DEFAULT_MAX_WIDTH),
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
