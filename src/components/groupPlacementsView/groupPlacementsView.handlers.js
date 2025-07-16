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
    console.log('=== DOUBLE CLICK DEBUG ===');
    console.log('1. Double-clicked placement item:', itemId);
    console.log('2. Item data found:', JSON.stringify(itemData, null, 2));
    
    // Log parameters before calling setEditMode
    console.log('2.5. Parameters before setEditMode call:', {
      editMode: true,
      itemId: itemId,
      itemData: itemData
    });
    
    // Set edit mode with item data - try direct state modification
    const state = store.getState();
    state.editMode = true;
    state.editItemId = itemId;
    
    // Update form for edit mode
    state.form.title = 'Edit Placement';
    state.form.description = 'Edit the placement configuration';
    state.form.actions.buttons[0].content = 'Update Placement';

    // Update default values with current item data
    state.defaultValues = {
      name: itemData.name || '',
      x: String(itemData.x || '0'),
      y: String(itemData.y || '0'),
      scale: String(itemData.scale || '1'),
      anchor: itemData.anchor || 'center',
      rotation: String(itemData.rotation || '0'),
    };
    
    console.log('2.8. Direct state modification result:', {
      editMode: state.editMode,
      editItemId: state.editItemId,
      defaultValues: state.defaultValues,
      formTitle: state.form.title,
      formButton: state.form.actions.buttons[0].content
    });
    
    console.log('3. State after direct modification:', {
      editMode: state.editMode,
      editItemId: state.editItemId,
      defaultValues: JSON.stringify(state.defaultValues, null, 2),
      formTitle: state.form.title,
      formButtonText: state.form.actions.buttons[0].content
    });

    // Open dialog
    if (!state.isDialogOpen) {
      store.toggleDialog();
    }

    // Log final state before render
    console.log('4. Final state before render:', {
      isDialogOpen: state.isDialogOpen,
      editMode: state.editMode,
      formKey: state.editMode ? `edit_${state.editItemId}` : 'add'
    });

    render();
  } else {
    console.log('No item data found for ID:', itemId);
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

export const handlePreviewButtonClick = (e, deps) => {
  //
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


