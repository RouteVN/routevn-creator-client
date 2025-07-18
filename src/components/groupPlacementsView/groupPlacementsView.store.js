export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  searchQuery: "",
  isDialogOpen: false,
  targetGroupId: null,
  editMode: false,
  editItemId: null,

  defaultValues: {
    name: "",
    x: "0",
    y: "0",
    scaleX: "1",
    scaleY: "1",
    anchor: { anchorX: 0.5, anchorY: 0.5 },
    rotation: "0",
  },

  form: {
    title: "Add Placement",
    description: "Create a new placement configuration",
    fields: [
      {
        name: "name",
        inputType: "inputText",
        label: "Name",
        description: "Enter the placement name",
        required: true,
      },
      {
        name: 'x',
        inputType: 'slider-input',
        min: 0,
        max: 1920,
        step: 1,
        label: 'Position X',
        description: 'Enter the X coordinate (e.g., 100, 50%)',
        required: true,
      },
      {
        name: 'y',
        inputType: 'slider-input',
        min: 0,
        max: 1080,
        step: 1,
        label: 'Position Y',
        description: 'Enter the Y coordinate (e.g., 200, 25%)',
        required: true,
      },
      {
        name: 'scaleX',
        inputType: 'slider-input',
        min: 0.1,
        max: 3,
        step: 0.1,
        label: 'Scale X',
        description: 'Enter the scale factor (e.g., 1, 0.5, 2)',
        required: true,
      },
      {
        name: "scaleY",
        inputType: 'slider-input',
        min: 0.1,
        max: 3,
        step: 0.1,
        label: "Scale Y",
        description: "Enter the scale factor (e.g., 1, 0.5, 2)",
        required: true,
      },
      {
        name: "anchor",
        inputType: "select",
        label: "Anchor",
        description:
          "Enter the anchor point (e.g., center, top-left, bottom-right)",
        placeholder: "Choose a anchor",
        options: [
          { id: "tl", label: "Top Left", value: { anchorX: 0, anchorY: 0 } },
          {
            id: "tc",
            label: "Top Center",
            value: { anchorX: 0.5, anchorY: 0 },
          },
          { id: "tr", label: "Top Right", value: { anchorX: 1, anchorY: 0 } },
          {
            id: "cl",
            label: "Center Left",
            value: { anchorX: 0, anchorY: 0.5 },
          },
          {
            id: "cc",
            label: "Center Center",
            value: { anchorX: 0.5, anchorY: 0.5 },
          },
          {
            id: "cr",
            label: "Center Right",
            value: { anchorX: 1, anchorY: 0.5 },
          },
          { id: "bl", label: "Bottom Left", value: { anchorX: 0, anchorY: 1 } },
          {
            id: "bc",
            label: "Bottom Center",
            value: { anchorX: 0.5, anchorY: 1 },
          },
          {
            id: "br",
            label: "Bottom Right",
            value: { anchorX: 1, anchorY: 1 },
          },
        ],
        required: true,
      },
      {
        name: 'rotation',
        inputType: 'slider-input',
        min: -360,
        max: 360,
        step: 1,
        label: 'Rotation',
        description: 'Enter the rotation in degrees (e.g., 0, 45, 180)',
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          content: "Add Placement",
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

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
};

export const openPlacementFormDialog = (state, options = {}) => {
  const {
    editMode = false,
    itemId = null,
    itemData = null,
    targetGroupId = null,
  } = options;

  // Set edit mode and update form accordingly
  state.editMode = editMode;
  state.editItemId = itemId;
  state.targetGroupId = targetGroupId;

  // Update form based on edit mode
  if (editMode) {
    state.form.title = "Edit Placement";
    state.form.description = "Edit the placement configuration";
    state.form.actions.buttons[0].content = "Update Placement";
  } else {
    state.form.title = "Add Placement";
    state.form.description = "Create a new placement configuration";
    state.form.actions.buttons[0].content = "Add Placement";
  }

  // Set default values based on item data
  if (itemData) {
    state.defaultValues = {
      name: itemData.name || "",
      x: String(itemData.x || "0"),
      y: String(itemData.y || "0"),
      scaleX: String(itemData.scaleX || "1"),
      scaleY: String(itemData.scaleY || "1"),
      anchor: { anchorX: itemData.anchorX, anchorY: itemData.anchorY },
      rotation: String(itemData.rotation || "0"),
    };
  } else {
    state.defaultValues = {
      name: "",
      x: "0",
      y: "0",
      scaleX: "1",
      scaleY: "1",
      anchor: { anchorX: 0, anchorY: 0 },
      rotation: "0",
    };
  }

  // Open dialog
  state.isDialogOpen = true;
};

export const closePlacementFormDialog = (state) => {
  // Close dialog
  state.isDialogOpen = false;

  // Reset all form state
  state.editMode = false;
  state.editItemId = null;
  state.targetGroupId = null;

  // Reset default values
  state.defaultValues = {
    name: "",
    x: "0",
    y: "0",
    scaleX: "1",
    scaleY: "1",
    anchor: { anchorX: 0.5, anchorY: 0.5 },
    rotation: "0",
  };

  // Reset form to add mode
  state.form.title = "Add Placement";
  state.form.description = "Create a new placement configuration";
  state.form.actions.buttons[0].content = "Add Placement";
};

export const selectTargetGroupId = ({ state }) => {
  return state.targetGroupId;
};

export const selectEditMode = ({ state }) => {
  return state.editMode;
};

export const selectEditItemId = ({ state }) => {
  return state.editItemId;
};

export const toViewData = ({ state, props }) => {
  const selectedItemId = props.selectedItemId;
  const searchQuery = state.searchQuery.toLowerCase();

  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) return true;

    const name = (item.name || "").toLowerCase();
    const description = (item.description || "").toLowerCase();

    return name.includes(searchQuery) || description.includes(searchQuery);
  };

  // Apply collapsed state and search filtering to flatGroups
  const flatGroups = (props.flatGroups || [])
    .map((group) => {
      // Filter children based on search query
      const filteredChildren = (group.children || []).filter(matchesSearch);

      // Only show groups that have matching children or if there's no search query
      const hasMatchingChildren = filteredChildren.length > 0;
      const shouldShowGroup = !searchQuery || hasMatchingChildren;

      return {
        ...group,
        isCollapsed: state.collapsedIds.includes(group.id),
        children: state.collapsedIds.includes(group.id)
          ? []
          : filteredChildren.map((item) => ({
            ...item,
            selectedStyle:
              item.id === selectedItemId
                ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
                : "",
          })),
        hasChildren: filteredChildren.length > 0,
        shouldDisplay: shouldShowGroup,
      };
    })
    .filter((group) => group.shouldDisplay);

  // TODO this is hacky way to work around limitation of passing props
  const items = {};
  flatGroups.forEach((group) => {
    group.children.forEach((child) => {
      items[child.id] = child;
    });
  });

  return {
    flatGroups,
    items,
    selectedItemId: props.selectedItemId,
    searchQuery: state.searchQuery,
    isDialogOpen: state.isDialogOpen,
    editMode: state.editMode,
    editItemId: state.editItemId,
    defaultValues: state.defaultValues,
    form: state.form,
  };
};
