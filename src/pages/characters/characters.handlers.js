import { generateId } from "../../internal/id.js";
import { CHARACTER_SPRITE_TAG_SCOPE_PREFIX } from "../../internal/project/commands.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import {
  appendTagIdToForm,
  createResourcePageTagHandlers,
} from "../../internal/ui/resourcePages/tags.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  closeMobileResourceFileExplorerAfterSelection,
  handleMobileResourceDetailSheetClose,
  handleMobileResourceFileExplorerClose,
  handleMobileResourceFileExplorerOpen,
  syncMobileResourcePageUiConfig,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { tap } from "rxjs";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import {
  CHARACTER_TAG_SCOPE_KEY,
  SPRITE_GROUPS_CREATE_MESSAGE,
} from "./characters.store.js";
import { validateSpriteGroupsForSave } from "./support/spriteGroups.js";
import {
  buildSpriteGroupInUseMessage,
  findSpriteGroupUsage,
} from "./support/spriteGroupUsage.js";

const AVATAR_VALIDATIONS = [
  {
    type: "image-min-size",
    minWidth: 64,
    minHeight: 64,
  },
];

const EMPTY_CHARACTER_FORM_VALUES = {
  name: "",
  description: "",
  shortcut: "",
  tagIds: [],
};

const resolveCharacterSpriteTagScopeKey = (characterId) =>
  `${CHARACTER_SPRITE_TAG_SCOPE_PREFIX}${characterId}`;

const buildSpriteTagsByCharacterId = (state) => {
  const spriteTagsByCharacterId = {};

  for (const [characterId, item] of Object.entries(
    state?.characters?.items ?? {},
  )) {
    if (item?.type !== "character") {
      continue;
    }

    spriteTagsByCharacterId[characterId] = getTagsCollection(
      state,
      resolveCharacterSpriteTagScopeKey(characterId),
    );
  }

  return spriteTagsByCharacterId;
};

const getValidSpriteGroupTagIds = ({ store, target, itemId } = {}) => {
  const state = store.getState();
  const characterId =
    itemId ?? (target === "edit" ? state.editItemId : undefined);
  return new Set(
    Object.keys(state.spriteTagsByCharacterId?.[characterId]?.items ?? {}),
  );
};

const syncCharactersData = ({
  store,
  repositoryState,
  projectService,
} = {}) => {
  const state =
    repositoryState ??
    projectService.getRepositoryState?.() ??
    projectService.getState();
  const tagsData = getTagsCollection(state, CHARACTER_TAG_SCOPE_KEY);
  const spriteTagsByCharacterId = buildSpriteTagsByCharacterId(state);

  store.setTagsData({ tagsData });
  store.setSpriteTagsByCharacterId({ spriteTagsByCharacterId });
  store.setItems({
    charactersData: resolveCollectionWithTags({
      collection: state?.characters,
      tagsCollection: tagsData,
      itemType: "character",
    }),
  });
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
  fileExplorer?.selectItem?.({ itemId });
  store.openEditDialog({
    itemId,
    spriteGroups: characterItem.spriteGroups ?? [],
  });
  render();

  editForm.reset();
  editForm.setValues({
    values: {
      name: characterItem.name ?? "",
      description: characterItem.description ?? "",
      shortcut: characterItem.shortcut ?? "",
      tagIds: characterItem.tagIds ?? [],
    },
  });
};

const openAvatarCropDialog = ({ deps, target, file } = {}) => {
  if (!file) {
    return;
  }

  const { store, render } = deps;
  store.openAvatarCropDialog({ target, file });
  render();
};

const resetAddCharacterForm = ({ refs } = {}) => {
  const { characterForm } = refs;
  characterForm?.reset?.();
  characterForm?.setValues?.({
    values: EMPTY_CHARACTER_FORM_VALUES,
  });
};

const uploadAvatarFile = async ({ deps, file, target } = {}) => {
  const { appService, projectService, store } = deps;
  let uploadResults;
  try {
    uploadResults = await projectService.uploadFiles([file], {
      skipImageThumbnail: true,
    });
  } catch {
    uploadResults = undefined;
  }

  const result = uploadResults?.[0];
  if (!result?.fileId) {
    showResourcePageError({
      appService,
      errorOrResult: "Failed to upload avatar image.",
      fallbackMessage: "Failed to upload avatar image.",
    });
    return false;
  }

  if (target === "edit") {
    store.setEditAvatarFileId({
      fileId: result.fileId,
      uploadResult: result,
    });
    return true;
  }

  store.setAvatarFileId({
    fileId: result.fileId,
    uploadResult: result,
  });
  return true;
};

export const handleBeforeMount = (deps) => {
  const { projectService, store, render } = deps;
  syncMobileResourcePageUiConfig(deps);
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

export const handleAfterMount = (deps) => {
  focusFileExplorerKeyboardScope(deps);
};

const refreshCharactersData = async (deps) => {
  const { store, render, projectService } = deps;
  syncCharactersData({ store, projectService });
  render();
};

const readSpriteGroupTarget = (payload) =>
  payload?._event?.currentTarget?.dataset?.target === "edit" ? "edit" : "add";

const readSpriteGroupIndex = (payload) =>
  Number.parseInt(payload?._event?.currentTarget?.dataset?.index ?? "", 10);

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createResourceFileExplorerHandlers({
    resourceType: "characters",
    refresh: refreshCharactersData,
  });
const {
  focusKeyboardScope: focusFileExplorerKeyboardScope,
  handleKeyboardScopeClick: handleFileExplorerKeyboardScopeClick,
  handleKeyboardScopeKeyDown: handleFileExplorerKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers();

export {
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleMobileResourceFileExplorerOpen as handleMobileFileExplorerOpen,
  handleMobileResourceFileExplorerClose as handleMobileFileExplorerClose,
  handleMobileResourceDetailSheetClose as handleMobileDetailSheetClose,
};

export const handleDataChanged = refreshCharactersData;

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;

  if (isFolder) {
    store.setSelectedItemId({ itemId: undefined });
    render();
    focusFileExplorerKeyboardScope(deps);
    return;
  }

  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId });
  closeMobileResourceFileExplorerAfterSelection(deps);
  render();
  focusFileExplorerKeyboardScope(deps);
};

export const handleCharacterItemClick = async (deps, payload) => {
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer?.selectItem?.({ itemId });
  render();
};

export const handleCharacterItemDoubleClick = async (deps, payload) => {
  const { refs } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) return;

  const { fileExplorer } = refs;
  fileExplorer?.selectItem?.({ itemId });
  handleSpritesButtonClick(deps, payload);
};

export const handleDetailHeaderClick = (deps) => {
  const { store } = deps;
  const itemId = store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  openEditDialogWithValues({ deps, itemId });
};

export const handleCharacterCreated = async (deps, payload) => {
  const { appService, projectService } = deps;
  const detail = payload._event.detail;
  const {
    groupId,
    name,
    description,
    shortcut,
    tagIds,
    spriteGroups,
    avatarFileId,
    avatarUploadResult,
  } = detail;
  const characterId = generateId();
  const defaultSpritesFolderId = generateId();
  const characterData = {
    type: "character",
    name,
    description,
    shortcut: shortcut || "",
    tagIds: Array.isArray(tagIds) ? tagIds : [],
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

  if (Array.isArray(spriteGroups) && spriteGroups.length > 0) {
    characterData.spriteGroups = spriteGroups;
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
  store.hideSpriteGroupDropdownMenu();
  store.setSpriteGroups({
    target: "add",
    spriteGroups: [],
  });
  store.toggleDialog();
  render();
  resetAddCharacterForm(deps);
};

export const handleCharacterFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({
    deps,
    mode: "create-form",
  });
};

export const handleEditFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({
    deps,
    mode: "edit-form",
    itemId: deps.store.getState().editItemId,
  });
};

export const handleCloseDialog = (deps) => {
  const { store, render } = deps;
  store.closeAvatarCropDialog();
  store.clearAvatarState();
  store.hideSpriteGroupDropdownMenu();
  store.setSpriteGroups({
    target: "add",
    spriteGroups: [],
  });
  resetAddCharacterForm(deps);
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
      appService.showAlert({
        message: "Character name is required.",
        title: "Warning",
      });
      return;
    }

    if ((store.getState().dialogSpriteGroups ?? []).length > 0) {
      appService.showAlert({
        message: SPRITE_GROUPS_CREATE_MESSAGE,
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
          tagIds: Array.isArray(formData.tagIds) ? formData.tagIds : [],
          spriteGroups: [],
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
    store.setSpriteGroups({
      target: "add",
      spriteGroups: [],
    });
    resetAddCharacterForm(deps);
    store.toggleDialog();
    render();
  }
};

const {
  openCreateTagDialogForMode,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
} = createResourcePageTagHandlers({
  resolveScopeKey: () => CHARACTER_TAG_SCOPE_KEY,
  updateItemTagIds: ({ deps, itemId, tagIds }) =>
    deps.projectService.updateCharacter({
      characterId: itemId,
      data: {
        tagIds,
      },
    }),
  refreshAfterItemTagUpdate: ({ deps }) => refreshCharactersData(deps),
  getSelectedItemTagIds: ({ deps, itemId }) =>
    getCharacterItemById({
      store: deps.store,
      itemId: itemId ?? deps.store.selectSelectedItemId(),
    })?.tagIds ?? [],
  appendCreatedTagByMode: ({ deps, mode, tagId }) => {
    if (mode === "create-form") {
      appendTagIdToForm({
        form: deps.refs.characterForm,
        tagId,
      });
      return;
    }

    if (mode !== "edit-form") {
      return;
    }

    appendTagIdToForm({
      form: deps.refs.editForm,
      tagId,
    });
  },
  updateItemTagFallbackMessage: "Failed to update character tags.",
});

export {
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
};

export const handleDialogAvatarClick = async (deps) => {
  const { appService } = deps;

  try {
    const file = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
      validations: AVATAR_VALIDATIONS,
    });

    if (file) {
      openAvatarCropDialog({
        deps,
        target: "add",
        file,
      });
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
      const usage = await projectService.checkResourceUsage({
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
    appService.showAlert({
      message: "Cannot delete resource, it is currently in use.",
    });
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
  store.closeAvatarCropDialog();
  store.hideSpriteGroupDropdownMenu();
  store.closeEditDialog();
  render();
};

export const handleEditDialogAvatarClick = async (deps) => {
  const { appService } = deps;

  try {
    const file = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
      validations: AVATAR_VALIDATIONS,
    });

    if (file) {
      openAvatarCropDialog({
        deps,
        target: "edit",
        file,
      });
    }
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to upload avatar image.",
    });
  }
};

export const handleAvatarCropDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeAvatarCropDialog();
  render();
};

export const handleAvatarCropDialogConfirm = async (deps) => {
  const { appService, refs, render, store } = deps;
  const target = store.selectAvatarCropTarget();

  try {
    const croppedFile = await refs.avatarCropDialog?.getCroppedFile?.();
    if (!croppedFile) {
      appService.showAlert({
        message: "Avatar crop is not ready yet.",
        title: "Warning",
      });
      return;
    }

    const didUpload = await uploadAvatarFile({
      deps,
      file: croppedFile,
      target,
    });
    if (!didUpload) {
      return;
    }

    store.closeAvatarCropDialog();
    render();
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to crop avatar image.",
    });
  }
};

export const handleSpriteGroupAddClick = (deps, payload) => {
  const { appService, store, render } = deps;
  const target = readSpriteGroupTarget(payload);
  if (target === "add") {
    appService.showAlert({
      message: SPRITE_GROUPS_CREATE_MESSAGE,
      title: "Warning",
    });
    return;
  }

  store.hideSpriteGroupDropdownMenu();
  store.openSpriteGroupDialog({
    target,
  });
  render();
};

export const handleSpriteGroupDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeSpriteGroupDialog();
  render();
};

export const handleSpriteGroupCardClick = (deps, payload) => {
  const { store, render } = deps;
  const index = readSpriteGroupIndex(payload);
  if (Number.isNaN(index)) {
    return;
  }

  store.hideSpriteGroupDropdownMenu();
  store.openSpriteGroupDialog({
    target: readSpriteGroupTarget(payload),
    index,
  });
  render();
};

export const handleSpriteGroupFormAction = (deps, payload) => {
  const { appService, store, render } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const state = store.getState();
  const target = state.spriteGroupDialogTarget ?? "edit";
  const index = state.spriteGroupDialogIndex;
  const isEditing = Number.isInteger(index);
  if (target === "add") {
    appService.showAlert({
      message: SPRITE_GROUPS_CREATE_MESSAGE,
      title: "Warning",
    });
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: "Sprite group name is required.",
      title: "Warning",
    });
    return;
  }

  const validation = validateSpriteGroupsForSave({
    spriteGroups: [
      {
        id: isEditing
          ? (target === "edit"
              ? state.editSpriteGroups
              : state.dialogSpriteGroups)?.[index]?.id
          : undefined,
        name,
        tags: Array.isArray(values?.tags) ? values.tags : [],
      },
    ],
    validTagIds: getValidSpriteGroupTagIds({
      store,
      target,
      itemId: state.editItemId,
    }),
  });

  if (!validation.valid) {
    appService.showAlert({
      message: validation.message,
      title: "Warning",
    });
    return;
  }

  const spriteGroup = validation.spriteGroups[0];
  if (isEditing) {
    store.updateSpriteGroup({
      target,
      index,
      name: spriteGroup.name,
      tags: spriteGroup.tags,
    });
  } else {
    store.addSpriteGroup({
      target,
      name: spriteGroup.name,
      tags: spriteGroup.tags,
    });
  }
  store.closeSpriteGroupDialog();
  render();
};

export const handleSpriteGroupContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();

  const index = readSpriteGroupIndex(payload);
  if (Number.isNaN(index)) {
    return;
  }

  store.showSpriteGroupDropdownMenu({
    target: readSpriteGroupTarget(payload),
    index,
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
  render();
};

export const handleSpriteGroupDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideSpriteGroupDropdownMenu();
  render();
};

export const handleSpriteGroupDropdownMenuItemClick = (deps, payload) => {
  const { appService, projectService, store, render } = deps;
  const detail = payload._event.detail;
  const item = detail.item || detail;
  const state = store.getState();
  const { target, index } = state.spriteGroupDropdownMenu;

  store.hideSpriteGroupDropdownMenu();

  if (!target || Number.isNaN(index)) {
    render();
    return;
  }

  if (item.value === "move-up") {
    store.moveSpriteGroup({
      target,
      index,
      offset: -1,
    });
  }

  if (item.value === "move-down") {
    store.moveSpriteGroup({
      target,
      index,
      offset: 1,
    });
  }

  if (item.value === "remove") {
    if (target === "edit") {
      const spriteGroup = state.editSpriteGroups?.[index];
      const usage = findSpriteGroupUsage({
        repositoryState: projectService?.getRepositoryState?.(),
        characterId: state.editItemId,
        spriteGroupId: spriteGroup?.id,
      });

      if (usage) {
        appService.showAlert({
          message: buildSpriteGroupInUseMessage({
            spriteGroupName: spriteGroup?.name,
            usage,
          }),
          title: "Warning",
        });
        render();
        return;
      }
    }

    store.removeSpriteGroup({
      target,
      index,
    });
  }

  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { appService, store, render, projectService } = deps;

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.values;
    const editItemId = store.getState().editItemId;
    const { editAvatarFileId, editAvatarUploadResult } = store.getState();
    const spriteGroupValidation = validateSpriteGroupsForSave({
      spriteGroups: store.getState().editSpriteGroups,
      validTagIds: getValidSpriteGroupTagIds({
        store,
        target: "edit",
        itemId: editItemId,
      }),
    });
    if (!spriteGroupValidation.valid) {
      appService.showAlert({
        message: spriteGroupValidation.message,
        title: "Warning",
      });
      return;
    }

    // Update the character in the repository
    const updateData = {
      name: formData.name,
      description: formData.description,
      shortcut: formData.shortcut || "",
      tagIds: Array.isArray(formData.tagIds) ? formData.tagIds : [],
      spriteGroups: spriteGroupValidation.spriteGroups,
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
