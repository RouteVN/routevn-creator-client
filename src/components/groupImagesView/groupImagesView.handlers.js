export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleBeforeMount = (deps) => {
  const { createZoomHandlers } = deps;
  const zoomHandlers = createZoomHandlers("groupImagesView", deps);
  return zoomHandlers.handleBeforeMount();
};

export const handleZoomChange = (e, deps) => {
  const { createZoomHandlers } = deps;
  const zoomHandlers = createZoomHandlers("groupImagesView", deps);
  return zoomHandlers.handleZoomChange(e);
};

export const handleZoomOut = (_, deps) => {
  const { createZoomHandlers } = deps;
  const zoomHandlers = createZoomHandlers("groupImagesView", deps);
  return zoomHandlers.handleZoomOut();
};

export const handleZoomIn = (_, deps) => {
  const { createZoomHandlers } = deps;
  const zoomHandlers = createZoomHandlers("groupImagesView", deps);
  return zoomHandlers.handleZoomIn();
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
