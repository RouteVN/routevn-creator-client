import { toFlatGroups, toFlatItems } from "../../deps/repository";

const form = {
  fields: [
    {
      name: "fileId",
      inputType: "image",
      src: "${fileId.src}",
      width: 240,
      clickable: true,
      extraEvent: true,
    },
    { name: "name", inputType: "popover-input", description: "Name" },
    {
      name: "description",
      inputType: "popover-input",
      description: "Description",
    },
  ],
};

export const createInitialState = () => ({
  charactersData: { tree: [], items: {} },
  selectedItemId: null,
  context: {
    fileId: {
      src: "",
    },
  },
  searchQuery: "",
  collapsedIds: [],
  isDialogOpen: false,
  targetGroupId: null,
  avatarFileId: null,
  dialogDefaultValues: {
    name: "",
    description: "",
  },
  dialogForm: {
    title: "Add Character",
    fields: [
      {
        name: "name",
        inputType: "inputText",
        label: "Name",
        required: true,
      },
      {
        name: "description",
        inputType: "inputText",
        label: "Description",
        required: false,
      },
      {
        inputType: "slot",
        slot: "avatar-slot",
        label: "Avatar",
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          content: "Add Character",
        },
      ],
    },
  },
  // Edit dialog state
  isEditDialogOpen: false,
  editItemId: null,
  editAvatarFileId: null,
});

export const setContext = (state, context) => {
  state.context = context;
};

export const setItems = (state, charactersData) => {
  state.charactersData = charactersData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
};

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
};

export const toggleDialog = (state) => {
  state.isDialogOpen = !state.isDialogOpen;
};

export const setAvatarFileId = (state, fileId) => {
  state.avatarFileId = fileId;
};

export const clearAvatarState = (state) => {
  state.avatarFileId = null;
};

export const openEditDialog = (state, itemId) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;

  // Set the initial avatar file ID from the selected item
  const flatItems = toFlatItems(state.charactersData);
  const editItem = flatItems.find((item) => item.id === itemId);
  state.editAvatarFileId = editItem?.fileId || null;
};

export const closeEditDialog = (state) => {
  state.isEditDialogOpen = false;
  state.editItemId = null;
  state.editAvatarFileId = null;
};

export const setEditAvatarFileId = (state, fileId) => {
  state.editAvatarFileId = fileId;
};

export const selectTargetGroupId = ({ state }) => state.targetGroupId;
export const selectAvatarFileId = ({ state }) => state.avatarFileId;

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
  const flatItems = toFlatItems(state.charactersData);
  const rawFlatGroups = toFlatGroups(state.charactersData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into form defaults
  let defaultValues = {};

  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      description: selectedItem.description || "No description provided",
    };
  }

  // Apply search filter
  const searchQuery = state.searchQuery.toLowerCase().trim();
  let filteredGroups = rawFlatGroups;

  if (searchQuery) {
    filteredGroups = rawFlatGroups
      .map((group) => {
        const filteredChildren = (group.children || []).filter((item) => {
          const name = (item.name || "").toLowerCase();
          const description = (item.description || "").toLowerCase();
          return (
            name.includes(searchQuery) || description.includes(searchQuery)
          );
        });

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

  // Apply collapsed state and selection styling
  const flatGroups = filteredGroups.map((group) => ({
    ...group,
    isCollapsed: state.collapsedIds.includes(group.id),
    children: state.collapsedIds.includes(group.id)
      ? []
      : (group.children || []).map((item) => ({
          ...item,
          selectedStyle:
            item.id === state.selectedItemId
              ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
              : "",
        })),
  }));

  // Get edit item details
  const editItem = state.editItemId
    ? flatItems.find((item) => item.id === state.editItemId)
    : null;

  let editDefaultValues = {};
  let editForm = {
    title: "Edit Character",
    description: "Edit the character details",
    fields: [
      {
        name: "name",
        inputType: "inputText",
        label: "Name",
        description: "Enter the character name",
        required: true,
      },
      {
        name: "description",
        inputType: "inputText",
        label: "Description",
        description: "Enter the character description",
        required: false,
      },
      {
        inputType: "slot",
        slot: "avatar-slot",
        label: "Avatar",
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          content: "Update Character",
        },
      ],
    },
  };

  if (editItem) {
    editDefaultValues = {
      name: editItem.name || "",
      description: editItem.description || "",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "characters",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "characters",
    form,
    context: state.context,
    defaultValues,
    searchQuery: state.searchQuery,
    resourceType: "characters",
    searchPlaceholder: "Search characters...",
    isDialogOpen: state.isDialogOpen,
    dialogDefaultValues: state.dialogDefaultValues,
    dialogForm: state.dialogForm,
    avatarFileId: state.avatarFileId,
    // Edit dialog data
    isEditDialogOpen: state.isEditDialogOpen,
    editDefaultValues,
    editForm,
    editAvatarFileId: state.editAvatarFileId,
  };
};
