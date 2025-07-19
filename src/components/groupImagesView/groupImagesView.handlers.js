export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleBeforeMount = (deps) => {
  const { store, render, userConfig } = deps;

  const zoomLevel = userConfig.get("groupImagesView.zoomLevel");
  store.setZoomLevel(zoomLevel || 1.0);

  render();
};

export const handleZoomChange = (e, deps) => {
  const { store, render, userConfig } = deps;
  const value = (e.currentTarget && e.currentTarget.value) || 1.0;
  const zoomLevel = parseFloat(value);

  userConfig.set("groupImagesView.zoomLevel", zoomLevel.toFixed(1));

  store.setZoomLevel(zoomLevel);
  render();
};

export const handleZoomOut = (e, deps) => {
  const { store, render, userConfig, getRefIds } = deps;
  const currentZoom = store.selectCurrentZoomLevel();
  const newZoom = Math.max(0.5, currentZoom - 0.1);

  store.setZoomLevel(newZoom);

  // Update slider DOM element directly
  const sliderElement = getRefIds()["zoom-slider"]?.elm;
  if (sliderElement) {
    sliderElement.value = newZoom;
  }

  userConfig.set("groupImagesView.zoomLevel", newZoom.toFixed(1));

  render();
};

export const handleZoomIn = (e, deps) => {
  const { store, render, userConfig, getRefIds } = deps;
  const currentZoom = store.selectCurrentZoomLevel();
  const newZoom = Math.min(4.0, currentZoom + 0.1);

  store.setZoomLevel(newZoom);

  // Update slider DOM element directly
  const sliderElement = getRefIds()["zoom-slider"]?.elm;
  if (sliderElement) {
    sliderElement.value = newZoom;
  }

  userConfig.set("groupImagesView.zoomLevel", newZoom.toFixed(1));

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
  dispatchEvent(
    new CustomEvent("image-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleImageDoubleClick = (e, deps) => {
  const { store, render, props = {} } = deps;

  // Get the fileId from the image item
  const itemId = e.currentTarget.id.replace("image-item-", "");
  const flatGroups = props.flatGroups || [];
  let selectedImage = null;

  for (const group of flatGroups) {
    if (group.children) {
      selectedImage = group.children.find((item) => item.id === itemId);
      if (selectedImage) break;
    }
  }

  store.showFullImagePreview(selectedImage.fileId);
  render();
};

export const handlePreviewOverlayClick = (_, deps) => {
  const { store, render } = deps;

  store.hideFullImagePreview();
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { dispatchEvent } = deps;
  const { files } = e.detail;
  const targetGroupId = e.currentTarget.id
    .replace("drag-drop-bar-", "")
    .replace("drag-drop-item-", "");

  // Forward file uploads to parent (parent will handle the actual upload logic)
  dispatchEvent(
    new CustomEvent("files-uploaded", {
      detail: {
        files,
        targetGroupId,
        originalEvent: e,
      },
      bubbles: true,
      composed: true,
    }),
  );
};
