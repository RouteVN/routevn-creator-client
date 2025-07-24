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

const updateKeyframeForm = {
  ...addKeyframeForm,
  title: "Edit Keyframe",
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        content: "Update Keyframe",
      },
    ],
  },
};

const editInitialValueForm = {
  title: "Edit Initial Value",
  fields: [
    {
      name: "initialValue",
      inputType: "inputText",
      label: "Initial Value",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        content: "Update Value",
      },
    ],
  },
};

const propertyOptions = [
  { label: "X", value: "x" },
  { label: "Y", value: "y" },
  { label: "Rotation", value: "rotation" },
];

const createAddPropertyForm = (propertyOptions) => {
  return {
    title: "Add Property",
    fields: [
      {
        name: "property",
        inputType: "select",
        label: "Property",
        options: propertyOptions,
        required: true,
      },
      {
        name: "initialValue",
        inputType: "inputText",
        label: "Initial Value",
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
};

const baseKeyframeDropdownItems = [
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
    value: "delete-keyframe",
  },
];

const propertyNameDropdownItems = [
  {
    label: "Delete",
    type: "item",
    value: "delete-property",
  },
];

export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  isDialogOpen: false,
  targetGroupId: null,
  searchQuery: "",
  selectedProperties: [],
  initialValue: 0,
  animationProperties: {}, // Store keyframes for each property

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

  popover: {
    mode: "none",
    x: undefined,
    y: undefined,
    payload: {},
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

export const selectPopover = ({ state }) => {
  return state.popover;
};

export const setPopover = (state, { mode, x, y, payload }) => {
  state.popover.mode = mode;
  state.popover.x = x;
  state.popover.y = y;
  state.popover.payload = payload;
};

export const closePopover = (state) => {
  state.popover.mode = "none";
  state.popover.x = undefined;
  state.popover.y = undefined;
  state.popover.payload = {};
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

export const addProperty = (state, payload) => {
  const { property, initialValue } = payload;
  if (state.animationProperties[property]) {
    return;
  }
  state.animationProperties[property] = {
    initialValue,
    keyframes: [],
  };
};

export const addKeyframe = (state, keyframe) => {
  if (!state.animationProperties[keyframe.property]) {
    state.animationProperties[keyframe.property] = [];
  }

  const keyframes = state.animationProperties[keyframe.property].keyframes;
  let index = keyframe.index;
  console.log(index);
  if (keyframe.index === undefined) {
    index = keyframes.length;
  }

  keyframes.splice(index, 0, {
    duration: keyframe.duration,
    easing: keyframe.easing,
    value: keyframe.value,
  });
};

export const deleteKeyframe = (state, payload) => {
  const { property, index } = payload;
  const keyframes = state.animationProperties[property].keyframes;
  keyframes.splice(index, 1);
};

export const deleteProperty = (state, payload) => {
  const { property } = payload;

  state.selectedProperties = state.selectedProperties.filter(
    (p) => p.name !== property,
  );

  delete state.animationProperties[property];
};

export const moveKeyframeRight = (state, payload) => {
  const { property, index } = payload;
  const numIndex = Number(index);
  const keyframes = state.animationProperties[property].keyframes;

  if (numIndex < keyframes.length - 1) {
    const temp = keyframes[numIndex];
    keyframes[numIndex] = keyframes[numIndex + 1];
    keyframes[numIndex + 1] = temp;
  }
};

export const moveKeyframeLeft = (state, payload) => {
  const { property, index } = payload;
  const numIndex = Number(index);
  const keyframes = state.animationProperties[property].keyframes;

  if (numIndex > 0) {
    const temp = keyframes[numIndex];
    keyframes[numIndex] = keyframes[numIndex - 1];
    keyframes[numIndex - 1] = temp;
  }
};

export const updateKeyframe = (state, payload) => {
  console.log("payload", payload);
  console.log("state.animationProperties", state.animationProperties);
  const { property, index, keyframe } = payload;
  const keyframes = state.animationProperties[property].keyframes;
  keyframes[index] = keyframe;
};

export const updateInitialValue = (state, payload) => {
  const { property, initialValue } = payload;

  state.animationProperties[property].initialValue = initialValue;
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
          : filteredChildren.map((item) => {
              return {
                ...item,
                selectedStyle:
                  item.id === selectedItemId
                    ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
                    : "",
              };
            }),
        hasChildren: filteredChildren.length > 0,
        shouldDisplay: shouldShowGroup,
      };
    })
    .filter((group) => group.shouldDisplay);

  const toAddProperties = propertyOptions.filter(
    (item) => !Object.keys(state.animationProperties).includes(item.value),
  );

  const keyframeDropdownItems = (() => {
    if (state.popover.mode !== "keyframeMenu") {
      return propertyNameDropdownItems;
    }

    const { property, index } = state.popover.payload;
    const keyframes = state.animationProperties[property].keyframes;
    const currentIndex = Number(index);
    const isFirstKeyframe = currentIndex === 0;
    const isLastKeyframe = currentIndex === keyframes.length - 1;

    return baseKeyframeDropdownItems.filter((item) => {
      if (item.value === "move-left" && isFirstKeyframe) return false;
      if (item.value === "move-right" && isLastKeyframe) return false;
      return true;
    });
  })();

  const addPropertyForm = createAddPropertyForm(toAddProperties);

  // Create default values for edit forms
  let editKeyframeDefaultValues = {};
  let editInitialValueDefaultValues = {};

  if (state.popover.mode === "editKeyframe") {
    const { property, index } = state.popover.payload;
    const currentKeyframe =
      state.animationProperties[property].keyframes[index];

    editKeyframeDefaultValues = {
      duration: currentKeyframe.duration,
      value: currentKeyframe.value,
      easing: currentKeyframe.easing,
    };
  }

  if (state.popover.mode === "editInitialValue") {
    const { property } = state.popover.payload;
    const currentInitialValue =
      state.animationProperties[property].initialValue;

    editInitialValueDefaultValues = {
      initialValue: currentInitialValue,
    };
  }

  // TODO this is hacky way to work around limitation of passing props
  const itemAnimationProperties = {};
  flatGroups.forEach((group) => {
    group.children.forEach((child) => {
      itemAnimationProperties[child.id] = child.animationProperties;
    });
  });

  return {
    flatGroups,
    selectedItemId: props.selectedItemId,
    searchQuery: state.searchQuery,
    defaultValues: state.defaultValues,
    form: state.form,
    isDialogOpen: state.isDialogOpen,
    animationProperties: state.animationProperties,
    itemAnimationProperties,
    initialValue: state.initialValue,
    addPropertyForm,
    addKeyframeForm,
    updateKeyframeForm,
    editInitialValueForm,
    editKeyframeDefaultValues,
    editInitialValueDefaultValues,
    keyframeDropdownItems,
    addPropertyButtonVisible: toAddProperties.length !== 0,
    popover: {
      ...state.popover,
      popoverIsOpen: [
        "addProperty",
        "addKeyframe",
        "editKeyframe",
        "editInitialValue",
      ].includes(state.popover.mode),
      dropdownMenuIsOpen: ["keyframeMenu", "propertyNameMenu"].includes(
        state.popover.mode,
      ),
    },
  };
};
