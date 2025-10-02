export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupClick = (deps, payload) => {
  const { store, render } = deps;
  const groupId = payload._event.currentTarget.id.replace("group-", "");

  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleVariableItemClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = payload._event.currentTarget.id.replace("variable-item-", "");

  // Forward variable item selection to parent
  dispatchEvent(
    new CustomEvent("variable-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleDialogFormChange = (deps, payload) => {
  const { store, render } = deps;

  console.log("store.selectDefaultValues", store.selectDefaultValues());
  console.log(
    "payload._event.detail.formValues",
    payload._event.detail.formValues,
  );
  // Update form values for preview
  store.updateFormValues({
    ...store.selectDefaultValues(),
    ...payload._event.detail.formValues,
  });
  render();
};

export const handleAddVariableClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button
  const groupId = payload._event.currentTarget.id.replace(
    "add-variable-button-",
    "",
  );
  store.setTargetGroupId(groupId);

  // Toggle dialog open
  store.toggleDialog();
  render();
};

export const handleCloseDialog = (deps) => {
  const { store, render } = deps;

  // Close dialog
  store.toggleDialog();
  store.updateFormValues({});
  render();
};

export const handleTableRowClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const { rowData } = payload._event.detail;

  if (rowData && rowData.id) {
    // Forward variable item selection to parent
    dispatchEvent(
      new CustomEvent("variable-item-click", {
        detail: { itemId: rowData.id },
        bubbles: true,
        composed: true,
      }),
    );
  }
};

export const handleFormActionClick = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;

  // Check which button was clicked
  const actionId = payload._event.detail.actionId;

  if (actionId === "submit") {
    // Get form values from the event detail - it's in formValues
    const formData = payload._event.detail.formValues;

    // Get the target group ID from store - access the internal state properly
    const storeState = store.getState
      ? store.getState()
      : store._state || store.state;
    const targetGroupId = storeState.targetGroupId;

    // Forward variable creation to parent
    dispatchEvent(
      new CustomEvent("variable-created", {
        detail: {
          groupId: targetGroupId,
          name: formData.name,
          type: formData.type,
          initialValue: formData.initialValue,
          readonly: formData.readonly,
        },
        bubbles: true,
        composed: true,
      }),
    );

    // Close dialog
    store.toggleDialog();
    render();
  }
};

export const handleEnumAddButtonClick = (deps) => {
  const { getRefIds, store, render } = deps;
  const inputElm = getRefIds()["form-enum-input"].elm;
  const defaultValues = structuredClone(store.selectDefaultValues());
  if (!defaultValues.enum) {
    defaultValues.enum = [];
  }
  defaultValues.enum.push({
    label: inputElm.value,
    id: `${Math.random()}`,
  });
  store.updateFormValues(defaultValues);
  render();
};
