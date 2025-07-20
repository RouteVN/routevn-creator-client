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

    // Forward animation creation to parent with selected properties and keyframes
    dispatchEvent(
      new CustomEvent("animation-created", {
        detail: {
          groupId: targetGroupId,
          name: formData.name,
          properties: storeState.selectedProperties,
          initialValue: storeState.initialValue,
          propertyKeyframes: storeState.propertyKeyframes,
        },
        bubbles: true,
        composed: true,
      }),
    );

    // Close dialog and reset everything
    store.toggleDialog();
    store.setSelectedProperties([]);
    store.setInitialValue(0);
    // Reset property keyframes
    const storeState2 = store.getState
      ? store.getState()
      : store._state || store.state;
    storeState2.propertyKeyframes = {};
    render();
  }
};

export const handleAddPropertiesClick = (e, deps) => {
  const { store, render } = deps;

  store.togglePropertySelector();
  render();
};

export const handlePropertySelect = (e, deps) => {
  const { store, render } = deps;
  const property = e.currentTarget.dataset.property;

  store.addProperty(property);
  store.togglePropertySelector();
  render();
};

export const handleInitialValueChange = (e, deps) => {
  const { store, render } = deps;
  const value = e.detail.value;

  store.setInitialValue(value);
  render();
};

export const handleAddKeyframeInDialog = (e, deps) => {
  const { store, render } = deps;

  // Get property name from either custom event detail or button data attribute
  const propertyName =
    e.detail?.propertyName || e.currentTarget.dataset.property;

  if (!propertyName) {
    return;
  }

  // Add a keyframe to the property using the store function
  store.addKeyframeToProperty(propertyName);

  render();
};
