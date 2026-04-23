import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
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
} from "./support/spriteGroups.js";

const folderContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-child-folder" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const itemContextMenuItems = [
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const emptyContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-item" },
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
const createTagForm = {
  title: "Create Tag",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Tag Name",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Create Tag",
      },
    ],
  },
};
const CHARACTER_TAG_FIELD = {
  name: "tagIds",
  type: "tag-select",
  label: "Tags",
  placeholder: "Select tags",
  addOption: {
    label: "Add tag",
  },
  required: false,
};
const SPRITE_GROUP_FIELD = {
  type: "slot",
  slot: "sprite-groups-slot",
  label: "Sprite Groups",
};

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

const getSpriteGroupDraftKey = (target) =>
  target === "edit" ? "editSpriteGroups" : "dialogSpriteGroups";

const buildSpriteGroupDropdownItems = ({ index, total } = {}) => {
  const items = [];

  if (index > 0) {
    items.push({
      label: "Move Up",
      type: "item",
      value: "move-up",
    });
  }

  if (index < total - 1) {
    items.push({
      label: "Move Down",
      type: "item",
      value: "move-down",
    });
  }

  items.push({
    label: "Remove",
    type: "item",
    value: "remove",
  });

  return items;
};

export const createInitialState = () => ({
  charactersData: { tree: [], items: {} },
  tagsData: createEmptyTagCollection(),
  spriteTagsByCharacterId: {},
  activeTagIds: [],
  detailTagIds: [],
  detailTagIdsDirty: false,
  isDetailTagSelectOpen: false,
  selectedItemId: null,
  searchQuery: "",
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
  dialogForm: {
    title: "Add Character",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Name",
        required: true,
      },
      {
        name: "description",
        type: "input-text",
        label: "Description",
        required: false,
      },
      {
        name: "shortcut",
        type: "select",
        label: "Shortcut",
        description: "Used for keyboard shortcut in scene editor",
        options: CHARACTER_SHORTCUT_OPTIONS,
        required: false,
      },
      CHARACTER_TAG_FIELD,
      {
        type: "slot",
        slot: "avatar-slot",
        label: "Avatar",
      },
      SPRITE_GROUP_FIELD,
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Add Character",
        },
      ],
    },
  },
  // Edit dialog state
  isEditDialogOpen: false,
  editItemId: null,
  editAvatarFileId: null,
  editAvatarUploadResult: null,
  editSpriteGroups: [],
});

export const setItems = ({ state }, { charactersData } = {}) => {
  state.charactersData = charactersData;
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

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
  state.isDetailTagSelectOpen = false;
  const item = itemId ? state.charactersData?.items?.[itemId] : undefined;
  state.detailTagIds = Array.isArray(item?.tagIds) ? [...item.tagIds] : [];
  state.detailTagIdsDirty = false;
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query;
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

export const addSpriteGroup = ({ state }, { target } = {}) => {
  state[getSpriteGroupDraftKey(target)].push(createEmptySpriteGroup());
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
  { target, index, x, y } = {},
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
    items: buildSpriteGroupDropdownItems({
      index,
      total: spriteGroups.length,
    }),
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
  state.editSpriteGroups = normalizeDraftSpriteGroups({
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

export const selectViewData = ({ state }) => {
  const flatItems = applyFolderRequiredRootDragOptions(
    toFlatItems(state.charactersData),
  );
  const rawFlatGroups = toFlatGroups(state.charactersData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;
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
  });

  const detailFields = selectedItem
    ? [
        {
          type: "slot",
          slot: "avatar",
          label: "",
        },
        {
          type: "description",
          value: selectedItem.description ?? "",
        },
        {
          type: "text",
          label: "Shortcut",
          value: selectedItem.shortcut ?? "",
        },
        {
          type: "slot",
          slot: "character-tags",
          label: "Tags",
        },
        {
          type: "slot",
          slot: "character-sprite-groups",
          label: "Sprite Groups",
        },
      ]
    : [];

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
  let editForm = {
    title: "Edit Character",
    description: "Edit the character details",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Name",
        description: "Enter the character name",
        required: true,
      },
      {
        name: "description",
        type: "input-text",
        label: "Description",
        description: "Enter the character description",
        required: false,
      },
      {
        name: "shortcut",
        type: "select",
        label: "Shortcut",
        options: CHARACTER_SHORTCUT_OPTIONS,
        required: false,
      },
      CHARACTER_TAG_FIELD,
      {
        type: "slot",
        slot: "avatar-slot",
        label: "Avatar",
      },
      SPRITE_GROUP_FIELD,
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Update Character",
        },
      ],
    },
  };

  if (editItem) {
    editDefaultValues = {
      name: editItem.name || "",
      description: editItem.description || "",
      shortcut: editItem.shortcut || "",
      tagIds: editItem.tagIds || [],
    };
  }

  return {
    flatItems,
    flatGroups,
    addText: "Add",
    resourceCategory: "assets",
    selectedResourceId: "characters",
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedItem?.name ?? "",
    selectedAvatarFileId: selectedItem?.fileId,
    selectedItemTagIds: selectedItem?.tagIds ?? [],
    selectedItemSpriteGroups,
    detailTagDraftValues: state.detailTagIds ?? [],
    isDetailTagSelectOpen: !!state.isDetailTagSelectOpen,
    detailFields,
    searchQuery: state.searchQuery,
    tagFilterOptions,
    dialogSpriteGroupsMessage:
      "Sprite groups use character sprite tags. Create the character first, then edit sprite groups after adding sprite tags on the Character Sprites page.",
    editSpriteGroupTagOptions,
    editSpriteGroupsMessage:
      "No character sprite tags yet. Add sprite tags on the Character Sprites page first.",
    selectedTagFilterValues: activeTagIds,
    tagFilterPlaceholder: "Filter tags",
    detailTagAddOption: {
      label: "Add tag",
    },
    resourceType: "characters",
    title: "Characters",
    folderContextMenuItems,
    itemContextMenuItems,
    emptyContextMenuItems,
    isDialogOpen: state.isDialogOpen,
    dialogDefaultValues: state.dialogDefaultValues,
    dialogSpriteGroups: buildDraftSpriteGroupViewData({
      spriteGroups: state.dialogSpriteGroups,
      tagsById: {},
      target: "add",
    }),
    dialogForm: state.dialogForm,
    spriteGroupDropdownMenu: state.spriteGroupDropdownMenu,
    isCreateTagDialogOpen: state.isCreateTagDialogOpen,
    createTagDefaultValues: state.createTagDefaultValues,
    createTagForm,
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
      target: "edit",
    }),
  };
};

export { CHARACTER_TAG_SCOPE_KEY };
