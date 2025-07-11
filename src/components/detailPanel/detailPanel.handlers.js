export const handleOnMount = async (deps) => {
  // Component mounted
};

export const handleEditableImageClick = (e, deps) => {
  const { getRefIds } = deps;
  
  // Extract the field index from the element ID
  const fieldIndex = e.currentTarget.id.replace('editable-image-', '');
  
  // Get the corresponding file input and trigger click
  const refIds = getRefIds();
  const fileInputRef = refIds[`file-input-${fieldIndex}`];
  
  if (fileInputRef && fileInputRef.elm) {
    fileInputRef.elm.click();
  }
};

export const handleFileInputChange = (e, deps) => {
  const { dispatchEvent, props } = deps;
  
  // Extract the field index from the element ID
  const fieldIndex = parseInt(e.currentTarget.id.replace('file-input-', ''));
  const field = props.fields[fieldIndex];
  const file = e.target.files[0];
  
  if (file && field) {
    // Emit event to parent component with file and field information
    dispatchEvent(new CustomEvent('replace-item', {
      detail: {
        file,
        field,
        fieldIndex
      },
      bubbles: true,
      composed: true
    }));
    
    // Reset the file input for future uploads
    e.target.value = '';
  }
};

export const handleEditableAudioClick = (e, deps) => {
  const { getRefIds } = deps;
  
  // Extract the field index from the element ID
  const fieldIndex = e.currentTarget.id.replace('editable-audio-', '');
  
  // Get the corresponding audio file input and trigger click
  const refIds = getRefIds();
  const audioFileInputRef = refIds[`file-input-${fieldIndex}`];
  
  if (audioFileInputRef && audioFileInputRef.elm) {
    audioFileInputRef.elm.click();
  }
};

export const handleTitleClick = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();
  
  // Calculate position for left-bottom placement relative to mouse cursor
  // Offset to the left and slightly down from the cursor
  const position = {
    x: e.clientX - 200, // Move 200px to the left of cursor
    y: e.clientY + 10   // Move 10px down from cursor
  };
  
  // Ensure popover doesn't go off-screen to the left
  if (position.x < 10) {
    position.x = 10;
  }
  
  store.showPopover({ position });
  render();
};

export const handlePopoverClickOverlay = (_, deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
};

export const handleFormActionClick = (e, deps) => {
  const { store, dispatchEvent, render } = deps;
  const detail = e.detail;
  
  // Extract action and values from detail - use correct property names
  const action = detail.actionId;
  const values = detail.formValues;
  
  if (action === 'cancel') {
    store.hidePopover();
    render();
    return;
  }
  
  if (action === 'submit') {
    // Hide popover
    store.hidePopover();
    render();
    
    // Emit file-action event for rename confirmation
    dispatchEvent(new CustomEvent("file-action", {
      detail: {
        value: 'rename-item-confirmed',
        newName: values.name
      },
      bubbles: true,
      composed: true
    }));
  }
};

export const handleColorFieldClick = (e, deps) => {
  const { store, render, props } = deps;
  
  // Extract the field index from the element ID
  const fieldIndex = parseInt(e.currentTarget.id.replace('color-field-', ''));
  const field = props.fields[fieldIndex];
  
  if (field && field.type === 'color') {
    // Open color dialog with current color data
    store.showColorDialog({
      fieldIndex,
      itemData: {
        name: field.name || '',
        value: field.value || '#000000'
      }
    });
    render();
  }
};

export const handleCloseColorDialog = (e, deps) => {
  const { store, render } = deps;
  store.hideColorDialog();
  render();
};

export const handleColorFormActionClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;
  const detail = e.detail;
  
  // Extract values from detail
  const values = detail.formValues;
  
  // Get current dialog state
  const state = store.getState ? store.getState() : store._state || store.state;
  const fieldIndex = state.colorDialog.fieldIndex;
  
  // Hide dialog
  store.hideColorDialog();
  render();
  
  // Emit color-updated event for editing existing color
  dispatchEvent(new CustomEvent("color-updated", {
    detail: {
      fieldIndex,
      hex: values.hex
    },
    bubbles: true,
    composed: true
  }));
};

export const handleFontFieldClick = (e, deps) => {
  const { getRefIds } = deps;
  
  // Extract the field index from the element ID
  const fieldIndex = e.currentTarget.id.replace('font-field-', '');
  
  // Get the corresponding file input and trigger click
  const refIds = getRefIds();
  const fileInputRef = refIds[`file-input-${fieldIndex}`];
  
  fileInputRef.elm.click();
};