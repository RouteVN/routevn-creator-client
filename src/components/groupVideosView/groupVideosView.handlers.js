export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleBeforeMount = (deps) => {
  const { createZoomHandlers } = deps;
  const zoomHandlers = createZoomHandlers("groupVideosView", deps);
  return zoomHandlers.handleBeforeMount();
};

export const handleZoomChange = (e, deps) => {
  const { createZoomHandlers } = deps;
  const zoomHandlers = createZoomHandlers("groupVideosView", deps);
  return zoomHandlers.handleZoomChange(e);
};

export const handleZoomOut = (_, deps) => {
  const { createZoomHandlers } = deps;
  const zoomHandlers = createZoomHandlers("groupVideosView", deps);
  return zoomHandlers.handleZoomOut();
};

export const handleZoomIn = (_, deps) => {
  const { createZoomHandlers } = deps;
  const zoomHandlers = createZoomHandlers("groupVideosView", deps);
  return zoomHandlers.handleZoomIn();
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
