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

export const handlePlacementItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("placement-item-", "");
  
  // Forward placement item selection to parent
  dispatchEvent(new CustomEvent("placement-item-click", {
    detail: { itemId },
    bubbles: true,
    composed: true
  }));
};

export const handlePlacementItemDoubleClick = (e, deps) => {
  const { store, render, props } = deps;
  const itemId = e.currentTarget.id.replace("placement-item-", "");
  
  // Find the item data from props
  const flatGroups = props.flatGroups || [];
  let itemData = null;
  
  for (const group of flatGroups) {
    const foundItem = group.children?.find(child => child.id === itemId);
    if (foundItem) {
      itemData = foundItem;
      break;
    }
  }
  
  if (itemData) {
    // Set edit mode with item data
    store.setEditMode(true, itemId, itemData);
    
    // Open dialog
    if (!store.getState().isDialogOpen) {
      store.toggleDialog();
    }
    
    render();
  }
};

export const handleAddPlacementClick = (e, deps) => {
  const { store, render } = deps;
  e.stopPropagation(); // Prevent group click
  
  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-placement-button-", "");
  store.setTargetGroupId(groupId);
  
  // Set add mode (not edit mode)
  store.setEditMode(false);
  
  // Toggle dialog open
  store.toggleDialog();
  render();
};

export const handleCloseDialog = (e, deps) => {
  const { store, render } = deps;
  
  // Reset edit mode when closing
  store.setEditMode(false);
  
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
    
    // Get the store state - access the internal state properly
    const storeState = store.getState ? store.getState() : store._state || store.state;
    const { targetGroupId, editMode, editItemId } = storeState;
    
    if (editMode && editItemId) {
      // Forward placement edit to parent
      dispatchEvent(new CustomEvent("placement-edited", {
        detail: { 
          itemId: editItemId,
          name: formData.name,
          positionX: formData.positionX,
          positionY: formData.positionY,
          scale: formData.scale,
          anchor: formData.anchor,
          rotation: formData.rotation
        },
        bubbles: true,
        composed: true
      }));
    } else {
      // Forward placement creation to parent
      dispatchEvent(new CustomEvent("placement-created", {
        detail: { 
          groupId: targetGroupId,
          name: formData.name,
          positionX: formData.positionX,
          positionY: formData.positionY,
          scale: formData.scale,
          anchor: formData.anchor,
          rotation: formData.rotation
        },
        bubbles: true,
        composed: true
      }));
    }
    
    // Reset edit mode and close dialog
    store.setEditMode(false);
    store.toggleDialog();
    render();
  }
};