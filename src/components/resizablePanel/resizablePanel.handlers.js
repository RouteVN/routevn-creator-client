export const handleBeforeMount = (deps) => {
  const { store, props: attrs, appService } = deps;

  const panelType = attrs.panelType || "file-explorer";

  // Use the template's w attribute as the default width
  const defaultWidth = parseInt(attrs.w) || 280;
  const minWidth = parseInt(attrs.minW) || 200;
  const maxWidth = parseInt(attrs.maxW) || 600;

  // Load from localStorage using userConfig pattern
  const configKey = `resizablePanel.${panelType}Width`;
  const storedWidth = appService.getUserConfig(configKey);
  const width = storedWidth ? parseInt(storedWidth, 10) : defaultWidth;

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
  const startWidth = store.selectPanelWidth();

  store.startResize({ startX, startWidth });
  render();

  // Add global event listeners
  const handleMouseMove = (e) => handleResizeMove(deps, e);
  const handleMouseUp = (e) =>
    handleResizeEnd(deps, e, { handleMouseMove, handleMouseUp });

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
};

const handleResizeMove = (deps, payload) => {
  const { store, render, props: attrs, subject } = deps;

  if (!store.selectIsResizing()) return;
  const deltaX = payload.clientX - store.selectStartX();

  // Determine resize direction based on resize-side attr
  const isResizeFromLeft = attrs.resizeSide === "left";
  const newWidth = isResizeFromLeft
    ? store.selectStartWidth() - deltaX // For left resize, movement is inverted
    : store.selectStartWidth() + deltaX; // For right resize, movement is normal

  store.setPanelWidth({ width: newWidth });

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

  // Save final width to localStorage using userConfig pattern
  const panelType = attrs.panelType || "file-explorer";
  const configKey = `resizablePanel.${panelType}Width`;
  const currentWidth = store.selectPanelWidth();
  appService.setUserConfig(configKey, currentWidth.toString());

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
