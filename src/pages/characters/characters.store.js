import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import {
  buildMobileResourcePageViewData,
  closeMobileResourceFileExplorerState,
  createMobileResourcePageState,
  openMobileResourceFileExplorerState,
  selectIsMobileFileExplorerOpenState,
  selectIsTouchModeState,
  selectSuppressMobileDetailSheetState,
  setMobileResourceDetailSheetSuppressedState,
  setMobileResourcePageUiConfigState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  buildTagFilterOptions,
  createEmptyTagCollection,
  matchesTagAwareSearch,
  matchesTagFilter,
} from "../../internal/resourceTags.js";
import {
  buildDraftSpriteGroupViewData,
  buildSpriteGroupViewData,
  createEmptySpriteGroup,
  normalizeSpriteGroupsForDraft,
  reverseSpriteGroups,
} from "./support/spriteGroups.js";
import { getVariableOptions } from "../../internal/project/projection.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { selectCharactersPageCopy } from "./support/charactersPageCopy.js";

const createFolderContextMenuItems = (copy) => [
  { label: copy.newFolderMenuItem, type: "item", value: "new-child-folder" },
  { label: copy.renameMenuItem, type: "item", value: "rename-item" },
  { label: copy.deleteMenuItem, type: "item", value: "delete-item" },
];

const createItemContextMenuItems = (copy) => [
  { label: copy.renameMenuItem, type: "item", value: "rename-item" },
  { label: copy.deleteMenuItem, type: "item", value: "delete-item" },
];

const createEmptyContextMenuItems = (copy) => [
  { label: copy.newFolderMenuItem, type: "item", value: "new-item" },
];

const CHARACTER_SHORTCUT_OPTIONS = [
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "4", value: "4" },
  { label: "5", value: "5" },
  { label: "6", value: "6" },
  { label: "7", value: "7" },
  { label: "8", value: "8" },
  { label: "9", value: "9" },
];

const CHARACTER_TAG_SCOPE_KEY = "characters";
const CREATE_TAG_DEFAULT_VALUES = Object.freeze({
  name: "",
});
const SPRITE_GROUP_DIALOG_DEFAULT_VALUES = Object.freeze({
  name: "",
  tags: [],
});
const createTagForm = (copy) => ({
  title: copy.createTagTitle,
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.tagNameLabel,
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.createTagButton,
      },
    ],
  },
});

const createFolderNameForm = (copy) => ({
  title: copy.editFolderTitle,
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel,
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel,
      required: false,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.saveButton,
        validate: true,
      },
    ],
  },
});
const createCharacterTagField = ({ tagOptions, copy } = {}) => ({
  name: "tagIds",
  type: "tag-select",
  label: copy.tagsLabel,
  placeholder: copy.selectTagsPlaceholder,
  options: tagOptions ?? [],
  addOption: {
    label: copy.addTagOption,
  },
  required: false,
});

const createCharacterNameVariableOptions = (variablesData = {}) =>
  getVariableOptions(variablesData, {
    type: "string",
  });

const createCharacterNameVariableField = ({
  nameVariableOptions,
  copy,
} = {}) => ({
  name: "nameVariableId",
  type: "select",
  label: copy.nameVariableLabel,
  description: copy.nameVariableDescription,
  clearable: true,
  placeholder: copy.nameVariablePlaceholder,
  options:
    nameVariableOptions ?? createCharacterNameVariableOptions({ items: {} }),
  required: false,
});

const createSpriteGroupField = (copy) => ({
  type: "slot",
  slot: "sprite-groups-slot",
  label: copy.spriteGroupsLabel,
});

const createCharacterDialogForm = ({
  tagOptions,
  nameVariableOptions,
  copy,
} = {}) => ({
  title: copy.addCharacterTitle,
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel,
      required: true,
    },
    {
      name: "description",
      type: "input-text",
      label: copy.descriptionLabel,
      required: false,
    },
    {
      name: "shortcut",
      type: "select",
      label: copy.shortcutLabel,
      description: copy.shortcutDescription,
      options: CHARACTER_SHORTCUT_OPTIONS,
      required: false,
    },
    createCharacterTagField({ tagOptions, copy }),
    {
      type: "slot",
      slot: "avatar-slot",
      label: copy.avatarLabel,
    },
    createCharacterNameVariableField({ nameVariableOptions, copy }),
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.addCharacterButton,
      },
    ],
  },
});

const createEditCharacterDialogForm = ({
  tagOptions,
  nameVariableOptions,
  copy,
} = {}) => ({
  title: copy.editCharacterTitle,
  description: copy.editCharacterDescription,
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel,
      description: copy.characterNameDescription,
      required: true,
    },
    {
      name: "description",
      type: "input-text",
      label: copy.descriptionLabel,
      description: copy.characterDescriptionDescription,
      required: false,
    },
    {
      name: "shortcut",
      type: "select",
      label: copy.shortcutLabel,
      options: CHARACTER_SHORTCUT_OPTIONS,
      required: false,
    },
    createCharacterTagField({ tagOptions, copy }),
    {
      type: "slot",
      slot: "avatar-slot",
      label: copy.avatarLabel,
    },
    createSpriteGroupField(copy),
    createCharacterNameVariableField({ nameVariableOptions, copy }),
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.updateCharacterButton,
      },
    ],
  },
});

const createSpriteGroupDialogForm = ({ tagOptions, isEditing, copy } = {}) => ({
  title: isEditing ? copy.editSpriteGroupTitle : copy.addSpriteGroupTitle,
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel,
      required: true,
    },
    {
      name: "tags",
      type: "tag-select",
      label: copy.tagsLabel,
      placeholder: copy.selectTagsPlaceholder,
      options: tagOptions ?? [],
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: isEditing ? copy.updateGroupButton : copy.addGroupButton,
      },
    ],
  },
});

const getValidCharacterTagIds = (state) =>
  new Set(Object.keys(state.tagsData.items ?? {}));

const getSpriteTagsCollectionByCharacterId = ({ state, characterId } = {}) =>
  state.spriteTagsByCharacterId?.[characterId] ?? createEmptyTagCollection();

const getValidSpriteGroupTagIds = ({ state, target, itemId } = {}) => {
  const characterId =
    itemId ?? (target === "edit" ? state.editItemId : undefined);
  return new Set(
    Object.keys(
      getSpriteTagsCollectionByCharacterId({
        state,
        characterId,
      }).items ?? {},
    ),
  );
};

const normalizeDraftSpriteGroups = ({
  state,
  spriteGroups,
  target,
  itemId,
} = {}) =>
  normalizeSpriteGroupsForDraft({
    spriteGroups,
    validTagIds: getValidSpriteGroupTagIds({
      state,
      target,
      itemId,
    }),
  });

const normalizeSavedSpriteGroupsForDraft = (payload = {}) =>
  reverseSpriteGroups(normalizeDraftSpriteGroups(payload));

const getSpriteGroupDraftKey = (target) =>
  target === "edit" ? "editSpriteGroups" : "dialogSpriteGroups";

export const buildSpriteGroupDropdownItems = ({ index, total, copy } = {}) => {
  const items = [];

  if (index > 0) {
    items.push({
      label: copy.moveUpMenuItem,
      type: "item",
      value: "move-up",
    });
  }

  if (index < total - 1) {
    items.push({
      label: copy.moveDownMenuItem,
      type: "item",
      value: "move-down",
    });
  }

  items.push({
    label: copy.removeMenuItem,
    type: "item",
    value: "remove",
  });

  return items;
};

export const createInitialState = () => ({
  charactersData: { tree: [], items: {} },
  variablesData: { tree: [], items: {} },
  tagsData: createEmptyTagCollection(),
  spriteTagsByCharacterId: {},
  activeTagIds: [],
  detailTagIds: [],
  detailTagIdsDirty: false,
  isDetailTagSelectOpen: false,
  selectedItemId: null,
  selectedFolderId: undefined,
  searchQuery: "",
  isFolderNameDialogOpen: false,
  folderNameDialogItemId: undefined,
  folderNameDialogDefaultValues: {
    name: "",
    description: "",
  },
  ...createMobileResourcePageState(),
  isDialogOpen: false,
  isCreateTagDialogOpen: false,
  createTagDefaultValues: {
    ...CREATE_TAG_DEFAULT_VALUES,
  },
  createTagContext: {
    mode: undefined,
    itemId: undefined,
    draftTagIds: [],
  },
  targetGroupId: null,
  avatarFileId: null,
  avatarUploadResult: null,
  isAvatarCropDialogOpen: false,
  avatarCropTarget: undefined,
  avatarCropFile: undefined,
  dialogDefaultValues: {
    name: "",
    nameVariableId: "",
    description: "",
    shortcut: "",
    tagIds: [],
  },
  dialogSpriteGroups: [],
  spriteGroupDropdownMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    target: undefined,
    index: undefined,
    items: [],
  },
  isSpriteGroupDialogOpen: false,
  spriteGroupDialogTarget: undefined,
  spriteGroupDialogIndex: undefined,
  spriteGroupDialogDefaultValues: {
    ...SPRITE_GROUP_DIALOG_DEFAULT_VALUES,
  },
  // Edit dialog state
  isEditDialogOpen: false,
  editItemId: null,
  editAvatarFileId: null,
  editAvatarUploadResult: null,
  editSpriteGroups: [],
});

export const setItems = ({ state }, { charactersData, variablesData } = {}) => {
  state.charactersData = charactersData;
  if (variablesData !== undefined) {
    state.variablesData = variablesData;
  }
  if (
    state.selectedFolderId &&
    state.charactersData?.items?.[state.selectedFolderId]?.type !== "folder"
  ) {
    state.selectedFolderId = undefined;
  }
  if (state.detailTagIdsDirty) {
    return;
  }

  const item = state.selectedItemId
    ? state.charactersData?.items?.[state.selectedItemId]
    : undefined;
  state.detailTagIds = Array.isArray(item?.tagIds) ? [...item.tagIds] : [];
  state.detailTagIdsDirty = false;
};

export const setTagsData = ({ state }, { tagsData } = {}) => {
  state.tagsData = tagsData ?? createEmptyTagCollection();
  const validTagIds = getValidCharacterTagIds(state);
  state.activeTagIds = state.activeTagIds.filter((tagId) =>
    validTagIds.has(tagId),
  );
  state.detailTagIds = state.detailTagIds.filter((tagId) =>
    validTagIds.has(tagId),
  );
};

export const setSpriteTagsByCharacterId = (
  { state },
  { spriteTagsByCharacterId } = {},
) => {
  state.spriteTagsByCharacterId = spriteTagsByCharacterId ?? {};
  state.dialogSpriteGroups = normalizeDraftSpriteGroups({
    state,
    target: "add",
    spriteGroups: state.dialogSpriteGroups,
  });
  state.editSpriteGroups = normalizeDraftSpriteGroups({
    state,
    target: "edit",
    spriteGroups: state.editSpriteGroups,
  });
};

export const setSelectedItemId = (
  { state },
  { itemId, suppressMobileDetailSheet = false } = {},
) => {
  state.selectedItemId = itemId;
  setMobileResourceDetailSheetSuppressedState(state, {
    itemId,
    suppressMobileDetailSheet,
  });
  if (itemId !== undefined) {
    state.selectedFolderId = undefined;
  }
  state.isDetailTagSelectOpen = false;
  const item = itemId ? state.charactersData?.items?.[itemId] : undefined;
  state.detailTagIds = Array.isArray(item?.tagIds) ? [...item.tagIds] : [];
  state.detailTagIdsDirty = false;
};

export const selectIsTouchMode = selectIsTouchModeState;

export const selectIsMobileFileExplorerOpen =
  selectIsMobileFileExplorerOpenState;

export const selectSuppressMobileDetailSheet =
  selectSuppressMobileDetailSheetState;

export const setSelectedFolderId = ({ state }, { folderId } = {}) => {
  state.selectedFolderId = folderId;
  if (folderId !== undefined) {
    state.selectedItemId = undefined;
    setMobileResourceDetailSheetSuppressedState(state, {
      itemId: undefined,
    });
    state.isDetailTagSelectOpen = false;
    state.detailTagIds = [];
    state.detailTagIdsDirty = false;
  }
};

export const openFolderNameDialog = (
  { state },
  { folderId, defaultValues } = {},
) => {
  state.isFolderNameDialogOpen = true;
  state.folderNameDialogItemId = folderId;
  state.folderNameDialogDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
  };
};

export const closeFolderNameDialog = ({ state }, _payload = {}) => {
  state.isFolderNameDialogOpen = false;
  state.folderNameDialogItemId = undefined;
  state.folderNameDialogDefaultValues = {
    name: "",
    description: "",
  };
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query;
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  setMobileResourcePageUiConfigState(state, {
    uiConfig,
  });
};

export const openMobileFileExplorer = ({ state }, _payload = {}) => {
  openMobileResourceFileExplorerState(state);
};

export const closeMobileFileExplorer = ({ state }, _payload = {}) => {
  closeMobileResourceFileExplorerState(state);
};

export const setTargetGroupId = ({ state }, { groupId } = {}) => {
  state.targetGroupId = groupId;
};

export const toggleDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = !state.isDialogOpen;
};

export const setActiveTagIds = ({ state }, { tagIds } = {}) => {
  const validTagIds = getValidCharacterTagIds(state);
  state.activeTagIds = [
    ...new Set((tagIds ?? []).filter((tagId) => validTagIds.has(tagId))),
  ];
};

export const setDetailTagIds = ({ state }, { tagIds } = {}) => {
  const validTagIds = getValidCharacterTagIds(state);
  state.detailTagIds = [
    ...new Set((tagIds ?? []).filter((tagId) => validTagIds.has(tagId))),
  ];
  state.detailTagIdsDirty = true;
};

export const commitDetailTagIds = ({ state }, { tagIds } = {}) => {
  const validTagIds = getValidCharacterTagIds(state);
  state.detailTagIds = [
    ...new Set((tagIds ?? []).filter((tagId) => validTagIds.has(tagId))),
  ];
  state.detailTagIdsDirty = false;
};

export const setDetailTagPopoverOpen = ({ state }, { open, item } = {}) => {
  state.isDetailTagSelectOpen = !!open;
  if (!state.isDetailTagSelectOpen && state.detailTagIdsDirty) {
    state.detailTagIds = Array.isArray(item?.tagIds) ? [...item.tagIds] : [];
    state.detailTagIdsDirty = false;
  }
};

export const openCreateTagDialog = (
  { state },
  { mode, itemId, draftTagIds } = {},
) => {
  state.isCreateTagDialogOpen = true;
  state.createTagDefaultValues = {
    ...CREATE_TAG_DEFAULT_VALUES,
  };
  state.createTagContext = {
    mode: mode ?? "item",
    itemId,
    draftTagIds: Array.isArray(draftTagIds) ? [...draftTagIds] : [],
  };
};

export const closeCreateTagDialog = ({ state }, _payload = {}) => {
  state.isCreateTagDialogOpen = false;
  state.createTagDefaultValues = {
    ...CREATE_TAG_DEFAULT_VALUES,
  };
  state.createTagContext = {
    mode: undefined,
    itemId: undefined,
    draftTagIds: [],
  };
};

export const setAvatarFileId = ({ state }, { fileId, uploadResult } = {}) => {
  state.avatarFileId = fileId ?? uploadResult?.fileId ?? null;
  state.avatarUploadResult = uploadResult ?? null;
};

export const clearAvatarState = ({ state }, _payload = {}) => {
  state.avatarFileId = null;
  state.avatarUploadResult = null;
};

export const setSpriteGroups = ({ state }, { target, spriteGroups } = {}) => {
  state[getSpriteGroupDraftKey(target)] = normalizeDraftSpriteGroups({
    state,
    target,
    spriteGroups,
  });
};

export const addSpriteGroup = ({ state }, { target, name, tags } = {}) => {
  const spriteGroup = createEmptySpriteGroup();
  spriteGroup.name = typeof name === "string" ? name : "";
  spriteGroup.tags = Array.isArray(tags) ? tags : [];

  const normalizedSpriteGroup = normalizeDraftSpriteGroups({
    state,
    target,
    spriteGroups: [spriteGroup],
  })[0];

  if (!normalizedSpriteGroup) {
    return;
  }

  state[getSpriteGroupDraftKey(target)].push(normalizedSpriteGroup);
};

export const updateSpriteGroupName = (
  { state },
  { target, index, name } = {},
) => {
  const spriteGroup = state[getSpriteGroupDraftKey(target)]?.[index];
  if (!spriteGroup) {
    return;
  }

  spriteGroup.name = typeof name === "string" ? name : "";
};

export const updateSpriteGroupTags = (
  { state },
  { target, index, tagIds } = {},
) => {
  const spriteGroup = state[getSpriteGroupDraftKey(target)]?.[index];
  if (!spriteGroup) {
    return;
  }

  spriteGroup.tags =
    normalizeDraftSpriteGroups({
      state,
      target,
      spriteGroups: [
        {
          id: spriteGroup.id,
          name: spriteGroup.name,
          tags: tagIds,
        },
      ],
    })[0]?.tags ?? [];
};

export const updateSpriteGroup = (
  { state },
  { target, index, name, tags } = {},
) => {
  const spriteGroup = state[getSpriteGroupDraftKey(target)]?.[index];
  if (!spriteGroup) {
    return;
  }

  const normalizedSpriteGroup = normalizeDraftSpriteGroups({
    state,
    target,
    spriteGroups: [
      {
        id: spriteGroup.id,
        name,
        tags,
      },
    ],
  })[0];

  if (!normalizedSpriteGroup) {
    return;
  }

  spriteGroup.name = normalizedSpriteGroup.name;
  spriteGroup.tags = normalizedSpriteGroup.tags;
};

export const removeSpriteGroup = ({ state }, { target, index } = {}) => {
  const spriteGroups = state[getSpriteGroupDraftKey(target)];
  if (index < 0 || index >= spriteGroups.length) {
    return;
  }

  spriteGroups.splice(index, 1);
};

export const moveSpriteGroup = ({ state }, { target, index, offset } = {}) => {
  const spriteGroups = state[getSpriteGroupDraftKey(target)];
  const nextIndex = index + offset;

  if (
    index < 0 ||
    index >= spriteGroups.length ||
    nextIndex < 0 ||
    nextIndex >= spriteGroups.length
  ) {
    return;
  }

  const [spriteGroup] = spriteGroups.splice(index, 1);
  spriteGroups.splice(nextIndex, 0, spriteGroup);
};

export const showSpriteGroupDropdownMenu = (
  { state },
  { target, index, x, y, items } = {},
) => {
  const spriteGroups = state[getSpriteGroupDraftKey(target)];
  if (index < 0 || index >= spriteGroups.length) {
    return;
  }

  state.spriteGroupDropdownMenu = {
    isOpen: true,
    x: x ?? 0,
    y: y ?? 0,
    target,
    index,
    items: items ?? [],
  };
};

export const hideSpriteGroupDropdownMenu = ({ state }, _payload = {}) => {
  state.spriteGroupDropdownMenu = {
    isOpen: false,
    x: 0,
    y: 0,
    target: undefined,
    index: undefined,
    items: [],
  };
};

export const openSpriteGroupDialog = ({ state }, { target, index } = {}) => {
  const resolvedTarget = target ?? "edit";
  const spriteGroups = state[getSpriteGroupDraftKey(resolvedTarget)] ?? [];
  const hasSpriteGroup =
    Number.isInteger(index) && index >= 0 && index < spriteGroups.length;
  const spriteGroup = hasSpriteGroup ? spriteGroups[index] : undefined;

  state.isSpriteGroupDialogOpen = true;
  state.spriteGroupDialogTarget = resolvedTarget;
  state.spriteGroupDialogIndex = hasSpriteGroup ? index : undefined;
  state.spriteGroupDialogDefaultValues = spriteGroup
    ? {
        name: spriteGroup.name,
        tags: Array.isArray(spriteGroup.tags) ? [...spriteGroup.tags] : [],
      }
    : {
        ...SPRITE_GROUP_DIALOG_DEFAULT_VALUES,
      };
};

export const closeSpriteGroupDialog = ({ state }, _payload = {}) => {
  state.isSpriteGroupDialogOpen = false;
  state.spriteGroupDialogTarget = undefined;
  state.spriteGroupDialogIndex = undefined;
  state.spriteGroupDialogDefaultValues = {
    ...SPRITE_GROUP_DIALOG_DEFAULT_VALUES,
  };
};

export const openAvatarCropDialog = ({ state }, { target, file } = {}) => {
  state.isAvatarCropDialogOpen = true;
  state.avatarCropTarget = target;
  state.avatarCropFile = file;
};

export const closeAvatarCropDialog = ({ state }, _payload = {}) => {
  state.isAvatarCropDialogOpen = false;
  state.avatarCropTarget = undefined;
  state.avatarCropFile = undefined;
};

export const openEditDialog = ({ state }, { itemId, spriteGroups } = {}) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;

  // Set the initial avatar file ID from the selected item
  const flatItems = toFlatItems(state.charactersData);
  const editItem = flatItems.find((item) => item.id === itemId);
  state.editAvatarFileId = editItem?.fileId || null;
  state.editAvatarUploadResult = null;
  state.editSpriteGroups = normalizeSavedSpriteGroupsForDraft({
    state,
    target: "edit",
    itemId,
    spriteGroups,
  });
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editItemId = null;
  state.editAvatarFileId = null;
  state.editAvatarUploadResult = null;
  state.editSpriteGroups = [];
  state.isSpriteGroupDialogOpen = false;
  state.spriteGroupDialogTarget = undefined;
  state.spriteGroupDialogIndex = undefined;
  state.spriteGroupDialogDefaultValues = {
    ...SPRITE_GROUP_DIALOG_DEFAULT_VALUES,
  };
  state.spriteGroupDropdownMenu = {
    isOpen: false,
    x: 0,
    y: 0,
    target: undefined,
    index: undefined,
    items: [],
  };
};

export const setEditAvatarFileId = (
  { state },
  { fileId, uploadResult } = {},
) => {
  state.editAvatarFileId = fileId ?? uploadResult?.fileId ?? null;
  state.editAvatarUploadResult = uploadResult ?? null;
};

export const selectTargetGroupId = ({ state }) => state.targetGroupId;
export const selectAvatarFileId = ({ state }) => state.avatarFileId;
export const selectAvatarCropTarget = ({ state }) => state.avatarCropTarget;

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.charactersData contains the full structure with tree and items
  const flatItems = toFlatItems(state.charactersData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const selectSelectedFolderId = ({ state }) => {
  return state.selectedFolderId;
};

export const selectFolderById = ({ state }, { folderId } = {}) => {
  const item = state.charactersData?.items?.[folderId];
  return item?.type === "folder" ? item : undefined;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCharactersPageCopy(i18n);
  const flatItems = applyFolderRequiredRootDragOptions(
    toFlatItems(state.charactersData),
  );
  const rawFlatGroups = toFlatGroups(state.charactersData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;
  const selectedFolder = state.selectedFolderId
    ? state.charactersData?.items?.[state.selectedFolderId]
    : undefined;
  const selectedDetailId = selectedItem?.id ?? selectedFolder?.id;
  const selectedDetailName = selectedItem?.name ?? selectedFolder?.name ?? "";
  const tagFilterOptions = buildTagFilterOptions({
    tagsCollection: state.tagsData,
  });
  const selectedItemSpriteTagsCollection = getSpriteTagsCollectionByCharacterId(
    {
      state,
      characterId: selectedItem?.id,
    },
  );
  const selectedItemSpriteGroups = buildSpriteGroupViewData({
    spriteGroups: selectedItem?.spriteGroups,
    tagsById: selectedItemSpriteTagsCollection.items ?? {},
    displayTopFirst: true,
  });
  const nameVariableOptions = createCharacterNameVariableOptions(
    state.variablesData,
  );
  const getNameVariableLabel = (variableId) => {
    if (!variableId) {
      return "";
    }

    const variable = state.variablesData?.items?.[variableId];
    if (variable?.type === "variable") {
      return variable.name ?? variableId;
    }

    return formatI18nCopy(copy.missingVariableLabel, { variableId });
  };

  let detailFields = [];
  if (selectedItem) {
    detailFields = [
      {
        type: "slot",
        slot: "avatar",
        label: "",
      },
      {
        type: "description",
        value: selectedItem.description ?? "",
      },
    ];
    if (selectedItem.nameVariableId) {
      detailFields.push({
        type: "text",
        label: copy.nameVariableLabel,
        value: getNameVariableLabel(selectedItem.nameVariableId),
      });
    }
    detailFields.push(
      {
        type: "text",
        label: copy.shortcutLabel,
        value: selectedItem.shortcut ?? "",
      },
      {
        type: "slot",
        slot: "character-tags",
        label: copy.tagsLabel,
      },
      {
        type: "slot",
        slot: "character-sprite-groups",
        label: copy.spriteGroupsLabel,
      },
    );
  } else if (selectedFolder?.type === "folder") {
    detailFields = [
      {
        type: "text",
        label: copy.typeLabel,
        value: copy.folderTypeValue,
      },
      {
        type: "description",
        value: selectedFolder.description ?? "",
      },
    ];
  }

  // Apply search filter
  const searchQuery = (state.searchQuery || "").toLowerCase().trim();
  const activeTagIds = state.activeTagIds ?? [];
  let filteredGroups = rawFlatGroups;

  if (searchQuery) {
    filteredGroups = rawFlatGroups
      .map((group) => {
        const filteredChildren = (group.children || []).filter((item) =>
          matchesTagAwareSearch(item, searchQuery),
        );

        const groupName = (group.name || "").toLowerCase();
        const shouldIncludeGroup =
          filteredChildren.length > 0 || groupName.includes(searchQuery);

        return shouldIncludeGroup
          ? {
              ...group,
              children: filteredChildren,
              hasChildren: filteredChildren.length > 0,
            }
          : null;
      })
      .filter(Boolean);
  }

  const flatGroups = filteredGroups
    .map((group) => ({
      ...group,
      children: (group.children || []).filter((item) =>
        matchesTagFilter({
          item,
          activeTagIds,
        }),
      ),
      hasChildren: (group.children || []).some((item) =>
        matchesTagFilter({
          item,
          activeTagIds,
        }),
      ),
    }))
    .filter((group) => group.children.length > 0 || activeTagIds.length === 0);

  // Get edit item details
  const editItem = state.editItemId
    ? flatItems.find((item) => item.id === state.editItemId)
    : null;
  const editSpriteTagsCollection = getSpriteTagsCollectionByCharacterId({
    state,
    characterId: state.editItemId,
  });
  const editSpriteGroupTagOptions = buildTagFilterOptions({
    tagsCollection: editSpriteTagsCollection,
  });

  let editDefaultValues = {};
  const editForm = createEditCharacterDialogForm({
    tagOptions: tagFilterOptions,
    nameVariableOptions,
    copy,
  });

  if (editItem) {
    editDefaultValues = {
      name: editItem.name || "",
      nameVariableId: editItem.nameVariableId || "",
      description: editItem.description || "",
      shortcut: editItem.shortcut || "",
      tagIds: editItem.tagIds || [],
    };
  }

  return {
    flatItems,
    flatGroups,
    ...buildMobileResourcePageViewData({
      state,
      detailFields,
      hiddenMobileDetailSlots: ["avatar", "character-sprite-groups"],
    }),
    addText: copy.addText,
    addGroupButton: copy.addGroupButton,
    addTagPlaceholder: copy.addTagPlaceholder,
    clickToUploadLabel: copy.clickToUploadLabel,
    deleteButton: copy.deleteButton,
    filesLabel: copy.filesLabel,
    noAvatarLabel: copy.noAvatarLabel,
    noSelectionLabel: copy.noSelectionLabel,
    noSpriteGroups: copy.noSpriteGroups,
    noSpriteGroupsYet: copy.noSpriteGroupsYet,
    spriteGroupsLabel: copy.spriteGroupsLabel,
    resourceCategory: "assets",
    selectedResourceId: "characters",
    selectedItemId: state.selectedItemId,
    selectedFolderId: state.selectedFolderId,
    selectedDetailId,
    selectedDetailName,
    selectedItemName: selectedDetailName,
    selectedAvatarFileId: selectedItem?.fileId,
    selectedItemTagIds: selectedItem?.tagIds ?? [],
    selectedItemSpriteGroups,
    detailTagDraftValues: state.detailTagIds ?? [],
    isDetailTagSelectOpen: !!state.isDetailTagSelectOpen,
    detailFields,
    searchQuery: state.searchQuery,
    tagFilterOptions,
    editSpriteGroupTagOptions,
    editSpriteGroupsMessage: copy.editSpriteGroupsMessage,
    selectedTagFilterValues: activeTagIds,
    tagFilterPlaceholder: copy.tagFilterPlaceholder,
    detailTagAddOption: {
      label: copy.addTagOption,
    },
    resourceType: "characters",
    title: copy.title,
    folderContextMenuItems: createFolderContextMenuItems(copy),
    itemContextMenuItems: createItemContextMenuItems(copy),
    emptyContextMenuItems: createEmptyContextMenuItems(copy),
    isFolderNameDialogOpen: state.isFolderNameDialogOpen,
    folderNameDialogItemId: state.folderNameDialogItemId,
    folderNameForm: createFolderNameForm(copy),
    folderNameDialogDefaultValues: state.folderNameDialogDefaultValues,
    isDialogOpen: state.isDialogOpen,
    dialogDefaultValues: state.dialogDefaultValues,
    dialogSpriteGroups: buildDraftSpriteGroupViewData({
      spriteGroups: state.dialogSpriteGroups,
      tagsById: {},
      copy,
    }),
    dialogForm: createCharacterDialogForm({
      tagOptions: tagFilterOptions,
      nameVariableOptions,
      copy,
    }),
    spriteGroupDropdownMenu: state.spriteGroupDropdownMenu,
    isSpriteGroupDialogOpen: state.isSpriteGroupDialogOpen,
    spriteGroupDialogDefaultValues: state.spriteGroupDialogDefaultValues,
    spriteGroupDialogForm: createSpriteGroupDialogForm({
      tagOptions: editSpriteGroupTagOptions,
      isEditing: Number.isInteger(state.spriteGroupDialogIndex),
      copy,
    }),
    isCreateTagDialogOpen: state.isCreateTagDialogOpen,
    createTagDefaultValues: state.createTagDefaultValues,
    createTagForm: createTagForm(copy),
    avatarFileId: state.avatarFileId,
    isAvatarCropDialogOpen: state.isAvatarCropDialogOpen,
    avatarCropFile: state.avatarCropFile,
    // Edit dialog data
    isEditDialogOpen: state.isEditDialogOpen,
    editDefaultValues,
    editForm,
    editAvatarFileId: state.editAvatarFileId,
    editSpriteGroups: buildDraftSpriteGroupViewData({
      spriteGroups: state.editSpriteGroups,
      tagsById: editSpriteTagsCollection.items ?? {},
      copy,
    }),
  };
};

export { CHARACTER_TAG_SCOPE_KEY };
