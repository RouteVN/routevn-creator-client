
import { toFlatItems } from "../../deps/repository";

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
  
  console.log('Add typography button clicked', e.currentTarget.id);
  
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
  const { store, render, dispatchEvent, repository } = deps;
  
  // Check which button was clicked
  const actionId = e.detail.actionId;
  
  if (actionId === 'submit') {
    // Get form values from the event detail
    const formData = e.detail.formValues;
    
    // Get the store state
    const storeState = store.getState ? store.getState() : store._state || store.state;
    const { targetGroupId } = storeState;
    
    // Validate required fields
    if (!formData.name || !formData.fontSize || !formData.fontColor || !formData.fontStyle || !formData.fontWeight) {
      alert('Please fill in all required fields');
      return;
    }
    
    // Get repository data for validation
    const { fonts, colors } = repository.getState();
    
    // Check if color exists
    const colorExists = toFlatItems(colors)
      .filter(item => item.type === 'color')
      .some(color => color.name === formData.fontColor);
    
    if (!colorExists) {
      alert(`Color "${formData.fontColor}" not found. Please use an existing color name.`);
      return;
    }
    
    // Check if font exists
    const fontExists = toFlatItems(fonts)
      .filter(item => item.type === 'font')
      .some(font => font.fontFamily === formData.fontStyle);
    
    if (!fontExists) {
      alert(`Font "${formData.fontStyle}" not found. Please use an existing font family name.`);
      return;
    }
    
    // Validate font size is a number
    if (isNaN(formData.fontSize) || parseInt(formData.fontSize) <= 0) {
      alert('Please enter a valid font size (positive number)');
      return;
    }
    
    // Forward typography creation to parent
    dispatchEvent(new CustomEvent("typography-created", {
      detail: { 
        groupId: targetGroupId,
        name: formData.name,
        fontSize: formData.fontSize,
        fontColor: formData.fontColor,
        fontStyle: formData.fontStyle,
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