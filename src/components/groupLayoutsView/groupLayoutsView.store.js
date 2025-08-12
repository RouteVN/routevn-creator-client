export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  searchQuery: "",
  isDialogOpen: false,
  currentGroupId: null,
});

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
};

export const showDialog = (state, groupId) => {
  state.isDialogOpen = true;
  state.currentGroupId = groupId;
};

export const hideDialog = (state) => {
  state.isDialogOpen = false;
  state.currentGroupId = null;
};

export const selectCurrentGroupId = ({ state }) => state.currentGroupId;

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
          return name.includes(searchQuery);
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
      : (group.children || []).map((item) => {
          const layoutTypeLabels = {
            normal: "Normal",
            dialogue: "Dialogue",
            choice: "Choice",
          };

          return {
            ...item,
            layoutTypeDisplay: item.layoutType
              ? layoutTypeLabels[item.layoutType] || item.layoutType
              : "Layout",
            selectedStyle:
              item.id === selectedItemId
                ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
                : "",
          };
        }),
  }));

  return {
    flatGroups,
    selectedItemId: props.selectedItemId,
    searchQuery: state.searchQuery,
    isDialogOpen: state.isDialogOpen,
    defaultValues: {
      name: "",
    },
    form: {
      title: "Add Layout",
      fields: [
        {
          name: "name",
          inputType: "inputText",
          label: "Layout Name",
          description: "Enter the layout name",
          required: true,
        },
        {
          name: "layoutType",
          inputType: "select",
          label: "Layout Type",
          description: "Select the layout type",
          required: true,
          options: [
            { value: "normal", label: "Normal" },
            { value: "dialogue", label: "Dialogue" },
            { value: "choice", label: "Choice" },
          ],
        },
      ],
      actions: {
        layout: "",
        buttons: [
          {
            id: "submit",
            variant: "pr",
            content: "Add Layout",
          },
        ],
      },
    },
  };
};
