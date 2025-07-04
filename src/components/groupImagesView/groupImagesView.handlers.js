// Zoom level persistence is now handled by Proxy in store.js

export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || '';
  
  store.setSearchQuery(searchQuery);
  render();
};

export const handleOnMount = (deps) => {
  const { store, render } = deps;
  
  // Load zoom level from localStorage
  try {
    const stored = localStorage.getItem('routevn-user-config');
    if (stored) {
      const config = JSON.parse(stored);
      const storedZoomLevel = config.groupImagesView?.zoomLevel;
      if (storedZoomLevel !== undefined) {
        console.log('handleOnMount - loading zoom level from localStorage:', storedZoomLevel);
        store.setZoomLevel(storedZoomLevel);
      }
    }
  } catch (e) {
    console.warn('Failed to load zoom level from localStorage:', e);
  }
  
  render();
};

export const handleZoomChange = (e, deps) => {
  const { store, render } = deps;
  const value = (e.target && e.target.value) || (e.currentTarget && e.currentTarget.value) || 1.0;
  const zoomLevel = parseFloat(value);
  
  console.log('handleZoomChange - zoomLevel:', zoomLevel);
  
  store.setZoomLevel(zoomLevel);
  render();
};

export const handleZoomOut = (e, deps) => {
  const { store, render, getRefIds } = deps;
  const currentZoom = store.getState().zoomLevel || 1.0;
  const newZoom = Math.max(0.5, currentZoom - 0.1);
  
  store.setZoomLevel(newZoom);
  
  // Update slider DOM element directly
  const sliderElement = getRefIds()['zoom-slider']?.elm;
  if (sliderElement) {
    sliderElement.value = newZoom;
  }
  
  render();
};

export const handleZoomIn = (e, deps) => {
  const { store, render, getRefIds } = deps;
  const currentZoom = store.getState().zoomLevel || 1.0;
  const newZoom = Math.min(4.0, currentZoom + 0.1);
  
  store.setZoomLevel(newZoom);
  
  // Update slider DOM element directly
  const sliderElement = getRefIds()['zoom-slider']?.elm;
  if (sliderElement) {
    sliderElement.value = newZoom;
  }
  
  render();
};

export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");
  
  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleImageItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("image-item-", "");
  
  // Forward image item selection to parent
  dispatchEvent(new CustomEvent("image-item-click", {
    detail: { itemId },
    bubbles: true,
    composed: true
  }));
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { dispatchEvent } = deps;
  const { files } = e.detail;
  const targetGroupId = e.currentTarget.id
    .replace("drag-drop-bar-", "")
    .replace("drag-drop-item-", "");
  
  // Forward file uploads to parent (parent will handle the actual upload logic)
  dispatchEvent(new CustomEvent("files-uploaded", {
    detail: { 
      files, 
      targetGroupId,
      originalEvent: e
    },
    bubbles: true,
    composed: true
  }));
};