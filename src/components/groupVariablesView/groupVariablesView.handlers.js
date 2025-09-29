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

export const handleVariableItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("variable-item-", "");

  // Forward variable item selection to parent
  dispatchEvent(
    new CustomEvent("variable-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleDialogFormChange = (e, deps) => {
  const { store, render } = deps;

  console.log("store.selectDefaultValues", store.selectDefaultValues());
  console.log("e.detail.formValues", e.detail.formValues);
  // Update form values for preview
  store.updateFormValues({
    ...store.selectDefaultValues(),
    ...e.detail.formValues,
  });
  render();
};

export const handleAddVariableClick = (e, deps) => {
  const { store, render } = deps;
  e.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-variable-button-", "");
  store.setTargetGroupId(groupId);

  // Toggle dialog open
  store.toggleDialog();
  render();
};

export const handleCloseDialog = (e, deps) => {
  const { store, render } = deps;

  // Close dialog
  store.toggleDialog();
  store.updateFormValues({});
  render();
};

export const handleTableRowClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const { rowData } = e.detail;

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

export const handleFormActionClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;

  // Check which button was clicked
  const actionId = e.detail.actionId;

  if (actionId === "submit") {
    // Get form values from the event detail - it's in formValues
    const formData = e.detail.formValues;

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
          defaultValue: formData.initialValue,
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

export const handleEnumAddButtonClick = (e, deps) => {
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
