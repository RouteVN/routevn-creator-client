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

export const handleTypographyItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("typography-item-", "");
  
  // Forward typography item selection to parent
  dispatchEvent(new CustomEvent("typography-item-click", {
    detail: { itemId },
    bubbles: true,
    composed: true
  }));
};

export const handleAddTypographyClick = (e, deps) => {
  const { store, render } = deps;
  e.stopPropagation(); // Prevent group click
  
  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-typography-button-", "");
  store.setTargetGroupId(groupId);
  
  // Toggle dialog open
  store.toggleDialog();
  render();
};

export const handleCloseDialog = (e, deps) => {
  const { store, render } = deps;
  
  // Close dialog
  store.toggleDialog();
  render();
};

export const handleFormActionClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;
  
  // Check which button was clicked
  const actionId = e.detail.actionId;
  
  if (actionId === 'submit') {
    // Get form values from the event detail - it's in formValues
    const formData = e.detail.formValues;
    
    // Get the target group ID from store - access the internal state properly
    const storeState = store.getState ? store.getState() : store._state || store.state;
    const targetGroupId = storeState.targetGroupId;
    
    // Forward typography creation to parent
    dispatchEvent(new CustomEvent("typography-created", {
      detail: { 
        groupId: targetGroupId,
        name: formData.name,
        fontSize: formData.fontSize,
        fontColor: formData.fontColor,
        fontWeight: formData.fontWeight
      },
      bubbles: true,
      composed: true
    }));
    
    // Close dialog
    store.toggleDialog();
    render();
  }
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