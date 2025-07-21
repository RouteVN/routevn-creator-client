export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  searchQuery: "",
  isDialogOpen: false,
  targetGroupId: null,

  defaultValues: {
    name: "",
    type: "string",
    default: "",
    readonly: false,
  },

  form: {
    title: "Add Variable",
    description: "Create a new variable",
    fields: [
      {
        name: "name",
        inputType: "inputText",
        label: "Name",
        description: "Enter the variable name",
        required: true,
      },
      {
        name: "type",
        inputType: "inputText",
        label: "Type",
        description: "Enter the variable type (e.g., string, number, boolean)",
        required: true,
      },
      {
        name: "default",
        inputType: "inputText",
        label: "Default Value",
        description: "Enter the default value for this variable",
        required: false,
      },
      {
        name: "readonly",
        inputType: "inputCheckbox",
        label: "Read Only",
        description: "Check if this variable should be read-only",
        required: false,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          content: "Add Variable",
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

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
};

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
};

export const toViewData = ({ state, props }) => {
  const selectedItemId = props.selectedItemId;
  const searchQuery = state.searchQuery.toLowerCase();

  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) return true;

    const name = (item.name || "").toLowerCase();
    const type = (item.variableType || "").toLowerCase();
    const defaultValue = (item.defaultValue || "").toLowerCase();

    return (
      name.includes(searchQuery) ||
      type.includes(searchQuery) ||
      defaultValue.includes(searchQuery)
    );
  };

  // Apply collapsed state and search filtering to flatGroups
  const flatGroups = (props.flatGroups || [])
    .map((group) => {
      // Filter children based on search query
      const filteredChildren = (group.children || []).filter(matchesSearch);

      // Only show groups that have matching children or if there's no search query
      const hasMatchingChildren = filteredChildren.length > 0;
      const shouldShowGroup = !searchQuery || hasMatchingChildren;

      const isCollapsed = state.collapsedIds.includes(group.id);
      const children = isCollapsed ? [] : filteredChildren;

      // Create table data for this group's variables
      const tableData = {
        columns: [
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "default", label: "Default Value" },
          { key: "readOnly", label: "Read Only" },
        ],
        rows:
          children.length > 0
            ? children.map((item) => ({
                id: item.id,
                name: item.name,
                type: item.variableType || "string",
                default: item.defaultValue || "",
                readOnly: item.readonly ? "Yes" : "No",
              }))
            : [],
      };

      return {
        ...group,
        isCollapsed,
        children,
        tableData,
        hasChildren: filteredChildren.length > 0,
        shouldDisplay: shouldShowGroup,
      };
    })
    .filter((group) => group.shouldDisplay);

  return {
    group1: flatGroups[0]?.tableData || { columns: [], rows: [] },
    flatGroups,
    selectedItemId: props.selectedItemId,
    searchQuery: state.searchQuery,
    isDialogOpen: state.isDialogOpen,
    defaultValues: state.defaultValues,
    form: state.form,
  };
};
