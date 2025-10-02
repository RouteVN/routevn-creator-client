export const createInitialState = () => ({
  collapsedIds: [],
  searchQuery: "",
  isDialogOpen: false,
  targetGroupId: null,

  defaultValues: {
    name: "",
    enum: [],
    type: "string",
    initialValue: "",
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
        required: true,
      },
      {
        name: "scope",
        inputType: "select",
        label: "Scope",
        required: true,
        options: [
          // # • runtime – temporary; resets when game restarts
          // # Example: Currently selected menu tab, temporary UI state, or animation line
          // # Use when the value is only needed while the game is running and should not persist across restarts.
          //
          // # • device – saved on this device only
          // # Example: Text speed, sound/music volume, accessibility preferences
          // # Use for user preferences that should persist on the current device, but don't need syncing or save/load.
          //
          // # • global – synced across all devices
          // # Example: Whether the game is completed, unlocked bonus content, claimed daily rewards
          // # Use when the value should follow the player across multiple devices (via cloud sync).
          //
          // # • saveData – saved only in game saves
          // # Example: Player progress, inventory items, story flags
          // # Use for values that are tied to save/load and shouldn't change unless the player loads a saved game.
          { value: "runtime", label: "Runtime" },
          { value: "device", label: "Device" },
          { value: "global", label: "Global" },
          { value: "saveData", label: "Save Data" },
        ],
      },
      {
        name: "type",
        inputType: "select",
        label: "Type",
        required: true,
        options: [
          { value: "string", label: "String" },
          { value: "integer", label: "Integer" },
          { value: "boolean", label: "Boolean" },
          { value: "enum", label: "Enum" },
          // { value: "array", label: "Array" },
          // { value: "object", label: "Object" },
        ],
      },
      {
        $when: "values.type == 'array'",
        name: "arrayItemType",
        label: "Item Type",
        inputType: "select",
        required: true,
        options: [
          { value: "string", label: "String" },
          { value: "integer", label: "Integer" },
          { value: "boolean", label: "Boolean" },
          { value: "enum", label: "Enum" },
          { value: "object", label: "Object" },
        ],
      },
      {
        $when: "values.type == 'enum'",
        name: "enum",
        inputType: "slot",
        slot: "enum",
        label: "Enum",
        required: false,
      },
      {
        $when: "values.type == 'enum'",
        name: "initialValue",
        inputType: "select",
        label: "Initial Value",
        options: "${enumOptions}",
        required: false,
      },
      {
        $when: "values.type == 'boolean'",
        name: "initialValue",
        inputType: "select",
        label: "Initial Value",
        options: [
          { value: true, label: "True" },
          { value: false, label: "False" },
        ],
        required: true,
      },
      {
        $when: "values.type == 'string'",
        name: "initialValue",
        inputType: "inputText",
        label: "Initial Value",
        required: false,
      },
      {
        $when: "values.type == 'integer'",
        name: "initialValue",
        inputType: "inputText",
        label: "Initial Value",
        required: false,
      },
      {
        name: "readonly",
        label: "Read Only",
        inputType: "select",
        required: true,
        options: [
          { value: true, label: "Read Only" },
          { value: false, label: "Editable" },
        ],
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

export const selectDefaultValues = ({ state }) => {
  return state.defaultValues;
};

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const updateFormValues = (state, payload) => {
  state.defaultValues = payload;
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

export const selectViewData = ({ state, props }) => {
  const searchQuery = state.searchQuery.toLowerCase();

  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) return true;

    const name = (item.name || "").toLowerCase();
    const type = (item.variableType || "").toLowerCase();
    const initialValue = (item.initialValue || "").toLowerCase();

    return (
      name.includes(searchQuery) ||
      type.includes(searchQuery) ||
      initialValue.includes(searchQuery)
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
          { key: "initialValue", label: "Initial Value" },
          { key: "readOnly", label: "Read Only" },
        ],
        rows:
          children.length > 0
            ? children.map((item) => ({
                id: item.id,
                name: item.name,
                type: item.variableType || "string",
                enum: item.enum || [],
                initialValue: item.initialValue || "",
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

  console.log("defaultValues", state.defaultValues);
  const defaultValues = structuredClone(state.defaultValues);
  if (!defaultValues.enum) {
    defaultValues.enum = [];
  }

  return {
    group1: flatGroups[0]?.tableData || { columns: [], rows: [] },
    flatGroups,
    selectedItemId: props.selectedItemId,
    searchQuery: state.searchQuery,
    isDialogOpen: state.isDialogOpen,
    defaultValues: defaultValues,
    form: state.form,
    context: {
      values: defaultValues,
      enumOptions: defaultValues.enum.map((option) => {
        return {
          value: option.id,
          label: option.label,
        };
      }),
    },
  };
};
