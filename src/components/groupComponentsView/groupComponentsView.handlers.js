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

export const handleComponentItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("component-item-", "");

  // Forward component item selection to parent
  dispatchEvent(
    new CustomEvent("image-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleComponentItemDoubleClick = (e, deps) => {
  const { subject, router } = deps;
  const itemId = e.currentTarget.id.replace("component-item-", "");

  // Get current payload to preserve projectId
  const currentPayload = router ? router.getPayload() : {};

  // Redirect to component editor with componentId payload
  subject.dispatch("redirect", {
    path: "/project/resources/component-editor",
    payload: {
      ...currentPayload, // Preserve existing payload (including p for projectId)
      componentId: itemId,
    },
  });
};

export const handleAddComponentClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("add-component-button-", "");

  store.showDialog(groupId);
  render();
};

export const handleCloseDialog = (e, deps) => {
  const { store, render } = deps;

  // Close dialog
  store.hideDialog();
  render();
};

export const handleFormActionClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;

  // Check which button was clicked
  const actionId = e.detail.actionId;

  if (actionId === "submit") {
    // Get form values from the event detail
    const formData = e.detail.formValues;
    const groupId = store.selectCurrentGroupId();

    // Validate required fields
    if (!formData.name) {
      alert("Please enter a component name");
      return;
    }

    // Dispatch component creation event to parent
    dispatchEvent(
      new CustomEvent("component-created", {
        detail: {
          groupId,
          name: formData.name,
        },
        bubbles: true,
        composed: true,
      }),
    );

    // Close dialog
    store.hideDialog();
    render();
  } else if (actionId === "cancel") {
    // Close dialog on cancel
    store.hideDialog();
    render();
  }
};
