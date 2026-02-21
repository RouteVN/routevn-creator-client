export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";

  store.setSearchQuery({ query: searchQuery });
  render();
};

export const handleGroupClick = (deps, payload) => {
  const { store, render } = deps;
  const groupId = payload._event.currentTarget.id.replace("group", "");

  // Handle group collapse internally
  store.toggleGroupCollapse({ groupId: groupId });
  render();
};

export const handleVariableItemClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = payload._event.currentTarget.id.replace("variableItem", "");

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
  const prevValues = store.selectDefaultValues();
  const newValues = payload._event.detail.values;

  // When type changes, set appropriate default value
  let defaultValue = newValues.default;
  if (newValues.type !== prevValues.type) {
    if (newValues.type === "number") {
      defaultValue = 0;
    } else if (newValues.type === "boolean") {
      defaultValue = false;
    } else {
      defaultValue = "";
    }
  }

  // Update form values for preview
  store.updateFormValues({
    ...prevValues,
    ...newValues,
    default: defaultValue,
  });
  render();
};

export const handleAddVariableClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button (handles both button and empty state)
  const buttonId = payload._event.currentTarget.id;
  const groupId = buttonId
    .replace("addVariableButton", "")
    .replace("addVariableEmpty", "");
  store.setTargetGroupId({ groupId: groupId });

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

export const handleRowClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = payload._event.currentTarget.id.replace("row", "");

  dispatchEvent(
    new CustomEvent("variable-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleRowContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  const itemId = payload._event.currentTarget.id.replace("row", "");
  const x = payload._event.clientX;
  const y = payload._event.clientY;

  store.showContextMenu({ itemId, x, y });
  render();
};

export const handleContextMenuClickItem = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const item = payload._event.detail.item;

  if (item && item.value === "delete-item") {
    const itemId = store.selectTargetItemId();
    dispatchEvent(
      new CustomEvent("variable-delete", {
        detail: { itemId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  store.hideContextMenu();
  render();
};

export const handleCloseContextMenu = (deps) => {
  const { store, render } = deps;
  store.hideContextMenu();
  render();
};

export const handleFormActionClick = (deps, payload) => {
  const { store, render, dispatchEvent, props } = deps;

  // Check which button was clicked
  const actionId = payload._event.detail.actionId;

  if (actionId === "submit") {
    // Get form values from the event detail - it's in formValues
    const formData = payload._event.detail.values;

    // Don't submit if name is not set
    if (!formData.name || !formData.name.trim()) {
      return;
    }

    // Don't submit if name already exists
    const existingNames = (props.flatGroups || [])
      .flatMap((g) => g.children || [])
      .map((item) => item.name);
    if (existingNames.includes(formData.name.trim())) {
      return;
    }

    // Get the target group ID from store - access the internal state properly
    const storeState = store.getState
      ? store.getState()
      : store._state || store.state;
    const targetGroupId = storeState.targetGroupId;

    // Set default value based on type if not provided
    let defaultValue = formData.default;
    if (defaultValue === undefined || defaultValue === "") {
      if (formData.type === "number") {
        defaultValue = 0;
      } else if (formData.type === "boolean") {
        defaultValue = false;
      } else {
        defaultValue = "";
      }
    }

    // Forward variable creation to parent
    dispatchEvent(
      new CustomEvent("variable-created", {
        detail: {
          groupId: targetGroupId,
          name: formData.name,
          scope: formData.scope,
          type: formData.type,
          default: defaultValue,
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
