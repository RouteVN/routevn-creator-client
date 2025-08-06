export const handleBeforeMount = (deps) => {
  const { store, attrs, userConfig } = deps;

  const panelType = attrs["panel-type"] || "file-explorer";

  // Use the template's w attribute as the default width
  const defaultWidth = parseInt(attrs.w) || 280;
  const minWidth = parseInt(attrs["min-w"]) || 200;
  const maxWidth = parseInt(attrs["max-w"]) || 600;

  // Load from localStorage using userConfig pattern
  const configKey = `resizablePanel.${panelType}Width`;
  const storedWidth = userConfig.get(configKey);
  const width = storedWidth ? parseInt(storedWidth, 10) : defaultWidth;

  store.initializePanelWidth({
    width,
    minWidth,
    maxWidth,
  });
};

export const handleResizeStart = (e, deps) => {
  const { store, render, attrs } = deps;

  e.preventDefault();
  console.log("🔧 Resizable panel resize start triggered");

  const startX = e.clientX;
  const startWidth = store.selectPanelWidth();

  store.startResize({ startX, startWidth });
  render();

  // Add global event listeners
  const handleMouseMove = (e) => handleResizeMove(e, deps);
  const handleMouseUp = (e) =>
    handleResizeEnd(e, deps, { handleMouseMove, handleMouseUp });

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
};

const handleResizeMove = (e, deps) => {
  const { store, render, attrs, subject } = deps;

  if (!store.selectIsResizing()) return;

  const deltaX = e.clientX - store.selectStartX();

  // Determine resize direction based on resize-side attr
  const isResizeFromLeft = attrs["resize-side"] === "left";
  const newWidth = isResizeFromLeft
    ? store.selectStartWidth() - deltaX // For left resize, movement is inverted
    : store.selectStartWidth() + deltaX; // For right resize, movement is normal

  store.setPanelWidth(newWidth, attrs);

  // Dispatch resize event via subject for other components to listen
  if (subject) {
    subject.dispatch("panel-resize", {
      panelType: attrs["panel-type"] || "file-explorer",
      width: store.selectPanelWidth(),
      resizeSide: attrs["resize-side"] || "right",
    });
  }

  render();
};

const handleResizeEnd = (e, deps, listeners) => {
  const { store, render, attrs, userConfig, subject } = deps;
  const { handleMouseMove, handleMouseUp } = listeners;

  console.log("🔧 Resizable panel resize end");

  // Save final width to localStorage using userConfig pattern
  const panelType = attrs["panel-type"] || "file-explorer";
  const configKey = `resizablePanel.${panelType}Width`;
  const currentWidth = store.selectPanelWidth();
  userConfig.set(configKey, currentWidth.toString());

  // Dispatch resize-end event via subject
  if (subject) {
    subject.dispatch("panel-resize-end", {
      panelType,
      width: currentWidth,
      resizeSide: attrs["resize-side"] || "right",
    });
  }

  store.setIsResizing(false);
  render();

  // Remove global event listeners
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
};
