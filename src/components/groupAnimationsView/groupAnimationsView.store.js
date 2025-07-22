const addKeyframeForm = {
  title: "Add Keyframe",
  fields: [
    {
      name: "duration",
      inputType: "inputText",
      label: "Duration",
      required: true,
    },
    {
      name: "value",
      inputType: "inputText",
      label: "Value",
      required: true,
    },
    {
      name: "easing",
      inputType: "select",
      label: "Easing",
      options: [
        { label: "Linear", value: "linear" },
        { label: "Ease In", value: "easein" },
      ],
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        content: "Add Keyframe",
      },
    ],
  },
};

const addPropertyForm = {
  title: "Add Property",
  fields: [
    {
      name: "property",
      inputType: "select",
      label: "Property",
      options: [
        { label: "X", value: "x" },
        { label: "Y", value: "y" },
        { label: "Rotation", value: "rotation" },
      ],
      required: true,
    },
    {
      name: "initialValue",
      inputType: "inputText",
      label: "Initial Value",
      required: true,
    },
    {
      name: "easing",
      inputType: "select",
      label: "Easing",
      options: [
        { label: "Linear", value: "linear" },
        { label: "Ease In", value: "easein" },
      ],
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        content: "Add Property",
      },
    ],
  },
};

export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  isDialogOpen: false,
  targetGroupId: null,
  searchQuery: "",
  selectedProperties: [],
  initialValue: 0,
  propertyKeyframes: {}, // Store keyframes for each property

  addKeyframeFormIsOpen: false,

  defaultValues: {
    name: "",
  },

  form: {
    title: "Add Animation",
    description: "Create a new animation",
    fields: [
      {
        name: "name",
        inputType: "inputText",
        label: "Name",
        description: "Enter the animation name",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          content: "Add Animation",
        },
      ],
    },
  },

  propertySelector: {
    isOpen: false,
    availableProperties: ["x", "y", "alpha", "scaleX", "scaleY", "rotation"],
  },

  keyframeDropdown: {
    isOpen: false,
    items: [
      {
        label: "edit",
        type: "item",
        value: "edit",
      },
      {
        label: "Add to right",
        type: "item",
        value: "add-right",
      },
      {
        label: "Add to left",
        type: "item",
        value: "add-left",
      },
      {
        label: "Move to right",
        type: "item",
        value: "move-right",
      },
      {
        label: "Move to left",
        type: "item",
        value: "move-left",
      },
      {
        label: "Delete",
        type: "item",
        value: "delete",
      },
    ],
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

export const showAddKeyframeForm = (state) => {
  state.addKeyframeFormIsOpen = true;
};

export const hideAddKeyframeForm = (state) => {
  state.addKeyframeFormIsOpen = false;
};

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
};

export const openKeyframeDropdown = (state) => {
  state.keyframeDropdown.isOpen = true;
};

export const closeKeyframeDropdown = (state) => {
  state.keyframeDropdown.isOpen = false;
};

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
};

export const togglePropertySelector = (state) => {
  state.propertySelector.isOpen = !state.propertySelector.isOpen;
};

export const addProperty = (state, property) => {
  if (!state.selectedProperties.includes(property)) {
    state.selectedProperties.push(property);
  }
};

export const setSelectedProperties = (state, properties) => {
  state.selectedProperties = properties;
};

export const setInitialValue = (state, value) => {
  state.initialValue = parseFloat(value) || 0;
};

export const addKeyframe = (state, keyframe) => {
  if (!state.propertyKeyframes[keyframe.property]) {
    state.propertyKeyframes[keyframe.property] = [];
  }

  // Add a new keyframe with 1 second duration
  state.propertyKeyframes[keyframe.property].push({
    duration: keyframe.duration,
    value: keyframe.initialValue,
    easing: keyframe.easing,
  });

  state.addKeyframeFormIsOpen = false;
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

  const selectedProperties = state.selectedProperties.map((property) => ({
    name: property,
    initialValue: state.initialValue,
    keyframes: state.propertyKeyframes[property] || [
      {
        duration: 1000,
        value: state.initialValue,
        easing: "linear",
      },
    ],
  }));

  const propertySelector = {
    isOpen: state.propertySelector.isOpen,
    availableProperties: state.propertySelector.availableProperties.filter(
      (property) => {
        return !selectedProperties.map((item) => item.name).includes(property);
      },
    ),
  };

  return {
    flatGroups,
    selectedItemId: props.selectedItemId,
    searchQuery: state.searchQuery,
    isDialogOpen: state.isDialogOpen,
    defaultValues: state.defaultValues,
    form: state.form,
    propertySelector: propertySelector,
    selectedProperties: selectedProperties,
    initialValue: state.initialValue,
    propertyVisible: propertySelector.availableProperties.length !== 0,
    addPropertyForm,
    addKeyframeForm,
    addKeyframeFormIsOpen: state.addKeyframeFormIsOpen,
    keyframeDropdown: state.keyframeDropdown,
  };
};
