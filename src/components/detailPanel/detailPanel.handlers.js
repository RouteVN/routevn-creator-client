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
    // Use eventType from field
    const eventType = field.eventType;
    
    // Emit event to parent component with file and field information
    dispatchEvent(new CustomEvent(eventType, {
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