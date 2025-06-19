export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || '';
  
  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");
  store.toggleGroupCollapse(groupId);
  render();
};

export const handlePresetItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("preset-item-", "");
  
  dispatchEvent(new CustomEvent("preset-item-click", {
    detail: { itemId },
    bubbles: true,
    composed: true
  }));
};

export const handleAddPresetClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("add-preset-button-", "");
  store.setTargetGroupId(groupId);
  store.toggleDialog();
  render();
};

export const handleCloseDialog = (e, deps) => {
  const { store, render } = deps;
  store.toggleDialog();
  render();
};

export const handleSubmitForm = (e, deps) => {
  const { store, render } = deps;
  store.toggleDialog();
  render();
};

export const handleFormActionClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;
  const actionId = e.detail.actionId;
  
  if (actionId === 'submit') {
    const formData = e.detail.formValues;
    const storeState = store.getState ? store.getState() : store._state || store.state;
    const targetGroupId = storeState.targetGroupId;
    
    dispatchEvent(new CustomEvent("preset-created", {
      detail: { 
        groupId: targetGroupId,
        name: formData.name,
        description: formData.description
      },
      bubbles: true,
      composed: true
    }));
    
    store.toggleDialog();
    render();
  }
};