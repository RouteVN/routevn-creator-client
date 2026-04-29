const toConfigPanelType = (panelType = "") => {
  return String(panelType).replace(/-([a-z])/g, (_, character) =>
    character.toUpperCase(),
  );
};

const getPanelWidthConfigKey = (panelType = "file-explorer") => {
  return `resizablePanel.${toConfigPanelType(panelType)}Width`;
};

const DEFAULT_PANEL_WIDTH = 280;
const DEFAULT_MIN_WIDTH = 200;
const DEFAULT_MAX_WIDTH = 600;

const toNumericCssLength = (value) => {
  const normalizedValue = `${value ?? ""}`.trim();
  const match = normalizedValue.match(/^(-?\d+(?:\.\d+)?)(?:px)?$/);
  return match ? Number(match[1]) : undefined;
};

const toInitialConstraint = (value, fallback) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  return toNumericCssLength(value);
};

const getElementWidth = (element) => {
  const width = element?.getBoundingClientRect?.().width;
  return Number.isFinite(width) ? width : undefined;
};

const getPanelElement = (payload) => {
  return payload?._event?.currentTarget?.parentElement;
};

const resolveWidthConstraint = ({ value, fallback, referenceElement } = {}) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  const numericValue = toNumericCssLength(value);
  if (numericValue !== undefined) {
    return numericValue;
  }

  const normalizedValue = `${value}`.trim();
  const amount = Number.parseFloat(normalizedValue);
  if (!Number.isFinite(amount)) {
    return fallback;
  }

  if (normalizedValue.endsWith("%")) {
    const referenceWidth = getElementWidth(referenceElement);
    return referenceWidth === undefined
      ? fallback
      : (referenceWidth * amount) / 100;
  }

  if (normalizedValue.endsWith("vw")) {
    const viewportWidth = globalThis.window?.innerWidth;
    return Number.isFinite(viewportWidth)
      ? (viewportWidth * amount) / 100
      : fallback;
  }

  return fallback;
};

const getResizeConstraints = ({ attrs, panelElement } = {}) => {
  const referenceElement = panelElement?.parentElement;

  return {
    minWidth: resolveWidthConstraint({
      value: attrs.minW,
      fallback: DEFAULT_MIN_WIDTH,
      referenceElement,
    }),
    maxWidth: resolveWidthConstraint({
      value: attrs.maxW,
      fallback: DEFAULT_MAX_WIDTH,
      referenceElement,
    }),
  };
};

export const handleBeforeMount = (deps) => {
  const { store, props: attrs, appService, uiConfig } = deps;
  store.setUiConfig({ uiConfig });

  const panelType = attrs.panelType || "file-explorer";

  const defaultWidth = attrs.w ?? DEFAULT_PANEL_WIDTH;
  const minWidth = toInitialConstraint(attrs.minW, DEFAULT_MIN_WIDTH);
  const maxWidth = toInitialConstraint(attrs.maxW, DEFAULT_MAX_WIDTH);

  const configKey = getPanelWidthConfigKey(panelType);
  const storedWidth = appService.getUserConfig(configKey);
  const defaultWidthIsNumeric = toNumericCssLength(defaultWidth) !== undefined;
  const width =
    defaultWidthIsNumeric && Number.isFinite(Number(storedWidth))
      ? Number(storedWidth)
      : defaultWidth;

  store.initializePanelWidth({
    width,
    minWidth,
    maxWidth,
  });
};

export const handleResizeStart = (deps, payload) => {
  const { store, render } = deps;

  payload._event.preventDefault();

  const startX = payload._event.clientX;
  const panelElement = getPanelElement(payload);
  const selectedPanelWidth = Number(store.selectPanelWidth());
  const startWidth =
    getElementWidth(panelElement) ??
    (Number.isFinite(selectedPanelWidth)
      ? selectedPanelWidth
      : DEFAULT_PANEL_WIDTH);

  store.startResize({ startX, startWidth });
  render();

  // Add global event listeners
  const handleMouseMove = (e) => handleResizeMove(deps, e, { panelElement });
  const handleMouseUp = (e) =>
    handleResizeEnd(deps, e, { handleMouseMove, handleMouseUp });

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
};

export const handleResizeHandleMouseEnter = (deps) => {
  const { store, render } = deps;
  store.setIsHandleHovered({ isHandleHovered: true });
  render();
};

export const handleResizeHandleMouseLeave = (deps) => {
  const { store, render } = deps;
  store.setIsHandleHovered({ isHandleHovered: false });
  render();
};

const handleResizeMove = (deps, payload, { panelElement } = {}) => {
  const { store, render, props: attrs, subject } = deps;

  if (!store.selectIsResizing()) return;
  const deltaX = payload.clientX - store.selectStartX();
  const { minWidth, maxWidth } = getResizeConstraints({
    attrs,
    panelElement,
  });

  // Determine resize direction based on resize-side attr
  const isResizeFromLeft = attrs.resizeSide === "left";
  const newWidth = isResizeFromLeft
    ? store.selectStartWidth() - deltaX // For left resize, movement is inverted
    : store.selectStartWidth() + deltaX; // For right resize, movement is normal

  store.setPanelWidth({
    width: newWidth,
    minWidth,
    maxWidth,
  });

  // Dispatch resize event via subject for other components to listen
  subject.dispatch("panel-resize", {
    panelType: attrs.panelType || "file-explorer",
    width: store.selectPanelWidth(),
    resizeSide: attrs.resizeSide || "right",
  });

  render();
};

const handleResizeEnd = (deps, _, listeners) => {
  const { store, render, props: attrs, appService, subject } = deps;
  const { handleMouseMove, handleMouseUp } = listeners;

  const panelType = attrs.panelType || "file-explorer";
  const configKey = getPanelWidthConfigKey(panelType);
  const selectedWidth = Number(store.selectPanelWidth());
  const currentWidth = Number.isFinite(selectedWidth)
    ? selectedWidth
    : store.selectStartWidth();
  appService.setUserConfig(configKey, currentWidth);

  // Dispatch resize-end event via subject
  subject.dispatch("panel-resize-end", {
    panelType,
    width: currentWidth,
    resizeSide: attrs.resizeSide || "right",
  });

  store.setIsResizing({ isResizing: false });
  render();

  // Remove global event listeners
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
};
