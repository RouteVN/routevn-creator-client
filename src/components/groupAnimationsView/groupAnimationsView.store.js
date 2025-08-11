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
      name: "relative",
      inputType: "select",
      label: "Relative",
      options: [
        { label: "False", value: "false" },
        { label: "True", value: "true" },
      ],
      defaultValue: "false",
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
      name: "valueSource",
      inputType: "select",
      label: "Value Source",
      options: [
        { label: "Use Default Value", value: "default" },
        { label: "Custom Value", value: "custom" },
      ],
      defaultValue: "custom",
      required: true,
    },
    {
      $when: "valueSource == 'custom'",
      name: "initialValue",
      inputType: "inputText",
      label: "Custom Initial Value",
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
        name: "valueSource",
        inputType: "select",
        label: "Initial Value Source",
        options: [
          { label: "Use Default Value", value: "default" },
          { label: "Custom Value", value: "custom" },
        ],
        defaultValue: "default",
        required: true,
      },
      {
        $when: "valueSource == 'custom'",
        name: "initialValue",
        inputType: "inputText",
        label: "Custom Initial Value",
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
    formValues: {},
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

export const selectFormState = ({ state }) => {
  return {
    targetGroupId: state.targetGroupId,
    editItemId: state.editItemId,
    editMode: state.editMode,
    animationProperties: state.animationProperties,
  };
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
  state.popover.formValues = {};
};

export const updatePopoverFormValues = (state, formValues) => {
  state.popover.formValues = formValues;
};

export const openDialog = (
  state,
  { editMode = false, itemId = null, itemData = null } = {},
) => {
  state.isDialogOpen = true;
  state.editMode = editMode;
  state.editItemId = itemId;

  if (editMode && itemData) {
    // Set groupId to support form submission
    state.targetGroupId = itemData.parent || null;

    // Use edit form
    state.form = editAnimationForm;

    // Set default values
    state.defaultValues = {
      name: itemData.name || "",
    };

    // Set animation properties
    state.animationProperties = itemData.animationProperties || {};
  } else {
    // Use add form
    state.form = addAnimationForm;

    state.defaultValues = {
      name: "",
    };

    state.animationProperties = {};
  }
};

export const closeDialog = (state) => {
  state.isDialogOpen = false;
  state.editMode = false;
  state.editItemId = null;
  state.form = addAnimationForm;
  state.defaultValues = {
    name: "",
  };
  state.animationProperties = {};
};

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
};

const addAnimationForm = {
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
};

const editAnimationForm = {
  title: "Edit Animation",
  description: "Edit the animation",
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
        content: "Update Animation",
      },
    ],
  },
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
    relative: keyframe.relative === "true",
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
  
  // Convert relative from string to boolean
  keyframes[index] = {
    ...keyframe,
    relative: keyframe.relative === "true",
  };
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

  // Create default values for forms
  let addPropertyDefaultValues = {};
  let editKeyframeDefaultValues = {};
  let editInitialValueDefaultValues = {};

  // Create context objects for forms
  let addPropertyContext = {};
  let editInitialValueContext = {};

  // Set context for add property form
  if (state.popover.mode === "addProperty") {
    addPropertyDefaultValues = state.popover.formValues || {};
    addPropertyContext = { ...addPropertyDefaultValues };
    console.log("[AddProperty Context]", addPropertyContext);
  }

  if (state.popover.mode === "editKeyframe") {
    const { property, index } = state.popover.payload;
    const currentKeyframe =
      state.animationProperties[property].keyframes[index];

    editKeyframeDefaultValues = {
      duration: currentKeyframe.duration,
      value: currentKeyframe.value,
      easing: currentKeyframe.easing,
      relative: currentKeyframe.relative ? "true" : "false",
    };
  }

  if (state.popover.mode === "editInitialValue") {
    const { property } = state.popover.payload;
    const currentInitialValue =
      state.animationProperties[property].initialValue;

    // Check if current value matches default
    const defaultValues = {
      x: 0,
      y: 0,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    };

    const isUsingDefault = currentInitialValue === defaultValues[property];

    editInitialValueDefaultValues = {
      initialValue: currentInitialValue,
      valueSource: isUsingDefault ? "default" : "custom",
    };

    editInitialValueContext = {
      ...editInitialValueDefaultValues,
      ...state.popover.formValues,
    };

    console.log("[EditInitialValue Context]", editInitialValueContext);
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
    addPropertyContext,
    addKeyframeForm,
    updateKeyframeForm,
    editInitialValueForm,
    editInitialValueContext,
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
