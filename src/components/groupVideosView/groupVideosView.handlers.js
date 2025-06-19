export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || '';
  
  store.setSearchQuery(searchQuery);
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
  dispatchEvent(new CustomEvent("video-item-click", {
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