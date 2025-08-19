export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  isDialogOpen: false,
  targetGroupId: null,
  searchQuery: "",
  selectedAvatarFile: null,
  avatarPreviewUrl: null,

  defaultValues: {
    name: "",
    description: "",
  },

  form: {
    title: "Add Character",
    fields: [
      {
        inputType: "slot",
        slot: "avatar-slot",
        label: "Avatar",
      },
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
});

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const toggleDialog = (state) => {
  state.isDialogOpen = !state.isDialogOpen;
};

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
};

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
};

export const setAvatarFile = (state, payload) => {
  const { file, previewUrl } = payload || {};
  state.selectedAvatarFile = file;
  state.avatarPreviewUrl = previewUrl;
};

export const clearFormState = (state) => {
  state.selectedAvatarFile = null;
  state.avatarPreviewUrl = null;
  state.defaultValues = {
    name: "",
    description: "",
  };
};

export const clearAvatarState = (state) => {
  state.selectedAvatarFile = null;
  state.avatarPreviewUrl = null;
};

export const selectTargetGroupId = ({ state }) => state.targetGroupId;
export const selectSelectedAvatarFile = ({ state }) => state.selectedAvatarFile;

export const toViewData = ({ state, props }) => {
  const selectedItemId = props.selectedItemId;
  const searchQuery = state.searchQuery.toLowerCase().trim();

  // Filter groups based on search query
  let filteredGroups = props.flatGroups || [];

  if (searchQuery) {
    filteredGroups = filteredGroups
      .map((group) => {
        // Filter children based on search query
        const filteredChildren = (group.children || []).filter((item) => {
          const name = (item.name || "").toLowerCase();
          const description = (item.description || "").toLowerCase();
          return (
            name.includes(searchQuery) || description.includes(searchQuery)
          );
        });

        // Only include groups that have matching children or if the group name itself matches
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
      .filter(Boolean); // Remove null groups
  }

  // Apply collapsed state to filtered groups
  const flatGroups = filteredGroups.map((group) => ({
    ...group,
    isCollapsed: state.collapsedIds.includes(group.id),
    children: state.collapsedIds.includes(group.id)
      ? []
      : (group.children || []).map((item) => ({
          ...item,
          selectedStyle:
            item.id === selectedItemId
              ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
              : "",
        })),
  }));

  return {
    flatGroups,
    selectedItemId: props.selectedItemId,
    uploadText: "Upload Character Avatar",
    isDialogOpen: state.isDialogOpen,
    defaultValues: state.defaultValues,
    form: state.form,
    searchQuery: state.searchQuery,
    avatarPreviewUrl: state.avatarPreviewUrl,
  };
};
