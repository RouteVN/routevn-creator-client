import { nanoid } from "nanoid";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
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
  const { appService, projectService } = deps;
  const {
    groupId,
    name,
    description,
    shortcut,
    avatarFileId,
    avatarUploadResult,
  } = payload._event.detail;
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
          id: defaultSpritesFolderId,
          type: "folder",
          name: "Default Sprites",
        },
      },
    },
  };

  if (avatarFileId) {
    characterData.fileId = avatarFileId;
  }

  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to create character.",
    action: () =>
      projectService.createCharacter({
        characterId,
        fileRecords: avatarUploadResult?.fileRecords,
        data: characterData,
        parentId: groupId,
        position: "last",
      }),
  });

  if (!createAttempt.ok) {
    return createAttempt.result ?? { valid: false };
  }

  await refreshCharactersData(deps);
  return createAttempt.result;
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

  let file;
  try {
    file = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
      validations: [{ type: "square" }],
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to select avatar image.",
    });
    return;
  }

  if (!file) {
    return; // User cancelled
  }

  try {
    // Upload the new avatar file using projectService
    const uploadedFiles = await projectService.uploadFiles([file]);

    const uploadedFile = uploadedFiles?.[0];
    if (!uploadedFile) {
      showResourcePageError({
        appService,
        errorOrResult: "Failed to upload avatar image.",
        fallbackMessage: "Failed to upload avatar image.",
      });
      return;
    }

    const updateData = {
      fileId: uploadedFile.fileId,
      fileType: file.type,
      fileSize: file.size,
    };
    if (!selectedItem.name || selectedItem.name === "Untitled Character") {
      updateData.name = file.name.replace(/\.[^/.]+$/, "");
    }

    const updateAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to update character avatar.",
      action: () =>
        projectService.updateCharacter({
          characterId: selectedItem.id,
          fileRecords: uploadedFile.fileRecords,
          data: updateData,
        }),
    });

    if (!updateAttempt.ok) {
      return;
    }

    await refreshCharactersData(deps);
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to upload avatar image.",
    });
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

export const handleDialogFormActionClick = async (deps, payload) => {
  const { appService, store, render } = deps;
  const actionId = payload._event.detail.actionId;

  if (actionId === "submit") {
    const formData = payload._event.detail.values;
    const name = formData.name?.trim();
    if (!name) {
      appService.showToast("Character name is required.", {
        title: "Warning",
      });
      return;
    }

    const targetGroupId = store.selectTargetGroupId();
    const avatarFileId = store.selectAvatarFileId();
    const avatarUploadResult = store.getState().avatarUploadResult;

    // Create a synthetic event payload with the correct structure
    const characterCreatedPayload = {
      _event: {
        detail: {
          groupId: targetGroupId,
          name,
          description: formData.description,
          shortcut: formData.shortcut || "",
          avatarFileId: avatarFileId,
          avatarUploadResult,
        },
      },
    };

    // Handle the character creation directly with correct payload
    const createResult = await handleCharacterCreated(
      deps,
      characterCreatedPayload,
    );
    if (createResult?.valid === false) {
      return;
    }

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
        showResourcePageError({
          appService,
          errorOrResult: "Failed to upload avatar image.",
          fallbackMessage: "Failed to upload avatar image.",
        });
        return;
      }

      const result = uploadResults[0];
      store.setAvatarFileId({
        fileId: result.fileId,
        uploadResult: result,
      });
      render();
    }
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to upload avatar image.",
    });
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
        showResourcePageError({
          appService,
          errorOrResult: "Failed to upload avatar image.",
          fallbackMessage: "Failed to upload avatar image.",
        });
        return;
      }

      const result = uploadResults[0];
      store.setEditAvatarFileId({
        fileId: result.fileId,
        uploadResult: result,
      });
      render();
    }
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to upload avatar image.",
    });
  }
};

export const handleEditFormAction = async (deps, payload) => {
  const { appService, store, render, projectService } = deps;

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.values;
    const editItemId = store.getState().editItemId;
    const { editAvatarFileId, editAvatarUploadResult } = store.getState();

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

    const updateAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to update character.",
      action: () =>
        projectService.updateCharacter({
          characterId: editItemId,
          fileRecords: editAvatarUploadResult?.fileRecords,
          data: updateData,
        }),
    });

    if (!updateAttempt.ok) {
      return;
    }

    await refreshCharactersData(deps);
    store.closeEditDialog();
    render();
  }
};
