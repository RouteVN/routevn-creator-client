import { nanoid } from "nanoid";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { tap } from "rxjs";

const syncCharactersData = ({
  store,
  repositoryState,
  projectService,
} = {}) => {
  const state = repositoryState ?? projectService?.getState?.();
  store.setItems({ charactersData: state?.characters });
};

const getCharacterItemById = ({ store, itemId } = {}) => {
  if (!itemId) return undefined;
  const item = store.getState().charactersData?.items?.[itemId];
  if (!item || item.type !== "character") return undefined;
  return item;
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  if (!itemId) return;

  const { store, render, refs } = deps;
  const { editForm, fileExplorer } = refs;
  const characterItem = getCharacterItemById({ store, itemId });
  if (!characterItem) return;

  store.setSelectedItemId({ itemId });
  fileExplorer.selectItem({ itemId });
  store.openEditDialog({ itemId });
  render();

  editForm.reset();
  editForm.setValues({
    values: {
      name: characterItem.name ?? "",
      description: characterItem.description ?? "",
      shortcut: characterItem.shortcut ?? "",
    },
  });
};

export const handleBeforeMount = (deps) => {
  const { projectService, store, render } = deps;
  const subscription = createProjectStateStream({ projectService })
    .pipe(
      tap(({ repositoryState }) => {
        syncCharactersData({ store, repositoryState });
        render();
      }),
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
};

const refreshCharactersData = async (deps) => {
  const { store, render, projectService } = deps;
  syncCharactersData({ store, projectService });
  render();
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createResourceFileExplorerHandlers({
    resourceType: "characters",
    refresh: refreshCharactersData,
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export const handleDataChanged = refreshCharactersData;

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;

  if (isFolder) {
    store.setSelectedItemId({ itemId: undefined });
    render();
    return;
  }

  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId });
  render();
};

export const handleCharacterItemClick = async (deps, payload) => {
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.selectItem({ itemId });
  render();
};

export const handleCharacterItemDoubleClick = async (deps, payload) => {
  const { refs } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) return;

  const { fileExplorer } = refs;
  fileExplorer.selectItem({ itemId });

  openEditDialogWithValues({ deps, itemId });
};

export const handleCharacterCreated = async (deps, payload) => {
  const { projectService } = deps;
  const { groupId, name, description, shortcut, avatarFileId } =
    payload._event.detail;
  const characterId = nanoid();
  const defaultSpritesFolderId = nanoid();
  const characterData = {
    type: "character",
    name,
    description,
    shortcut: shortcut || "",
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
          parentId: null,
        },
      },
    },
  };

  if (avatarFileId) {
    characterData.fileId = avatarFileId;
  }

  await projectService.createCharacter({
    characterId,
    data: characterData,
    parentId: groupId,
    position: "last",
  });

  await refreshCharactersData(deps);
};

export const handleSpritesButtonClick = (deps, payload) => {
  const { appService, render } = deps;
  const { itemId } = payload._event.detail;
  const { p } = appService.getPayload();

  // Navigate to character sprites page
  appService.navigate("/project/character-sprites", {
    characterId: itemId,
    p: p,
  });

  render();
};

export const handleDetailPanelAvatarClick = async (deps) => {
  const { appService, projectService, store } = deps;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn("No item selected for image replacement");
    return;
  }

  const file = await appService.pickFiles({
    accept: "image/*",
    multiple: false,
    validations: [{ type: "square" }],
  });

  if (!file) {
    return; // User cancelled
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
      await projectService.updateCharacter({
        characterId: selectedItem.id,
        data: updateData,
      });

      // Update the store with the new repository state and get new file URL
      await refreshCharactersData(deps);
    } else {
      console.error("Avatar upload failed:", file.name);
    }
  } catch (error) {
    console.error("Avatar upload error:", file.name, error);
  }
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery({ query: searchQuery });
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
          shortcut: formData.shortcut || "",
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
    const file = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
      validations: [{ type: "square" }],
    });

    if (file) {
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
  const { projectService, appService, render } = deps;
  const { itemId } = payload._event.detail;

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
  await projectService.deleteCharacters({
    characterIds: [itemId],
  });

  await refreshCharactersData(deps);
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditDialogAvatarClick = async (deps) => {
  const { store, render, appService, projectService } = deps;

  try {
    const file = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
      validations: [{ type: "square" }],
    });

    if (file) {
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
      shortcut: formData.shortcut || "",
    };

    // Include avatar file ID if it was changed
    if (editAvatarFileId) {
      updateData.fileId = editAvatarFileId;
    }

    await projectService.updateCharacter({
      characterId: editItemId,
      data: updateData,
    });

    await refreshCharactersData(deps);
    store.closeEditDialog();
    render();
  }
};
