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
    // Set edit mode with item data using proper store function
    store.setEditMode(true, itemId, itemData);

    // Open dialog if not already open
    const state = store.getState();
    if (!state.isDialogOpen) {
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

    // Get state values using getter functions
    const targetGroupId = store.getTargetGroupId();
    const editMode = store.getEditMode();
    const editItemId = store.getEditItemId();

    if (editMode && editItemId) {
      // Forward placement edit to parent
      dispatchEvent(new CustomEvent("placement-edited", {
        detail: {
          itemId: editItemId,
          name: formData.name,
          x: formData.x,
          y: formData.y,
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
          x: formData.x,
          y: formData.y,
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

export const handlePreviewButtonClick = () => {
  // TODO: Implement preview functionality
}

export const handleFormChange = async (e, deps) => {
  const { store, render, getRefIds, drenderer } = deps;

  const formValues = e.detail.formValues;

  console.log('Form values changed:', formValues);

  const { canvas } = getRefIds();

  const x = parseInt(formValues.x || 0);
  const y = parseInt(formValues.y || 0);

  const renderState = {
    elements: [{
      id: 'srprite1',
      type: 'sprite',
      x,
      y,
      // TODO replace with fileId of image selected
      url: 'file:project_logo',
    }, {
      id: 'id1',
      type: 'graphics',
      x1: x - 5,
      y1: y - 5,
      x2: 11,
      y2: 11,
      fill: 'red'
    },],
    transitions: []
  }

  console.log('Render state:', renderState);

  await drenderer.init({
    assets: {
      'file:project_logo': {
        type: 'image/png',
        // TODO replace with actual url of file
        url: '/public/project_logo_placeholder.png'
      }
    }, canvas: canvas.elm
  })
  drenderer.render(renderState)

  // Render the view
  render();
}


