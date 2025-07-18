export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");

  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleAnimationItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("animation-item-", "");

  // Forward animation item selection to parent
  dispatchEvent(
    new CustomEvent("animation-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddAnimationClick = (e, deps) => {
  const { store, render } = deps;
  e.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-animation-button-", "");
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

    // Forward animation creation to parent
    dispatchEvent(
      new CustomEvent("animation-created", {
        detail: {
          groupId: targetGroupId,
          name: formData.name,
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
