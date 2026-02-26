import { nanoid } from "nanoid";
import { validateIconDimensions } from "../../utils/fileProcessors";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

const getCharacterItemById = ({ store, itemId } = {}) => {
  if (!itemId) return null;
  const item = store.getState().charactersData?.items?.[itemId];
  if (!item || item.type !== "character") return null;
  return item;
};

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId || detail.id || detail.item?.id || "";
};

const callFormMethod = ({ formRef, methodName, payload } = {}) => {
  if (!formRef || !methodName) return false;

  if (typeof formRef[methodName] === "function") {
    formRef[methodName](payload);
    return true;
  }

  if (typeof formRef.transformedMethods?.[methodName] === "function") {
    formRef.transformedMethods[methodName](payload);
    return true;
  }

  return false;
};

const syncEditFormValues = ({ deps, values, attempt = 0 } = {}) => {
  const formRef = deps?.refs?.editForm;

  if (!formRef) {
    if (attempt < 6) {
      setTimeout(() => {
        syncEditFormValues({ deps, values, attempt: attempt + 1 });
      }, 0);
    }
    return;
  }

  callFormMethod({ formRef, methodName: "reset" });

  const didSet = callFormMethod({
    formRef,
    methodName: "setValues",
    payload: { values },
  });

  if (!didSet && attempt < 6) {
    setTimeout(() => {
      syncEditFormValues({ deps, values, attempt: attempt + 1 });
    }, 0);
  }
};

const createDetailFormValues = (item) => {
  if (!item) {
    return {
      name: "",
      description: "",
    };
  }

  return {
    name: item.name || "",
    description: item.description || "No description provided",
  };
};

const syncDetailFormValues = ({
  deps,
  values,
  selectedItemId,
  attempt = 0,
} = {}) => {
  const formRef = deps?.refs?.detailForm;
  const currentSelectedItemId = deps?.store?.selectSelectedItemId?.();

  if (!selectedItemId || selectedItemId !== currentSelectedItemId) {
    return;
  }

  if (!formRef) {
    if (attempt < 6) {
      setTimeout(() => {
        syncDetailFormValues({
          deps,
          values,
          selectedItemId,
          attempt: attempt + 1,
        });
      }, 0);
    }
    return;
  }

  callFormMethod({ formRef, methodName: "reset" });

  const didSet = callFormMethod({
    formRef,
    methodName: "setValues",
    payload: { values },
  });

  if (!didSet && attempt < 6) {
    setTimeout(() => {
      syncDetailFormValues({
        deps,
        values,
        selectedItemId,
        attempt: attempt + 1,
      });
    }, 0);
  }
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  if (!itemId) return;

  const { store, render } = deps;
  const characterItem = getCharacterItemById({ store, itemId });
  if (!characterItem) return;

  store.setSelectedItemId({ itemId: itemId });
  store.openEditDialog({ itemId: itemId });
  render();

  syncEditFormValues({
    deps,
    values: {
      name: characterItem.name || "",
      description: characterItem.description || "",
    },
  });
};

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  const { characters } = projectService.getState();
  store.setItems({ charactersData: characters });
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { characters } = projectService.getState();
  store.setItems({ charactersData: characters });
  const selectedItemId = store.selectSelectedItemId();
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render } = deps;
  const detail = payload?._event?.detail || {};
  const id = resolveDetailItemId(detail);
  const { isFolder } = detail;

  // If this is a folder, clear selection
  if (isFolder) {
    store.setSelectedItemId({ itemId: null });
    render();
    return;
  }

  if (!id) {
    return;
  }

  store.setSelectedItemId({ itemId: id });
  const selectedItem = detail.item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: id,
    });
  }
};

export const handleCharacterItemClick = async (deps, payload) => {
  const { store, render, refs } = deps;
  const detail = payload?._event?.detail || {};
  const itemId = resolveDetailItemId(detail);
  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });
  const selectedItem = detail.item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: itemId,
    });
  }
};

export const handleCharacterItemDoubleClick = async (deps, payload) => {
  const { store, refs } = deps;
  const detail = payload?._event?.detail || {};
  const isFolder = detail.isFolder === true;
  if (isFolder) return;

  const candidateIds = [detail.itemId, detail.id, store.selectSelectedItemId()];
  const itemId = candidateIds.find((candidateId) =>
    getCharacterItemById({ store, itemId: candidateId }),
  );
  if (!itemId) return;

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  openEditDialogWithValues({ deps, itemId: itemId });
};

export const handleCharacterCreated = async (deps, payload) => {
  const { store, render, projectService } = deps;
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
    await projectService.createResourceItem({
      resourceType: "characters",
      resourceId: characterData.id,
      data: characterData,
      parentId: groupId,
      position: "last",
    });

    // Update store with new data
    const { characters } = projectService.getState();
    store.setItems({ charactersData: characters });
    render();
  } catch (error) {
    console.error("Failed to create character:", error);

    throw error;
  }
};

export const handleSpritesButtonClick = (deps, payload) => {
  const { appService, render } = deps;
  const { itemId } = payload._event.detail;
  const { p } = appService.getPayload();

  // Navigate to character sprites page
  appService.navigate("/project/resources/character-sprites", {
    characterId: itemId,
    p: p,
  });

  render();
};

export const handleDetailPanelAvatarClick = async (deps) => {
  const { appService, projectService, store, render } = deps;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn("No item selected for image replacement");
    return;
  }

  const files = await appService.pickFiles({
    accept: "image/*",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

  const { isValid, message } = await validateIconDimensions(file);
  if (!isValid) {
    appService.showToast(message, { title: "Error" });
    return;
  }

  try {
    // Upload the new avatar file using projectService
    const uploadedFiles = await projectService.uploadFiles([file]);

    if (uploadedFiles && uploadedFiles.length > 0) {
      const uploadedFile = uploadedFiles[0];

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
      await projectService.updateResourceItem({
        resourceType: "characters",
        resourceId: selectedItem.id,
        patch: updateData,
      });

      // Update the store with the new repository state and get new file URL
      const { characters } = projectService.getState();
      store.setItems({ charactersData: characters });
      const selectedItemId = store.selectSelectedItemId();
      const updatedSelectedItem = store.selectSelectedItem();
      const detailValues = createDetailFormValues(updatedSelectedItem);
      render();

      if (updatedSelectedItem) {
        syncDetailFormValues({
          deps,
          values: detailValues,
          selectedItemId,
        });
      }
    } else {
      console.error("Avatar upload failed:", file.name);
    }
  } catch (error) {
    console.error("Avatar upload error:", file.name, error);
  }
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  await projectService.updateResourceItem({
    resourceType: "characters",
    resourceId: selectedItemId,
    patch: {
      [payload._event.detail.name]: payload._event.detail.value,
    },
  });

  const { characters } = projectService.getState();
  store.setItems({ charactersData: characters });
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery({ query: searchQuery });
  render();
};

export const handleGroupToggle = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.toggleGroupCollapse({ groupId: groupId });
  render();
};

export const handleAddCharacterClick = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.setTargetGroupId({ groupId: groupId });
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
    const formData = payload._event.detail.values;
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
  const { store, render, appService, projectService } = deps;

  try {
    const files = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
    });

    if (files.length > 0) {
      const file = files[0];
      const { isValid, message } = await validateIconDimensions(file);
      if (!isValid) {
        appService.showToast(message, { title: "Error" });
        return;
      }

      const uploadResults = await projectService.uploadFiles([file]);

      if (!uploadResults || uploadResults.length === 0) {
        throw new Error("Failed to upload avatar image");
      }

      const result = uploadResults[0];
      store.setAvatarFileId({ fileId: result.fileId });
      render();
    }
  } catch (error) {
    console.error("Error uploading avatar:", error);
  }
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;

  const state = projectService.getState();
  const character = state.characters.items[itemId];

  let isUsed = false;

  if (character && character.sprites && character.sprites.items) {
    for (const spriteId of Object.keys(character.sprites.items)) {
      const usage = recursivelyCheckResource({
        state,
        itemId: spriteId,
        checkTargets: ["scenes", "layouts"],
      });
      if (usage.isUsed) {
        isUsed = true;
        break;
      }
    }
  }

  if (isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  // Perform the delete operation
  await projectService.deleteResourceItem({
    resourceType,
    resourceId: itemId,
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems({ charactersData: data });
  render();
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditDialogAvatarClick = async (deps) => {
  const { store, render, appService, projectService } = deps;

  try {
    const files = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
    });

    if (files.length > 0) {
      const file = files[0];
      const { isValid, message } = await validateIconDimensions(file);
      if (!isValid) {
        appService.showToast(message, { title: "Error" });
        return;
      }

      const uploadResults = await projectService.uploadFiles([file]);

      if (!uploadResults || uploadResults.length === 0) {
        throw new Error("Failed to upload avatar image");
      }

      const result = uploadResults[0];
      store.setEditAvatarFileId({ fileId: result.fileId });
      render();
    }
  } catch (error) {
    console.error("Error uploading avatar:", error);
  }
};

export const handleEditFormAction = async (deps, payload) => {
  const { store, render, projectService } = deps;

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.values;
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

    await projectService.updateResourceItem({
      resourceType: "characters",
      resourceId: editItemId,
      patch: updateData,
    });

    const { characters } = projectService.getState();
    store.setItems({ charactersData: characters });
    const selectedItemId = store.selectSelectedItemId();
    const selectedItem = store.selectSelectedItem();
    const detailValues = createDetailFormValues(selectedItem);
    store.closeEditDialog();
    render();

    if (selectedItem) {
      syncDetailFormValues({
        deps,
        values: detailValues,
        selectedItemId,
      });
    }
  }
};
