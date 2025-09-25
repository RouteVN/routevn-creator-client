export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");

  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleLayoutItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("layout-item-", "");

  // Forward layout item selection to parent
  dispatchEvent(
    new CustomEvent("image-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleLayoutItemDoubleClick = (e, deps) => {
  const { subject, router } = deps;
  const itemId = e.currentTarget.id.replace("layout-item-", "");

  // Get current payload to preserve projectId
  const currentPayload = router ? router.getPayload() : {};

  // Redirect to layout editor with layoutId payload
  subject.dispatch("redirect", {
    path: "/project/resources/layout-editor",
    payload: {
      ...currentPayload, // Preserve existing payload (including p for projectId)
      layoutId: itemId,
    },
  });
};

export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleAddLayoutClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("add-layout-button-", "");

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
  const { store, render, dispatchEvent, notification } = deps;

  // Check which button was clicked
  const actionId = e.detail.actionId;

  if (actionId === "submit") {
    // Get form values from the event detail
    const formData = e.detail.formValues;
    const groupId = store.selectCurrentGroupId();

    // Validate required fields
    if (!formData.name) {
      notification.warning("Please enter a layout name");
      return;
    }
    if (!formData.layoutType) {
      notification.warning("Please select a layout type");
      return;
    }

    // Dispatch layout creation event to parent
    dispatchEvent(
      new CustomEvent("layout-created", {
        detail: {
          groupId,
          name: formData.name,
          layoutType: formData.layoutType,
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
