export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";

  store.setSearchQuery({ query: searchQuery });
  render();
};

const getDataId = (event, attrName, fallbackPrefix = "") => {
  const value = event?.currentTarget?.getAttribute?.(attrName);
  if (value) {
    return value;
  }
  if (!fallbackPrefix) {
    return "";
  }
  return event?.currentTarget?.id?.replace(fallbackPrefix, "") || "";
};

const getDefaultValueByType = (type) => {
  if (type === "number") {
    return 0;
  }
  if (type === "boolean") {
    return false;
  }
  return "";
};

const findVariableWithGroup = (flatGroups = [], itemId) => {
  for (const group of flatGroups) {
    for (const item of group.children || []) {
      if (item.id === itemId) {
        return { group, item };
      }
    }
  }
  return null;
};

export const handleGroupClick = (deps, payload) => {
  const { store, render } = deps;
  const groupId = getDataId(payload._event, "data-group-id", "group");
  if (!groupId) {
    return;
  }

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
    defaultValue = getDefaultValueByType(newValues.type);
  }

  // Update form values for preview
  store.updateFormValues({
    payload: {
      ...prevValues,
      ...newValues,
      default: defaultValue,
    },
  });
  render();
};

export const handleAddVariableClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button (handles both button and empty state)
  const groupId =
    getDataId(payload._event, "data-group-id") ||
    payload._event.currentTarget.id
      .replace("addVariableButton", "")
      .replace("addVariableEmpty", "");
  if (!groupId) {
    return;
  }

  store.openAddDialog({ groupId: groupId });
  render();
};

export const handleCloseDialog = (deps) => {
  const { store, render } = deps;

  store.closeDialog();
  render();
};

export const handleRowClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = getDataId(payload._event, "data-item-id", "row");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("variable-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleRowDoubleClick = (deps, payload) => {
  const { store, render, dispatchEvent, props } = deps;
  const itemId = getDataId(payload._event, "data-item-id", "row");
  if (!itemId) {
    return;
  }

  const found = findVariableWithGroup(props.flatGroups, itemId);
  if (!found) {
    return;
  }

  const { group, item } = found;
  const type = item.type || "string";
  const defaultValue =
    item.default === undefined ? getDefaultValueByType(type) : item.default;

  dispatchEvent(
    new CustomEvent("variable-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );

  store.openEditDialog({
    groupId: group.id,
    itemId,
    defaultValues: {
      name: item.name || "",
      scope: item.scope || "context",
      type,
      default: defaultValue,
    },
  });
  render();
};

export const handleRowContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  const itemId = getDataId(payload._event, "data-item-id", "row");
  if (!itemId) {
    return;
  }
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
  const { store, render, dispatchEvent, props, appService } = deps;

  // Check which button was clicked
  const actionId = payload._event.detail.actionId;

  if (actionId === "submit") {
    // Get form values from the event detail - it's in formValues
    const formData = payload._event.detail.values;
    const name = formData.name?.trim();

    // Don't submit if name is not set
    if (!name) {
      appService.showToast("Variable name is required.", { title: "Warning" });
      return;
    }

    // Get current dialog state
    const storeState = store.getState
      ? store.getState()
      : store._state || store.state;
    const targetGroupId = storeState.targetGroupId;
    const isEditMode = storeState.dialogMode === "edit";
    const editingItemId = storeState.editingItemId;
    const scope =
      formData.scope ?? storeState.defaultValues?.scope ?? "context";
    const type = formData.type ?? storeState.defaultValues?.type ?? "string";
    if (isEditMode && !editingItemId) {
      appService.showToast(
        "Unable to update variable. Please reopen the editor and try again.",
        { title: "Warning" },
      );
      return;
    }
    if (!isEditMode && !targetGroupId) {
      appService.showToast(
        "Unable to add variable. Please select a group and try again.",
        { title: "Warning" },
      );
      return;
    }

    // Don't submit if name already exists
    const isDuplicateName = (props.flatGroups || [])
      .flatMap((group) => group.children || [])
      .some(
        (item) =>
          item.name === name && (!isEditMode || item.id !== editingItemId),
      );
    if (isDuplicateName) {
      appService.showToast("Variable name must be unique.", {
        title: "Warning",
      });
      return;
    }

    // Set default value based on type if not provided
    let defaultValue = formData.default;
    if (defaultValue === undefined || defaultValue === "") {
      defaultValue = getDefaultValueByType(type);
    }

    if (isEditMode) {
      dispatchEvent(
        new CustomEvent("variable-updated", {
          detail: {
            itemId: editingItemId,
            name,
            scope,
            type,
            default: defaultValue,
          },
          bubbles: true,
          composed: true,
        }),
      );
    } else {
      // Forward variable creation to parent
      dispatchEvent(
        new CustomEvent("variable-created", {
          detail: {
            groupId: targetGroupId,
            name,
            scope,
            type,
            default: defaultValue,
          },
          bubbles: true,
          composed: true,
        }),
      );
    }

    // Close dialog
    store.closeDialog();
    render();
  }
};
