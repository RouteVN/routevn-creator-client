import { toFlatGroups, toFlatItems } from "insieme";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", description: "Name" },
    { name: "duration", inputType: "read-only-text", description: "Duration" },
    {
      name: "keyframes",
      inputType: "read-only-text",
      description: "Keyframes",
    },
  ],
};

const createAddKeyframeForm = (property) => {
  if (!property) {
    return {};
  }
  const sliderConfig = {
    x: {
      min: 0,
      max: 1920,
    },
    y: {
      min: 0,
      max: 1920,
    },
    alpha: {
      min: 0,
      max: 1,
      step: 0.01,
    },
    scaleX: {
      min: 0.1,
      max: 5,
      step: 0.1,
    },
    scaleY: {
      min: 0.1,
      max: 5,
      step: 0.1,
    },
    // rotation: {
    //   min: -360,
    //   max: 360,
    // },
  };
  return {
    title: "Add Keyframe",
    fields: [
      {
        name: "duration",
        inputType: "inputText",
        label: "Duration (ms)",
        required: true,
        placeholder: "Duration in milliseconds",
        tooltip: {
          content:
            "The time it takes for the animation keyframe to move from previous value to next value",
        },
      },
      {
        name: "value",
        inputType: "slider-input",
        ...sliderConfig[property],
        label: "Value",
        required: true,
        tooltip: {
          content:
            "The final value of the property at the end of the animation",
        },
      },
      {
        name: "relative",
        inputType: "select",
        label: "Value type",
        options: [
          { label: "Absolute", value: false },
          { label: "Relative", value: true },
        ],
        required: true,
        tooltip: {
          content:
            "Relative will add the value to the previous value. Absolute will set the property value to exactly the specified value",
        },
      },
      {
        name: "easing",
        inputType: "select",
        label: "Easing",
        options: [{ label: "Linear", value: "linear" }],
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
};

const addKeyframeDefaultValues = {
  relative: false,
  duration: 1000,
  value: 0,
  easing: "linear",
};

const createUpdateKeyframeForm = (property) => {
  return {
    ...createAddKeyframeForm(property),
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
  { label: "Alpha", value: "alpha" },
  { label: "Position X", value: "x" },
  { label: "Position Y", value: "y" },
  { label: "Scale X", value: "scaleX" },
  { label: "Scale Y", value: "scaleY" },
  // { label: "Rotation", value: "rotation" },
];

const createAddPropertyForm = (propertyOptions) => {
  return {
    title: "Add animation property",
    fields: [
      {
        name: "property",
        inputType: "select",
        label: "Property",
        options: propertyOptions,
        required: true,
      },
      {
        name: "useInitialValue",
        inputType: "select",
        label: "Use initial value",
        tooltip: {
          content:
            "The initial value of the property at the start of the animation. If not set, it will use the element's current value at start of animation",
        },
        options: [
          {
            label: "No",
            value: false,
          },
          {
            label: "Yes",
            value: true,
          },
        ],
      },
      {
        "$if useInitialValue == true": [
          {
            $when: 'property == "x"',
            name: "initialValue",
            inputType: "slider-input",
            min: 0,
            max: 1920,
            label: "Initial value",
          },
          {
            $when: 'property == "y"',
            name: "initialValue",
            inputType: "slider-input",
            min: 0,
            max: 1080,
            label: "Initial value",
          },
          {
            $when: 'property == "alpha"',
            name: "initialValue",
            inputType: "slider-input",
            step: 0.01,
            min: 0,
            max: 1,
            label: "Initial value",
          },
          {
            $when: 'property == "scaleX" || property == "scaleY"',
            name: "initialValue",
            inputType: "slider-input",
            min: 0.1,
            max: 5,
            step: 0.1,
            label: "Initial value",
          },
          // {
          //   $when: 'property == "rotation"',
          //   name: "initialValue",
          //   inputType: "slider-input",
          //   min: -360,
          //   max: 360,
          //   step: 1,
          //   label: "Initial value",
          // },
        ],
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
    label: "Edit keyframe",
    type: "item",
    value: "edit",
  },
  {
    label: "Add keyframe to right",
    type: "item",
    value: "add-right",
  },
  {
    label: "Add keyframe to left",
    type: "item",
    value: "add-left",
  },
  {
    label: "Move keyframe to right",
    type: "item",
    value: "move-right",
  },
  {
    label: "Move keyframe to left",
    type: "item",
    value: "move-left",
  },
  {
    label: "Delete keyframe",
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

const addAnimationForm = {
  title: "Add Animation",
  fields: [
    {
      name: "name",
      inputType: "inputText",
      label: "Name",
      required: true,
    },
    {
      name: "properties",
      inputType: "slot",
      slot: "timeline",
      label: "Animation timeline",
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
  fields: [
    {
      name: "name",
      inputType: "inputText",
      label: "Name",
      required: true,
    },
    {
      name: "properties",
      inputType: "slot",
      slot: "timeline",
      label: "Animation timeline",
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

export const createInitialState = () => ({
  animationsData: { tree: [], items: {} },
  selectedItemId: null,
  contextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
    { label: "Duplicate", type: "item", value: "duplicate-item" },
    { label: "Rename", type: "item", value: "rename-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  emptyContextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
  ],
  // Animation dialog state
  searchQuery: "",
  isDialogOpen: false,
  isGraphicsServiceInitialized: false,
  targetGroupId: null,
  selectedProperties: [],
  initialValue: 0,
  properties: {},
  dialogDefaultValues: {
    name: "",
  },
  dialogForm: addAnimationForm,
  editMode: false,
  editItemId: null,
  popover: {
    mode: "none",
    x: undefined,
    y: undefined,
    payload: {},
    formValues: {},
  },
});

export const setItems = (state, animationsData) => {
  state.animationsData = animationsData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectAnimationsData = ({ state }) => state.animationsData;

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
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

export const selectPopover = ({ state }) => {
  return state.popover;
};

export const selectFormState = ({ state }) => {
  return {
    targetGroupId: state.targetGroupId,
    editItemId: state.editItemId,
    editMode: state.editMode,
    properties: state.properties,
  };
};

export const openDialog = (
  state,
  { editMode = false, itemId = null, itemData = null } = {},
) => {
  state.isDialogOpen = true;
  state.editMode = editMode;
  state.editItemId = itemId;

  if (editMode && itemData) {
    state.targetGroupId = itemData.parent || null;
    state.dialogForm = editAnimationForm;
    state.dialogDefaultValues = {
      name: itemData.name,
    };
    state.properties = itemData.properties || {};
  } else {
    state.dialogForm = addAnimationForm;
    state.dialogDefaultValues = {};
    state.properties = {};
  }
};

export const closeDialog = (state) => {
  state.isDialogOpen = false;
  state.editMode = false;
  state.editItemId = null;
  state.dialogForm = addAnimationForm;
  state.dialogDefaultValues = {
    name: "",
  };
  state.properties = {};
};

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
};

export const setGraphicsServiceInitialized = (state, initialized) => {
  state.isGraphicsServiceInitialized = initialized;
};

export const selectIsGraphicsServiceInitialized = ({ state }) => {
  return state.isGraphicsServiceInitialized;
};

// Constants for preview rendering
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const BG_COLOR = "#4a4a4a";
const PREVIEW_RECT_WIDTH = 200;
const PREVIEW_RECT_HEIGHT = 200;

// Helper function to create render state with animations
export const createAnimationRenderState = (
  properties,
  includeAnimations = true,
) => {
  const elements = [
    {
      id: "bg",
      type: "rect",
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      fill: BG_COLOR,
    },
    {
      id: "preview-element",
      type: "rect",
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      width: PREVIEW_RECT_WIDTH,
      height: PREVIEW_RECT_HEIGHT,
      fill: "white",
      anchorX: 0.5,
      anchorY: 0.5,
    },
  ];

  const animations = [];
  if (includeAnimations && properties && Object.keys(properties).length > 0) {
    for (const [property, config] of Object.entries(properties)) {
      if (config.keyframes && config.keyframes.length > 0) {
        let propName = property;

        let defaultValue = 0;
        if (property === "x") defaultValue = 960;
        else if (property === "y") defaultValue = 540;
        else if (property === "rotation") defaultValue = 0;
        else if (property === "alpha") defaultValue = 1;
        else if (property === "scaleX" || property === "scaleY")
          defaultValue = 1;

        const initialValue =
          config.initialValue !== undefined && config.initialValue !== ""
            ? parseFloat(config.initialValue)
            : defaultValue;

        let processedInitialValue = isNaN(initialValue)
          ? defaultValue
          : initialValue;
        if (property === "rotation") {
          processedInitialValue = (processedInitialValue * Math.PI) / 180;
        }

        const animationProperties = {};
        animationProperties[propName] = {
          initialValue: processedInitialValue,
          keyframes: config.keyframes.map((kf) => {
            let value = parseFloat(kf.value) ?? 0;
            if (property === "rotation") {
              value = (value * Math.PI) / 180;
            }
            return {
              duration: kf.duration,
              value: value,
              easing: kf.easing ?? "linear",
              relative: kf.relative ?? false,
            };
          }),
        };

        animations.push({
          id: `animation-${property}`,
          targetId: "preview-element",
          type: "tween",
          properties: animationProperties,
        });
      }
    }
  }

  return {
    elements,
    animations,
  };
};

export const selectAnimationRenderState = ({ state }) => {
  return createAnimationRenderState(state.properties, false);
};

export const selectAnimationRenderStateWithAnimations = ({ state }) => {
  return createAnimationRenderState(state.properties, true);
};

export const addProperty = (state, payload) => {
  const { property, initialValue } = payload;
  if (state.properties[property]) {
    return;
  }
  state.properties[property] = {
    initialValue,
    keyframes: [],
  };
};

export const addKeyframe = (state, keyframe) => {
  if (!state.properties[keyframe.property]) {
    state.properties[keyframe.property] = [];
  }

  const keyframes = state.properties[keyframe.property].keyframes;
  let index = keyframe.index;
  if (keyframe.index === undefined) {
    index = keyframes.length;
  }

  keyframes.splice(index, 0, {
    duration: parseInt(keyframe.duration),
    easing: keyframe.easing,
    value: parseFloat(keyframe.value),
    relative: keyframe.relative,
  });
};

export const deleteKeyframe = (state, payload) => {
  const { property, index } = payload;
  const keyframes = state.properties[property].keyframes;
  keyframes.splice(index, 1);
};

export const deleteProperty = (state, payload) => {
  const { property } = payload;

  state.selectedProperties = state.selectedProperties.filter(
    (p) => p.name !== property,
  );

  delete state.properties[property];
};

export const moveKeyframeRight = (state, payload) => {
  const { property, index } = payload;
  const numIndex = Number(index);
  const keyframes = state.properties[property].keyframes;

  if (numIndex < keyframes.length - 1) {
    const temp = keyframes[numIndex];
    keyframes[numIndex] = keyframes[numIndex + 1];
    keyframes[numIndex + 1] = temp;
  }
};

export const moveKeyframeLeft = (state, payload) => {
  const { property, index } = payload;
  const numIndex = Number(index);
  const keyframes = state.properties[property].keyframes;

  if (numIndex > 0) {
    const temp = keyframes[numIndex];
    keyframes[numIndex] = keyframes[numIndex - 1];
    keyframes[numIndex - 1] = temp;
  }
};

export const updateKeyframe = (state, payload) => {
  const { property, index, keyframe } = payload;
  const keyframes = state.properties[property].keyframes;

  keyframes[index] = {
    ...keyframe,
    duration: parseInt(keyframe.duration),
    value: parseFloat(keyframe.value),
    relative: keyframe.relative,
  };
};

export const updateInitialValue = (state, payload) => {
  const { property, initialValue } = payload;
  state.properties[property].initialValue = initialValue;
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.animationsData);
  const rawFlatGroups = toFlatGroups(state.animationsData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      duration: selectedItem.duration || "",
      keyframes: selectedItem.keyframes || "",
    };
  }

  // Apply search filtering to flatGroups (collapse state is now handled by groupResourcesView)
  const searchQuery = (state.searchQuery || "").toLowerCase();
  const matchesSearch = (item) => {
    if (!searchQuery) return true;
    const name = (item.name || "").toLowerCase();
    const description = (item.description || "").toLowerCase();
    return name.includes(searchQuery) || description.includes(searchQuery);
  };

  const flatGroups = rawFlatGroups
    .map((group) => {
      // Filter children based on search query
      const filteredChildren = (group.children || []).filter(matchesSearch);

      // Only show groups that have matching children or if there's no search query
      const hasMatchingChildren = filteredChildren.length > 0;
      const shouldShowGroup = !searchQuery || hasMatchingChildren;

      return {
        ...group,
        children: filteredChildren.map((item) => ({
          ...item,
          selectedStyle:
            item.id === state.selectedItemId
              ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
              : "",
        })),
        hasChildren: filteredChildren.length > 0,
        shouldDisplay: shouldShowGroup,
      };
    })
    .filter((group) => group.shouldDisplay);

  // Build dialog-specific view data
  const toAddProperties = propertyOptions.filter(
    (item) => !Object.keys(state.properties).includes(item.value),
  );

  const keyframeDropdownItems = (() => {
    if (state.popover.mode !== "keyframeMenu") {
      return propertyNameDropdownItems;
    }

    const { property, index } = state.popover.payload;
    const keyframes = state.properties[property].keyframes;
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

  let addPropertyDefaultValues = {};
  let editKeyframeDefaultValues = {};
  let editInitialValueDefaultValues = {};
  let addPropertyContext = {};
  let editInitialValueContext = {};

  if (state.popover.mode === "addProperty") {
    addPropertyDefaultValues = state.popover.formValues || {};
    addPropertyContext = { ...addPropertyDefaultValues };
  }

  if (state.popover.mode === "editKeyframe") {
    const { property, index } = state.popover.payload;
    const currentKeyframe = state.properties[property].keyframes[index];

    editKeyframeDefaultValues = {
      duration: currentKeyframe.duration,
      value: currentKeyframe.value,
      easing: currentKeyframe.easing,
      relative: currentKeyframe.relative,
    };
  }

  if (state.popover.mode === "editInitialValue") {
    const { property } = state.popover.payload;
    const currentInitialValue = state.properties[property].initialValue;

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
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "animations",
    repositoryTarget: "animations",
    selectedItemId: state.selectedItemId,
    searchQuery: state.searchQuery,
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
    form,
    defaultValues,
    // Dialog state
    isDialogOpen: state.isDialogOpen,
    dialogDefaultValues: state.dialogDefaultValues,
    dialogForm: state.dialogForm,
    properties: state.properties,
    initialValue: state.initialValue,
    addPropertyForm,
    addPropertyContext,
    addKeyframeForm: createAddKeyframeForm(state?.popover?.payload?.property),
    addKeyframeDefaultValues,
    updateKeyframeForm: createUpdateKeyframeForm(
      state?.popover?.payload?.property,
    ),
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
    addPropertyFormDefaultValues: {
      useInitialValue: false,
    },
    resourceType: "animations",
    title: "Animations",
  };
};
