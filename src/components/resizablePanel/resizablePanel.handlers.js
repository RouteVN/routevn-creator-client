export const handleAfterMount = async (deps) => {
  const { store, attrs } = deps;
  store.initializePanelWidth(attrs);
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

  // Determine resize direction based on resizeFrom attr
  const isResizeFromLeft = attrs.resizeFrom === "left";
  const newWidth = isResizeFromLeft
    ? state.startWidth - deltaX // For left resize, movement is inverted
    : state.startWidth + deltaX; // For right resize, movement is normal

  store.setPanelWidth(newWidth, attrs);

  render();
};

const handleResizeEnd = (e, deps, listeners) => {
  const { store, render } = deps;
  const { handleMouseMove, handleMouseUp } = listeners;

  console.log("🔧 Resizable panel resize end");

  store.setIsResizing(false);
  render();

  // Remove global event listeners
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
};
