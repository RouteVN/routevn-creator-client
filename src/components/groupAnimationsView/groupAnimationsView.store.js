export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  isDialogOpen: false,
  targetGroupId: null,
  searchQuery: "",
  selectedProperties: [],
  initialValue: 0,
  propertyKeyframes: {}, // Store keyframes for each property

  defaultValues: {
    name: "",
  },

  form: {
    title: "Add Animation",
    description: "Create a new animation",
    fields: [
      {
        id: "name",
        fieldName: "name",
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

export const addKeyframeToProperty = (state, propertyName) => {
  if (!state.propertyKeyframes[propertyName]) {
    state.propertyKeyframes[propertyName] = [];
  }

  // Add a new keyframe with 1 second duration
  state.propertyKeyframes[propertyName].push({
    duration: 1000,
    value: state.initialValue,
    easing: "linear",
  });
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
  };
};
