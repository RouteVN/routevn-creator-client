export const handleDataChanged = (e, deps) => {
  const { dispatchEvent } = deps;
  
  // Forward data-changed event to parent
  dispatchEvent(new CustomEvent('data-changed', {
    detail: e.detail,
    bubbles: true,
    composed: true
  }));
};

export const handleResizeStart = (e, deps) => {
  const { store, render, props } = deps;
  
  e.preventDefault();
  console.log('🔧 Resizable panel resize start triggered');
  
  const startX = e.clientX;
  const startWidth = store.getState().panelWidth;
  
  store.setIsResizing(true);
  store.setResizeStart({ startX, startWidth });
  render();
  
  // Add global event listeners
  const handleMouseMove = (e) => handleResizeMove(e, deps);
  const handleMouseUp = (e) => handleResizeEnd(e, deps, { handleMouseMove, handleMouseUp });
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};

const handleResizeMove = (e, deps) => {
  const { store, render, dispatchEvent, props } = deps;
  const state = store.getState();
  
  if (!state.isResizing) return;
  
  const deltaX = e.clientX - state.startX;
  const newWidth = state.startWidth + deltaX;
  
  console.log('🔧 Resizable panel resizing to:', newWidth);
  
  store.setPanelWidth(newWidth);
  
  // Emit resize event for any parent components that need to know
  dispatchEvent(new CustomEvent('panel-width-changed', {
    detail: { width: newWidth },
    bubbles: true,
    composed: true
  }));
  
  render();
};

const handleResizeEnd = (e, deps, listeners) => {
  const { store, render } = deps;
  const { handleMouseMove, handleMouseUp } = listeners;
  
  console.log('🔧 Resizable panel resize end');
  
  store.setIsResizing(false);
  render();
  
  // Remove global event listeners
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
};

