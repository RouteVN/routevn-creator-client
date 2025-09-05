export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");

  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleCharacterItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("character-item-", "");

  // Forward character item selection to parent
  dispatchEvent(
    new CustomEvent("character-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleSpritesButtonClick = (e, deps) => {
  const { dispatchEvent } = deps;
  e.stopPropagation(); // Prevent character item click
  const itemId = e.currentTarget.id.replace("sprites-button-", "");

  // Forward sprites button click to parent
  dispatchEvent(
    new CustomEvent("sprites-button-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddCharacterClick = (e, deps) => {
  const { store, render } = deps;
  e.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-character-button-", "");
  store.setTargetGroupId(groupId);

  // Toggle dialog open
  store.toggleDialog();
  render();
};

export const handleCloseDialog = (e, deps) => {
  const { store, render } = deps;

  // Clear avatar state and close dialog
  store.clearAvatarState();
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

    // Get the target group ID and avatar fileId from store
    const targetGroupId = store.selectTargetGroupId();
    const avatarFileId = store.selectAvatarFileId();

    // Forward character creation to parent with avatar fileId
    dispatchEvent(
      new CustomEvent("character-created", {
        detail: {
          groupId: targetGroupId,
          name: formData.name,
          description: formData.description,
          avatarFileId: avatarFileId,
        },
        bubbles: true,
        composed: true,
      }),
    );

    // Clear avatar state and close dialog (form will auto-reset due to key attribute)
    store.clearAvatarState();
    store.toggleDialog();
    render();
  }
};

export const handleAvatarClick = async (e, deps) => {
  const { store, render, filePicker, fileManagerFactory, router, subject } =
    deps;

  try {
    // Open file picker for image selection
    const files = await filePicker.open({
      accept: "image/*",
      multiple: false,
    });

    if (files.length > 0) {
      const file = files[0];

      // Get fileManager for this project
      const { p } = router.getPayload();
      const fileManager = await fileManagerFactory.getByProject(p);
      // Upload the file immediately
      const uploadResults = await fileManager.upload([file]);

      if (!uploadResults || uploadResults.length === 0) {
        throw new Error("Failed to upload avatar image");
      }

      const result = uploadResults[0];

      // Store the fileId instead of blob URL
      store.setAvatarFileId(result.fileId);
      render();
    }
  } catch (error) {
    console.error("Error uploading avatar:", error);
  }
};

export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};
