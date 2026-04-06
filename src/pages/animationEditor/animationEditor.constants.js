export const EMPTY_TREE = {
  tree: [],
  items: {},
};

export const ANIMATION_RESOURCE_CATEGORY = "assets";
export const ANIMATION_SELECTED_RESOURCE_ID = "animations";
export const PREVIEW_BG_COLOR = "#4a4a4a";
export const PREVIEW_RECT_WIDTH = 200;
export const PREVIEW_RECT_HEIGHT = 200;
export const PREVIEW_UPDATE_ELEMENT_ID = "preview-element";
export const PREVIEW_TRANSITION_PREV_ELEMENT_ID = "preview-prev-element";
export const PREVIEW_TRANSITION_NEXT_ELEMENT_ID = "preview-next-element";
export const PREVIEW_TRANSITION_PREV_FILL = "#ffffff";
export const PREVIEW_TRANSITION_NEXT_FILL = "#8fd3ff";
export const PREVIEW_TRANSITION_OFFSET_X = 18;

export const UPDATE_PROPERTY_KEYS = ["alpha", "x", "y", "scaleX", "scaleY"];

export const TRANSITION_PROPERTY_KEYS = [
  "translateX",
  "translateY",
  "alpha",
  "scaleX",
  "scaleY",
];

export const SUPPORTED_EASING_NAMES = Object.freeze([
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInQuart",
  "easeOutQuart",
  "easeInOutQuart",
  "easeInQuint",
  "easeOutQuint",
  "easeInOutQuint",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
  "easeInCirc",
  "easeOutCirc",
  "easeInOutCirc",
  "easeInBack",
  "easeOutBack",
  "easeInOutBack",
  "easeInBounce",
  "easeOutBounce",
  "easeInOutBounce",
  "easeInElastic",
  "easeOutElastic",
  "easeInOutElastic",
]);

export const addKeyframeDefaultValues = {
  relative: false,
  duration: 1000,
  value: 0,
  easing: "linear",
};

export const editInitialValueForm = {
  title: "Edit Initial Value",
  fields: [
    {
      name: "valueSource",
      type: "select",
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
      type: "input-text",
      label: "Custom Initial Value",
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Update Value",
      },
    ],
  },
};

export const baseKeyframeDropdownItems = [
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

export const propertyNameDropdownItems = [
  {
    label: "Delete",
    type: "item",
    value: "delete-property",
  },
];
