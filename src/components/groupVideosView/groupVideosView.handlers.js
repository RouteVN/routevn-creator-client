export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleBeforeMount = (deps) => {
  const { store, render, userConfig } = deps;

  const zoomLevel = userConfig.get("groupVideosView.zoomLevel");
  store.setZoomLevel(zoomLevel || 1.0);

  render();
};

export const handleZoomChange = (e, deps) => {
  const { store, render, userConfig } = deps;
  const value = (e.currentTarget && e.currentTarget.value) || 1.0;
  const zoomLevel = parseFloat(value);

  userConfig.set("groupVideosView.zoomLevel", zoomLevel.toFixed(1));

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

  userConfig.set("groupVideosView.zoomLevel", newZoom.toFixed(1));

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

  userConfig.set("groupVideosView.zoomLevel", newZoom.toFixed(1));

  render();
};

export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");

  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleVideoItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("video-item-", "");

  // Forward video item selection to parent
  dispatchEvent(
    new CustomEvent("video-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleVideoThumbnailDoubleClick = async (e, deps) => {
  const { store, render, httpClient, props = {} } = deps;
  const itemId = e.currentTarget.id.replace("video-item-", "");

  const flatGroups = props.flatGroups || [];
  let selectedVideo = null;

  for (const group of flatGroups) {
    if (group.children) {
      selectedVideo = group.children.find((item) => item.id === itemId);
      if (selectedVideo) break;
    }
  }

  // initial render for the loading screen
  store.setVideoVisible(selectedVideo);
  render();

  const { url } = await httpClient.creator.getFileContent({
    fileId: selectedVideo.fileId,
    projectId: "someprojectId",
  });

  // add updated url to object and render again
  const updatedVideo = { ...selectedVideo, url };

  store.setVideoVisible(updatedVideo);
  render();
};

export const handleOutsideVideoClick = (e, deps) => {
  const { store, render } = deps;
  store.setVideoNotVisible();
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
