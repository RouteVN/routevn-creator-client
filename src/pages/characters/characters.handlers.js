import { nanoid } from "nanoid";
import { validateIconDimensions } from "../../utils/fileProcessors";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { characters } = repository.getState();
  store.setItems(characters);
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { characters } = repository.getState();
  store.setItems(characters);
  render();
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render } = deps;
  const { id, isFolder } = payload._event.detail;

  // If this is a folder, clear selection
  if (isFolder) {
    store.setSelectedItemId(null);
    render();
    return;
  }

  store.setSelectedItemId(id);
  render();
};

export const handleCharacterItemClick = async (deps, payload) => {
  const { store, render, getRefIds } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const { fileExplorer } = getRefIds();
  fileExplorer.elm.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });
  render();
};

export const handleCharacterItemDoubleClick = async (deps, payload) => {
  const { store, render, getRefIds } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;

  // Set the selected item (same as single click)
  store.setSelectedItemId(itemId);

  const { fileExplorer } = getRefIds();
  fileExplorer.elm.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });
  // Open edit dialog for double-clicked character
  store.openEditDialog(itemId);
  render();
};

export const handleCharacterCreated = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { groupId, name, description, avatarFileId } = payload._event.detail;

  try {
    // Create default sprites folder with proper structure
    const defaultSpritesFolderId = nanoid();

    let characterData = {
      id: nanoid(),
      type: "character",
      name: name,
      description: description,
      sprites: {
        tree: [
          {
            id: defaultSpritesFolderId,
            children: [],
          },
        ],
        items: {
          [defaultSpritesFolderId]: {
            type: "folder",
            name: "Default Sprites",
          },
        },
      },
    };

    // If avatar fileId is provided, add it to character data
    if (avatarFileId) {
      characterData.fileId = avatarFileId;
    }

    // Add character to repository
    repository.addAction({
      actionType: "treePush",
      target: "characters",
      value: {
        parent: groupId,
        position: "last",
        item: characterData,
      },
    });

    // Update store with new data
    const { characters } = repository.getState();
    store.setItems(characters);
    render();
  } catch (error) {
    console.error("Failed to create character:", error);

    throw error;
  }
};

export const handleSpritesButtonClick = (deps, payload) => {
  const { subject, render, router } = deps;
  const { itemId } = payload._event.detail;
  const { p } = router.getPayload();

  // Dispatch redirect with path and payload for query params
  subject.dispatch("redirect", {
    path: "/project/resources/character-sprites",
    payload: {
      characterId: itemId,
      p: p,
    },
  });

  render();
};

export const handleDetailPanelAvatarClick = async (deps) => {
  const {
    repositoryFactory,
    router,
    store,
    render,
    filePicker,
    fileManagerFactory,
    globalUI,
  } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const fileManager = await fileManagerFactory.getByProject(projectId);

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn("No item selected for image replacement");
    return;
  }

  const files = await filePicker.open({
    accept: "image/*",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

  const { isValid, message } = await validateIconDimensions(file);
  if (!isValid) {
    globalUI.showAlert({ message, title: "Error" });
    return;
  }

  try {
    // Upload the new avatar file using fileManager
    const uploadedFiles = await fileManager.upload([file]);

    if (uploadedFiles && uploadedFiles.length > 0) {
      const uploadedFile = uploadedFiles[0];
      console.log("Character avatar uploaded successfully:", file.name);

      const updateData = {
        fileId: uploadedFile.fileId,
        fileType: file.type,
        fileSize: file.size,
        // Update name only if character doesn't have one or if it's the generic filename
        ...((!selectedItem.name ||
          selectedItem.name === "Untitled Character") && {
          name: file.name.replace(/\.[^/.]+$/, ""),
        }),
      };

      // Update the selected character in the repository with the new avatar
      repository.addAction({
        actionType: "treeUpdate",
        target: "characters",
        value: {
          id: selectedItem.id,
          replace: false,
          item: updateData,
        },
      });

      // Update the store with the new repository state and get new file URL
      const { characters } = repository.getState();
      store.setItems(characters);
      render();
    } else {
      console.error("Avatar upload failed:", file.name);
    }
  } catch (error) {
    console.error("Avatar upload error:", file.name, error);
  }
};

export const handleFormChange = async (deps, payload) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  repository.addAction({
    actionType: "treeUpdate",
    target: "characters",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
    },
  });

  const { characters } = repository.getState();
  store.setItems(characters);
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupToggle = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleAddCharacterClick = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.setTargetGroupId(groupId);
  store.toggleDialog();
  render();
};

export const handleCloseDialog = (deps) => {
  const { store, render } = deps;
  store.clearAvatarState();
  store.toggleDialog();
  render();
};

export const handleDialogFormActionClick = (deps, payload) => {
  const { store, render } = deps;
  const actionId = payload._event.detail.actionId;

  if (actionId === "submit") {
    const formData = payload._event.detail.formValues;
    const targetGroupId = store.selectTargetGroupId();
    const avatarFileId = store.selectAvatarFileId();

    // Create a synthetic event payload with the correct structure
    const characterCreatedPayload = {
      _event: {
        detail: {
          groupId: targetGroupId,
          name: formData.name,
          description: formData.description,
          avatarFileId: avatarFileId,
        },
      },
    };

    // Handle the character creation directly with correct payload
    handleCharacterCreated(deps, characterCreatedPayload);

    // Clear avatar state and close dialog
    store.clearAvatarState();
    store.toggleDialog();
    render();
  }
};

export const handleDialogAvatarClick = async (deps) => {
  const { store, render, filePicker, fileManagerFactory, router, globalUI } =
    deps;

  try {
    const files = await filePicker.open({
      accept: "image/*",
      multiple: false,
    });

    if (files.length > 0) {
      const file = files[0];
      const { isValid, message } = await validateIconDimensions(file);
      if (!isValid) {
        globalUI.showAlert({ message, title: "Error" });
        return;
      }

      const { p } = router.getPayload();
      const fileManager = await fileManagerFactory.getByProject(p);

      const uploadResults = await fileManager.upload([file]);

      if (!uploadResults || uploadResults.length === 0) {
        throw new Error("Failed to upload avatar image");
      }

      const result = uploadResults[0];
      store.setAvatarFileId(result.fileId);
      render();
    }
  } catch (error) {
    console.error("Error uploading avatar:", error);
  }
};

export const handleItemDelete = async (deps, payload) => {
  const { repositoryFactory, router, store, render } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const { resourceType, itemId } = payload._event.detail;

  // Perform the delete operation
  repository.addAction({
    actionType: "treeDelete",
    target: resourceType,
    value: {
      id: itemId,
    },
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = repository.getState()[resourceType];
  store.setItems(data);
  render();
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditDialogAvatarClick = async (deps) => {
  const { store, render, filePicker, fileManagerFactory, router, globalUI } =
    deps;

  try {
    const files = await filePicker.open({
      accept: "image/*",
      multiple: false,
    });

    if (files.length > 0) {
      const file = files[0];
      const { isValid, message } = await validateIconDimensions(file);
      if (!isValid) {
        globalUI.showAlert({ message, title: "Error" });
        return;
      }
      const { p } = router.getPayload();
      const fileManager = await fileManagerFactory.getByProject(p);

      const uploadResults = await fileManager.upload([file]);

      if (!uploadResults || uploadResults.length === 0) {
        throw new Error("Failed to upload avatar image");
      }

      const result = uploadResults[0];
      store.setEditAvatarFileId(result.fileId);
      render();
    }
  } catch (error) {
    console.error("Error uploading avatar:", error);
  }
};

export const handleEditFormAction = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.formValues;
    const editItemId = store.getState().editItemId;
    const editAvatarFileId = store.getState().editAvatarFileId;

    // Update the character in the repository
    const updateData = {
      name: formData.name,
      description: formData.description,
    };

    // Include avatar file ID if it was changed
    if (editAvatarFileId) {
      updateData.fileId = editAvatarFileId;
    }

    repository.addAction({
      actionType: "treeUpdate",
      target: "characters",
      value: {
        id: editItemId,
        replace: false,
        item: updateData,
      },
    });

    const { characters } = repository.getState();
    store.setItems(characters);
    store.closeEditDialog();
    render();
  }
};
