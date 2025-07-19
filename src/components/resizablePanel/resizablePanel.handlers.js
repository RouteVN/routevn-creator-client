export const handleBeforeMount = (deps) => {
  const { store, attrs, userConfig } = deps;

  const panelType = attrs.panelType || "file-explorer";

  // Set different default widths based on panel type
  let defaultWidth;
  if (panelType === "detail-panel") {
    defaultWidth = parseInt(attrs.w) || 270; // Default width for detail panels
  } else {
    defaultWidth = parseInt(attrs.w) || 280; // Normal width for file explorer
  }

  // Load from localStorage using userConfig pattern
  const configKey = `resizablePanel.${panelType}Width`;
  const storedWidth = userConfig.get(configKey);
  const width = storedWidth ? parseInt(storedWidth, 10) : defaultWidth;

  store.initializePanelWidth(attrs);
  store.setPanelWidth(width, attrs);
};

export const handleResizeStart = (e, deps) => {
  const { store, render, attrs } = deps;

  e.preventDefault();
  console.log("🔧 Resizable panel resize start triggered");

  const startX = e.clientX;
  const startWidth = store.getState().panelWidth;

  store.setIsResizing(true);
  store.setResizeStart({ startX, startWidth });
  render();

  // Add global event listeners
  const handleMouseMove = (e) => handleResizeMove(e, deps);
  const handleMouseUp = (e) =>
    handleResizeEnd(e, deps, { handleMouseMove, handleMouseUp });

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
};

const handleResizeMove = (e, deps) => {
  const { store, render, dispatchEvent, attrs } = deps;
  const state = store.getState();

  if (!state.isResizing) return;

  const deltaX = e.clientX - state.startX;

  // Determine resize direction based on resize-side attr
  const isResizeFromLeft = attrs["resize-side"] === "left";
  const newWidth = isResizeFromLeft
    ? state.startWidth - deltaX // For left resize, movement is inverted
    : state.startWidth + deltaX; // For right resize, movement is normal

  store.setPanelWidth(newWidth, attrs);

  render();
};

const handleResizeEnd = (e, deps, listeners) => {
  const { store, render, attrs, userConfig } = deps;
  const { handleMouseMove, handleMouseUp } = listeners;

  console.log("🔧 Resizable panel resize end");

  // Save final width to localStorage using userConfig pattern
  const panelType = attrs.panelType || "file-explorer";
  const configKey = `resizablePanel.${panelType}Width`;
  const currentWidth = store.getState().panelWidth;
  userConfig.set(configKey, currentWidth.toString());

  store.setIsResizing(false);
  render();

  // Remove global event listeners
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
};
