export const handleOnMount = async (deps) => {
  const { render } = deps;
  render();
};

export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";

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
  dispatchEvent(
    new CustomEvent("placement-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handlePlacementItemDoubleClick = async (e, deps) => {
  const { store, render, props, drenderer, getRefIds } = deps;
  const itemId = e.currentTarget.id.replace("placement-item-", "");
  console.log('Double clicked itemId:', itemId);

  // Find the item data from props
  const flatGroups = props.flatGroups || [];
  let itemData = null;

  for (const group of flatGroups) {
    const foundItem = group.children?.find((child) => child.id === itemId);
    if (foundItem) {
      itemData = foundItem;
      break;
    }
  }

  if (itemData) {
    // Set edit mode with item data using separate store functions
    store.setEditMode(true);
    store.setEditItemId(itemId);
    store.setDefaultValues(itemData);
    // Open dialog
    store.toggleDialog();
    render();

    // Initialize drenderer after dialog is opened and canvas is in DOM
    setTimeout(async () => {
      const { canvas } = getRefIds();
      if (canvas && canvas.elm) {
        await drenderer.init({
          canvas: canvas.elm,
        });
      }
      
      // Render initial state with item's current position
      const x = parseInt(itemData.x || 0);
      const y = parseInt(itemData.y || 0);
      const r = parseInt(itemData.rotation || 0);
      
      const renderState = {
        elements: [
          {
            id: "bg",
            type: "rect",
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            fill: "#4a4a4a",
          },
          {
            id: "id0",
            type: "rect",
            x,
            y,
            r,
            width: 200,
            height: 200,
            fill: "white",
          },
          {
            id: "id1",
            type: "rect",
            x: x - 5,
            y: y - 5,
            width: 11,
            height: 11,
            fill: "red",
          },
        ],
        transitions: [],
      };
      drenderer.render(renderState);
    }, 0);
  }
};

export const handleAddPlacementClick = async (e, deps) => {
  const { store, render, drenderer, getRefIds } = deps;
  e.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-placement-button-", "");
  store.setTargetGroupId(groupId);

  // Set add mode (not edit mode)
  store.setEditMode(false);
  store.setEditItemId(null);
  store.setDefaultValues(null);

  // Toggle dialog open
  store.toggleDialog();
  render();

  // Initialize drenderer after dialog is opened and canvas is in DOM
  setTimeout(async () => {
    const { canvas } = getRefIds();
    if (canvas && canvas.elm && !drenderer.initialized) {
      await drenderer.init({
        canvas: canvas.elm,
      });
      drenderer.initialized = true;
      
      // Render initial state
      const renderState = {
        elements: [
          {
            id: "bg",
            type: "rect",
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            fill: "#4a4a4a",
          },
          {
            id: "id0",
            type: "rect",
            x: 0,
            y: 0,
            r: 0,
            width: 200,
            height: 200,
            fill: "white",
          },
          {
            id: "id1",
            type: "rect",
            x: -5,
            y: -5,
            width: 11,
            height: 11,
            fill: "red",
          },
        ],
        transitions: [],
      };
      drenderer.render(renderState);
    }
  }, 0);
};

export const handleCloseDialog = (e, deps) => {
  const { store, render } = deps;

  // Close dialog first
  store.toggleDialog();
  
  // Reset edit mode and clear all form state after closing
  store.setEditMode(false);
  store.setEditItemId(null);
  store.setDefaultValues(null);
  store.setTargetGroupId(null);

  render();
};

export const handleFormActionClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;

  // Check which button was clicked
  const actionId = e.detail.actionId;

  if (actionId === "submit") {
    // Get form values from the event detail - it's in formValues
    const formData = e.detail.formValues;

    // Get state values using selector functions
    const targetGroupId = store.selectTargetGroupId();
    const editMode = store.selectEditMode();
    const editItemId = store.selectEditItemId();

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
      
      // Force immediate render to update thumbnails
      render();
    } else {
      // Forward placement creation to parent
      dispatchEvent(
        new CustomEvent("placement-created", {
          detail: {
            groupId: targetGroupId,
            name: formData.name,
            x: formData.x,
            y: formData.y,
            scale: formData.scale,
            anchor: formData.anchor,
            rotation: formData.rotation,
          },
          bubbles: true,
          composed: true,
        }),
      );
    }

    // Close dialog first, then reset all state
    store.toggleDialog();
    store.setEditMode(false);
    store.setEditItemId(null);
    store.setDefaultValues(null);
    store.setTargetGroupId(null);
    
    // Force a render after the event dispatch completes
    setTimeout(() => {
      render();
    }, 0);
  }
};

export const handlePreviewButtonClick = (e, deps) => {
  //
};

export const handleFormChange = async (e, deps) => {
  const { render, getRefIds, drenderer } = deps;

  const formValues = e.detail.formValues;

  console.log("Form values changed:", formValues);

  const x = parseInt(formValues.x || 0);
  const y = parseInt(formValues.y || 0);
  const r = parseInt(formValues.rotation || 0);

  const renderState = {
    elements: [
      {
        id: "bg",
        type: "rect",
        x:0,
        y:0,
        width: 1920,
        height: 1080,
        fill: "#4a4a4a",
      },
      {
        id: "id0",
        type: "rect",
        x,
        y,
        r,
        width: 200,
        height: 200,
        fill: "white",
      },
      {
        id: "id1",
        type: "rect",
        x: x - 5,
        y: y - 5,
        width: 11,
        height: 11,
        fill: "red",
      },
    ],
    transitions: [],
  };

  console.log("Render state:", renderState);

  drenderer.render(renderState);

  // Render the view
  render();
};
