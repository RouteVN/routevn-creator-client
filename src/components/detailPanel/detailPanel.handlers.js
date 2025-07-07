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

export const handleTitleClick = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();
  
  // Show popover at the click position
  store.showPopover({ position: { x: e.clientX, y: e.clientY } });
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
  
  // Extract action and values from detail
  const action = detail.action || detail.actionId;
  const values = detail.values || detail.formValues || detail;
  
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