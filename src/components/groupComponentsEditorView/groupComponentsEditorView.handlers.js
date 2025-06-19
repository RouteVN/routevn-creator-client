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

export const handleComponentItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("component-item-", "");
  
  // Forward component item selection to parent
  dispatchEvent(new CustomEvent("component-item-click", {
    detail: { itemId },
    bubbles: true,
    composed: true
  }));
};

export const handleAddComponentClick = (e, deps) => {
  const { dispatchEvent } = deps;
  e.stopPropagation(); // Prevent group click
  
  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-component-button-", "");
  
  dispatchEvent(new CustomEvent("component-add-click", {
    detail: { groupId },
    bubbles: true,
    composed: true
  }));
};

export const handleComponentItemDoubleClick = (e, deps) => {
  const { subject } = deps;
  const itemId = e.currentTarget.id.replace("component-item-", "");
  
  subject.dispatch('redirect', {
    path: '/project/resources/component-editor',
    payload: {
      componentId: itemId
    }
  });
};

export const handleComponentItemRightClick = (e, deps) => {
  const { store, render } = deps;
  const itemId = e.currentTarget.id.replace("component-item-", "");
  
  store.showDropdownMenuComponentItem({
    position: {
      x: e.detail.x,
      y: e.detail.y,
    },
    id: itemId,
  });
  render();
};

export const handleDropdownMenuClickOverlay = (e, deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (e, deps) => {
  const { store, render } = deps;
  const value = e.detail.value;
  
  store.hideDropdownMenu();
  render();
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