export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.target.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleBeforeMount = (deps) => {
  const { render, store, repository } = deps;
  const { colors, fonts } = repository.getState();
  store.setColorsData(colors);
  store.setFontsData(fonts);
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
  dispatchEvent(
    new CustomEvent("typography-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddTypographyClick = (e, deps) => {
  const { store, render } = deps;
  e.stopPropagation(); // Prevent group click

  console.log("Add typography button clicked", e.currentTarget.id);

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

  if (actionId === "submit") {
    // Get form values from the event detail
    const formData = e.detail.formValues;

    // Get the store state
    const storeState = store.getState
      ? store.getState()
      : store._state || store.state;
    const { targetGroupId } = storeState;

    // Validate required fields (dropdowns ensure valid color and font selections)
    if (
      !formData.name ||
      !formData.fontSize ||
      !formData.fontColor ||
      !formData.fontStyle ||
      !formData.fontWeight
    ) {
      alert("Please fill in all required fields");
      return;
    }

    // Validate font size is a number
    if (isNaN(formData.fontSize) || parseInt(formData.fontSize) <= 0) {
      alert("Please enter a valid font size (positive number)");
      return;
    }

    // Forward typography creation to parent
    dispatchEvent(
      new CustomEvent("typography-created", {
        detail: {
          groupId: targetGroupId,
          name: formData.name,
          fontSize: formData.fontSize,
          fontColor: formData.fontColor,
          fontStyle: formData.fontStyle,
          fontWeight: formData.fontWeight,
          previewText: formData.previewText,
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
