import {
  DEFAULT_PROJECT_RESOLUTION,
  formatHalfViewportCanvasMaxWidth,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import { toFlatItems } from "../../internal/project/tree.js";
import { isTouchUiConfig } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  compileTransitionMaskForRuntime,
  createDefaultTransitionMask,
  createDefaultTransitionMaskCompositeItem,
  isEditableTransitionMaskKind,
  isTransitionMaskComplete,
  normalizeTransitionMaskForEditor,
} from "../../internal/animationMasks.js";
import {
  getDialogType,
  getTransitionTimelineDuration,
  getUpdateAnimationTween,
} from "../../internal/animationDisplay.js";
import {
  addKeyframeDefaultValues,
  ANIMATION_RESOURCE_CATEGORY,
  ANIMATION_SELECTED_RESOURCE_ID,
  AUTO_TWEEN_DEFAULT_DURATION,
  AUTO_TWEEN_DEFAULT_EASING,
  baseKeyframeDropdownItems,
  editInitialValueForm,
  EMPTY_TREE,
  MASK_BOOLEAN_OPTIONS,
  MASK_CHANNEL_OPTIONS,
  MASK_COMBINE_OPTIONS,
  MASK_KIND_OPTIONS,
  MASK_SAMPLE_OPTIONS,
  PREVIEW_BG_COLOR,
  PREVIEW_TRANSITION_NEXT_FILL,
  PREVIEW_TRANSITION_ELEMENT_ID,
  PREVIEW_TRANSITION_PREV_FILL,
  PREVIEW_UPDATE_ELEMENT_ID,
  propertyNameDropdownItems,
  SUPPORTED_EASING_NAMES,
  TIMELINE_ZOOM_STEP,
  TRANSITION_PROPERTY_KEYS,
  UPDATE_PROPERTY_KEYS,
} from "./animationEditor.constants.js";
import { selectAnimationEditorPageCopy } from "./support/animationEditorPageCopy.js";

const TIMELINE_ZOOM_DEFAULT = 2;
const TIMELINE_ZOOM_MIN = 0.25;
const TIMELINE_ZOOM_MAX = 4;
const TIMELINE_BASE_PIXELS_PER_SECOND = 200;
const TIMELINE_MIN_DISPLAY_DURATION_MS = 1000;
const TIMELINE_PROPERTY_COLUMN_WIDTH = 104;
const MASK_PROGRESS_PROPERTY = "progress";
const MASK_SIDE_PREFIX = "mask";
const DEFAULT_EDITOR_TAB = "tween";
const EDITOR_TAB_IDS = new Set([DEFAULT_EDITOR_TAB, "preview"]);

const createPropertyFieldConfig = (
  projectResolution = DEFAULT_PROJECT_RESOLUTION,
  copy = {},
) => {
  const { width, height } = requireProjectResolution(
    projectResolution,
    copy.projectResolutionLabel ?? "Project resolution",
  );

  return {
    progress: {
      label: copy.progressPropertyLabel ?? "Progress",
      defaultValue: 0,
      slider: {
        min: 0,
        max: 1,
        step: 0.01,
      },
    },
    alpha: {
      label: copy.alphaPropertyLabel ?? "Alpha",
      defaultValue: 1,
      slider: {
        min: 0,
        max: 1,
        step: 0.01,
      },
    },
    x: {
      label: copy.positionXPropertyLabel ?? "Position X",
      defaultValue: width / 2,
      input: {
        step: 0.01,
      },
    },
    y: {
      label: copy.positionYPropertyLabel ?? "Position Y",
      defaultValue: height / 2,
      input: {
        step: 0.01,
      },
    },
    scaleX: {
      label: copy.scaleXPropertyLabel ?? "Scale X",
      defaultValue: 1,
      input: {
        step: 0.01,
      },
    },
    scaleY: {
      label: copy.scaleYPropertyLabel ?? "Scale Y",
      defaultValue: 1,
      input: {
        step: 0.01,
      },
    },
    rotation: {
      label: copy.rotationPropertyLabel ?? "Rotation",
      defaultValue: 0,
      input: {
        step: 1,
      },
      tooltip: {
        content:
          copy.rotationPropertyTooltip ?? "Rotation is measured in degrees.",
      },
    },
    translateX: {
      label: copy.translateXPropertyLabel ?? "Translate X",
      defaultValue: 0,
      slider: {
        min: -2,
        max: 2,
        step: 0.05,
      },
      tooltip: {
        content:
          copy.translateXPropertyTooltip ??
          "Uses viewport-width units. 1 moves by one full screen width, -1 moves by one full screen width to the left.",
      },
    },
    translateY: {
      label: copy.translateYPropertyLabel ?? "Translate Y",
      defaultValue: 0,
      slider: {
        min: -2,
        max: 2,
        step: 0.05,
      },
      tooltip: {
        content:
          copy.translateYPropertyTooltip ??
          "Uses viewport-height units. 1 moves by one full screen height, -1 moves by one full screen height upward.",
      },
    },
    blurX: {
      label: copy.blurXPropertyLabel ?? "Blur X",
      defaultValue: 0,
      slider: {
        min: 0,
        max: 64,
        step: 0.5,
      },
    },
    blurY: {
      label: copy.blurYPropertyLabel ?? "Blur Y",
      defaultValue: 0,
      slider: {
        min: 0,
        max: 64,
        step: 0.5,
      },
    },
    // uProgress: {
    //   label: "Progress",
    //   defaultValue: 0,
    //   slider: {
    //     min: 0,
    //     max: 1,
    //     step: 0.01,
    //   },
    //   tooltip: {
    //     content: "Progress uniforms use a normalized value from 0 to 1.",
    //   },
    // },
  };
};

const formatEasingLabel = (easingName) => {
  if (easingName === "linear") {
    return "Linear";
  }

  return easingName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());
};

const STATIC_LABEL_COPY_KEYS = Object.freeze({
  Absolute: "absoluteValueType",
  Add: "addButton",
  "Add animation property": "addAnimationPropertyTitle",
  "Add Keyframe": "addKeyframeTitle",
  "Add keyframe to left": "addKeyframeLeftMenuItem",
  "Add keyframe to right": "addKeyframeRightMenuItem",
  "Add Property": "addPropertyButton",
  Alpha: "alphaPropertyLabel",
  Auto: "autoTweenMode",
  "BG Image": "backgroundImageLabel",
  Cancel: "cancelButton",
  Channel: "channelLabel",
  "Custom Initial Value": "customInitialValueLabel",
  "Custom Value": "customValueSource",
  "Delay (ms)": "delayMsLabel",
  Delete: "deleteMenuItem",
  "Delete keyframe": "deleteKeyframeMenuItem",
  Done: "doneButton",
  Duration: "durationLabel",
  "Duration (ms)": "durationMsLabel",
  "Duration in milliseconds": "durationMsPlaceholder",
  Easing: "easingLabel",
  Edit: "editMenuItem",
  "Edit Auto Tween": "editAutoTweenTitle",
  "Edit Initial Value": "editInitialValueTitle",
  "Edit Keyframe": "editKeyframeTitle",
  "Edit keyframe": "editKeyframeMenuItem",
  Greyscale: "greyscaleChannel",
  Image: "imageLabel",
  In: "inTimelineLabel",
  Initial: "initialLabel",
  "Initial value": "initialValueLabel",
  Invert: "invertLabel",
  Keyframes: "keyframesTweenMode",
  Kind: "kindLabel",
  Linear: "linearEasingLabel",
  "Move keyframe to left": "moveKeyframeLeftMenuItem",
  "Move keyframe to right": "moveKeyframeRightMenuItem",
  Max: "maxCombineLabel",
  Min: "minCombineLabel",
  Multiply: "multiplyCombineLabel",
  No: "noLabel",
  Off: "offLabel",
  OK: "okButton",
  On: "onLabel",
  Out: "outTimelineLabel",
  Preview: "previewTitle",
  Property: "propertyLabel",
  Relative: "relativeValueType",
  Remove: "removeMenuItem",
  Save: "saveButton",
  Single: "singleMaskKind",
  Softness: "softnessLabel",
  Step: "stepSampleLabel",
  Timeline: "timelineLabel",
  "Tween Mode": "tweenModeLabel",
  "The final value of the property at the end of the animation":
    "keyframeValueTooltip",
  "The initial value of the property at the start of the animation. If not set, it will use the element's current value at start of animation":
    "initialValueTooltip",
  "The time it takes for the animation keyframe to move from previous value to next value":
    "keyframeDurationTooltip",
  "Update Auto Tween": "updateAutoTweenButton",
  "Update Keyframe": "updateKeyframeButton",
  "Update Value": "updateValueButton",
  "Use Default Value": "useDefaultValueSource",
  "Use initial value": "useInitialValueLabel",
  "Relative will add the value to the previous value. Absolute will set the property value to exactly the specified value":
    "relativeValueTooltip",
  "Value Source": "valueSourceLabel",
  Value: "valueLabel",
  "Value type": "valueTypeLabel",
  "Incoming Image": "incomingImageLabel",
  "Outgoing Image": "outgoingImageLabel",
  "Target Image": "targetImageLabel",
  Yes: "yesLabel",
});

const localizeText = (value, copy = {}) => {
  const copyKey = STATIC_LABEL_COPY_KEYS[value];
  return copyKey ? (copy[copyKey] ?? value) : value;
};

const localizeOptions = (options = [], copy = {}) => {
  return options.map((option) => ({
    ...option,
    label: localizeText(option.label, copy),
  }));
};

const localizeMenuItems = (items = [], copy = {}) => {
  return items.map((item) => ({
    ...item,
    label: localizeText(item.label, copy),
  }));
};

const localizeFormField = (field = {}, copy = {}) => {
  const localizedField = { ...field };

  if (localizedField.label) {
    localizedField.label = localizeText(localizedField.label, copy);
  }
  if (localizedField.placeholder) {
    localizedField.placeholder = localizeText(localizedField.placeholder, copy);
  }
  if (localizedField.tooltip?.content) {
    localizedField.tooltip = {
      ...localizedField.tooltip,
      content: localizeText(localizedField.tooltip.content, copy),
    };
  }
  if (Array.isArray(localizedField.options)) {
    localizedField.options = localizeOptions(localizedField.options, copy);
  }

  return localizedField;
};

const localizeForm = (form = {}, copy = {}) => {
  const localizedForm = { ...form };

  if (localizedForm.title) {
    localizedForm.title = localizeText(localizedForm.title, copy);
  }
  if (Array.isArray(localizedForm.fields)) {
    localizedForm.fields = localizedForm.fields.map((field) =>
      localizeFormField(field, copy),
    );
  }
  if (localizedForm.actions?.buttons) {
    localizedForm.actions = {
      ...localizedForm.actions,
      buttons: localizedForm.actions.buttons.map((button) => ({
        ...button,
        label: localizeText(button.label, copy),
      })),
    };
  }

  return localizedForm;
};

const createEasingOptions = (copy = {}) => {
  return SUPPORTED_EASING_NAMES.map((easingName) => ({
    label:
      easingName === "linear"
        ? (copy.linearEasingLabel ?? formatEasingLabel(easingName))
        : formatEasingLabel(easingName),
    value: easingName,
  }));
};

const createPreviewRect = ({ id, x, y, fill, width, height } = {}) => {
  return {
    id,
    type: "rect",
    x,
    y,
    width,
    height,
    fill,
    anchorX: 0.5,
    anchorY: 0.5,
  };
};

const toPositiveNumber = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : fallback;
};

const getPreviewImageResource = (imagesData, imageId) => {
  if (!imageId) {
    return undefined;
  }

  const imageItem = imagesData?.items?.[imageId];
  if (imageItem?.type && imageItem.type !== "image") {
    return undefined;
  }

  if (!imageItem?.fileId) {
    return undefined;
  }

  return imageItem;
};

const UPDATE_PREVIEW_IMAGE_SLOT_CONFIGS = Object.freeze([
  {
    label: "BG Image",
    target: "preview-background",
    field: "background",
    supportsTransform: false,
  },
  {
    label: "Target Image",
    target: "preview-target",
    field: "target",
    supportsTransform: true,
  },
]);

const TRANSITION_PREVIEW_IMAGE_SLOT_CONFIGS = Object.freeze([
  {
    label: "BG Image",
    target: "preview-background",
    field: "background",
    supportsTransform: false,
  },
  {
    label: "Outgoing Image",
    target: "preview-outgoing",
    field: "outgoing",
    supportsTransform: true,
  },
  {
    label: "Incoming Image",
    target: "preview-incoming",
    field: "incoming",
    supportsTransform: true,
  },
]);

const createInitialPreviewImages = () => ({
  background: {},
  outgoing: {},
  incoming: {},
  target: {},
});

const getPreviewImageSlotConfigs = (dialogType) =>
  dialogType === "transition"
    ? TRANSITION_PREVIEW_IMAGE_SLOT_CONFIGS
    : UPDATE_PREVIEW_IMAGE_SLOT_CONFIGS;

const getPreviewSlotConfig = (target) => {
  return [
    ...TRANSITION_PREVIEW_IMAGE_SLOT_CONFIGS,
    ...UPDATE_PREVIEW_IMAGE_SLOT_CONFIGS,
  ].find((slot) => slot.target === target);
};

const normalizePreviewSlot = (value, { supportsTransform = false } = {}) => {
  const slot = {};

  if (typeof value === "string" && value.length > 0) {
    slot.imageId = value;
    return slot;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return slot;
  }

  if (typeof value.imageId === "string" && value.imageId.length > 0) {
    slot.imageId = value.imageId;
  }

  if (
    supportsTransform &&
    typeof value.transformId === "string" &&
    value.transformId.length > 0
  ) {
    slot.transformId = value.transformId;
  }

  return slot;
};

const normalizeAnimationPreviewData = (previewData) => {
  const source =
    previewData &&
    typeof previewData === "object" &&
    !Array.isArray(previewData)
      ? previewData
      : {};

  return {
    background: normalizePreviewSlot(
      source.background ?? source.backgroundImageId,
      { supportsTransform: false },
    ),
    outgoing: normalizePreviewSlot(source.outgoing ?? source.outgoingImageId, {
      supportsTransform: true,
    }),
    incoming: normalizePreviewSlot(source.incoming ?? source.incomingImageId, {
      supportsTransform: true,
    }),
    target: normalizePreviewSlot(
      source.target ?? source.targetImageId ?? source.incoming,
      { supportsTransform: true },
    ),
  };
};

const getPreviewSlot = (previewImages, target) => {
  const slotConfig = getPreviewSlotConfig(target);
  if (!slotConfig) {
    return {};
  }

  return previewImages?.[slotConfig.field] ?? {};
};

const getPreviewSlotImageId = (previewImages, target) => {
  return getPreviewSlot(previewImages, target).imageId;
};

const getUpdatePreviewSlot = (previewImages = {}) => {
  return previewImages.target?.imageId
    ? previewImages.target
    : (previewImages.incoming ?? {});
};

const createPreviewBackgroundElement = ({
  imagesData,
  previewImages,
  projectResolution,
} = {}) => {
  const { width, height } = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
  const imageItem = getPreviewImageResource(
    imagesData,
    getPreviewSlotImageId(previewImages, "preview-background"),
  );

  if (!imageItem) {
    return {
      id: "bg",
      type: "rect",
      x: 0,
      y: 0,
      width,
      height,
      fill: PREVIEW_BG_COLOR,
    };
  }

  return {
    id: "bg",
    type: "sprite",
    src: imageItem.fileId,
    fileType: imageItem.fileType ?? "image/png",
    x: width / 2,
    y: height / 2,
    width: toPositiveNumber(imageItem.width, width),
    height: toPositiveNumber(imageItem.height, height),
    anchorX: 0.5,
    anchorY: 0.5,
  };
};

const createPreviewContentElement = ({
  id,
  previewSlot,
  imagesData,
  projectResolution,
  fallbackFill,
} = {}) => {
  const { width, height } = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
  const centerX = width / 2;
  const centerY = height / 2;
  const imageItem = getPreviewImageResource(imagesData, previewSlot?.imageId);

  if (!imageItem) {
    return createPreviewRect({
      id,
      x: centerX,
      y: centerY,
      width,
      height,
      fill: fallbackFill,
    });
  }

  return {
    id,
    type: "sprite",
    src: imageItem.fileId,
    fileType: imageItem.fileType ?? "image/png",
    x: centerX,
    y: centerY,
    width: toPositiveNumber(imageItem.width, width),
    height: toPositiveNumber(imageItem.height, height),
    anchorX: 0.5,
    anchorY: 0.5,
  };
};

const createAnimationResetState = ({
  dialogType,
  imagesData,
  previewImages,
  projectResolution,
} = {}) => {
  const elements = [
    createPreviewBackgroundElement({
      imagesData,
      previewImages,
      projectResolution,
    }),
  ];

  if (dialogType === "transition") {
    elements.push(
      createPreviewContentElement({
        id: PREVIEW_TRANSITION_ELEMENT_ID,
        previewSlot: getPreviewSlot(previewImages, "preview-outgoing"),
        imagesData,
        projectResolution,
        fallbackFill: PREVIEW_TRANSITION_PREV_FILL,
      }),
    );
  } else {
    elements.push(
      createPreviewContentElement({
        id: PREVIEW_UPDATE_ELEMENT_ID,
        previewSlot: getUpdatePreviewSlot(previewImages),
        imagesData,
        projectResolution,
        fallbackFill: "white",
      }),
    );
  }

  return {
    elements,
    animations: [],
  };
};

const TWEEN_MODE_OPTIONS = Object.freeze([
  {
    label: "Keyframes",
    value: "keyframes",
  },
  {
    label: "Auto",
    value: "auto",
  },
]);

const buildPropertyOptions = (propertyKeys, propertyFieldConfig) => {
  return propertyKeys.map((property) => ({
    label: propertyFieldConfig[property]?.label ?? property,
    value: property,
  }));
};

const getOptionLabel = (options, value) => {
  return options.find((option) => option.value === value)?.label ?? value;
};

const createDefaultInitialValuesByProperty = (propertyFieldConfig) => {
  return Object.fromEntries(
    Object.entries(propertyFieldConfig).map(([property, config]) => [
      property,
      config.defaultValue,
    ]),
  );
};

const createTimelineDefaultValues = (propertyKeys, propertyFieldConfig) => {
  const defaultInitialValuesByProperty =
    createDefaultInitialValuesByProperty(propertyFieldConfig);

  return Object.fromEntries(
    propertyKeys.map((property) => [
      property,
      defaultInitialValuesByProperty[property],
    ]),
  );
};

const createSliderField = ({
  property,
  propertyFieldConfig,
  name,
  label,
  required = false,
  fallbackLabel = "Value",
} = {}) => {
  const config = propertyFieldConfig[property];

  if (!config) {
    return {
      name,
      type: "input-text",
      label: label ?? fallbackLabel,
      required,
    };
  }

  if (config.input) {
    const field = {
      name,
      type: "input-number",
      label: label ?? fallbackLabel,
    };
    Object.assign(field, config.input);

    if (required) {
      field.required = true;
    }
    if (config.tooltip) {
      field.tooltip = config.tooltip;
    }

    return field;
  }

  const field = {
    name,
    type: "slider-with-input",
    label: label ?? fallbackLabel,
  };

  Object.assign(field, config.slider);

  if (required) {
    field.required = true;
  }

  if (config.tooltip) {
    field.tooltip = config.tooltip;
  }

  return field;
};

const createAutoTweenFields = (copy = {}) => {
  return [
    {
      name: "duration",
      type: "input-text",
      label: "Duration (ms)",
      required: true,
      defaultValue: AUTO_TWEEN_DEFAULT_DURATION,
      placeholder: "Duration in milliseconds",
    },
    {
      name: "easing",
      type: "select",
      label: "Easing",
      options: createEasingOptions(copy),
      required: true,
      defaultValue: AUTO_TWEEN_DEFAULT_EASING,
    },
  ].map((field) => localizeFormField(field, copy));
};

const createEditAutoTweenForm = (copy = {}) => {
  return localizeForm(
    {
      title: "Edit Auto Tween",
      fields: createAutoTweenFields(copy),
      actions: {
        layout: "",
        buttons: [
          {
            id: "submit",
            variant: "pr",
            label: "Update Auto Tween",
          },
        ],
      },
    },
    copy,
  );
};

const createAddKeyframeForm = (
  property,
  propertyFieldConfig,
  { includeDelay = false, includeDuration = true } = {},
  copy = {},
) => {
  if (!property) {
    return {};
  }

  const fields = [];

  if (includeDelay) {
    fields.push({
      name: "delay",
      type: "input-number",
      label: "Delay (ms)",
      min: 0,
      step: 1,
      required: true,
    });
  }

  if (includeDuration) {
    fields.push({
      name: "duration",
      type: "input-number",
      label: "Duration (ms)",
      min: 1,
      step: 1,
      required: true,
      placeholder: "Duration in milliseconds",
      tooltip: {
        content:
          "The time it takes for the animation keyframe to move from previous value to next value",
      },
    });
  }

  fields.push(
    {
      ...createSliderField({
        property,
        propertyFieldConfig,
        name: "value",
        label: "Value",
        required: true,
      }),
      tooltip: {
        content: "The final value of the property at the end of the animation",
      },
    },
    {
      name: "relative",
      type: "segmented-control",
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
      type: "select",
      label: "Easing",
      options: createEasingOptions(copy),
      required: true,
    },
  );

  return localizeForm(
    {
      title: "Add Keyframe",
      fields,
      actions: {
        layout: "",
        buttons: [
          {
            id: "submit",
            variant: "pr",
            label: "Add Keyframe",
          },
        ],
      },
    },
    copy,
  );
};

const createUpdateKeyframeForm = (
  property,
  propertyFieldConfig,
  options = {},
  copy = {},
) => {
  return localizeForm(
    {
      ...createAddKeyframeForm(
        property,
        propertyFieldConfig,
        { ...options, includeDelay: true },
        copy,
      ),
      title: "Edit Keyframe",
      actions: {
        layout: "",
        buttons: [
          {
            id: "submit",
            variant: "pr",
            label: "Update Keyframe",
          },
        ],
      },
    },
    copy,
  );
};

const createAddPropertyForm = (
  availableProperties,
  propertyFieldConfig,
  { side, property, sideOptions = [] } = {},
  copy = {},
) => {
  const isUpdateSide = side === "update";
  const initialValueField = property
    ? createSliderField({
        property,
        propertyFieldConfig,
        name: "initialValue",
        label: "Initial value",
      })
    : undefined;
  if (initialValueField) {
    initialValueField.defaultValue =
      propertyFieldConfig[property]?.defaultValue ?? 0;
    initialValueField.$when = isUpdateSide
      ? 'tweenMode != "auto" && useInitialValue == true'
      : "useInitialValue == true";
  }
  const fields = [];

  if (sideOptions.length > 0) {
    fields.push({
      name: "side",
      type: "segmented-control",
      label: "Timeline",
      noClear: true,
      options: sideOptions,
      required: true,
    });
  }

  fields.push({
    name: "property",
    type: "select",
    label: "Property",
    options: availableProperties,
    required: true,
  });

  if (isUpdateSide) {
    fields.push({
      name: "tweenMode",
      type: "segmented-control",
      label: "Tween Mode",
      noClear: true,
      options: localizeOptions(TWEEN_MODE_OPTIONS, copy),
      required: true,
    });
    fields.push({
      name: "useInitialValue",
      type: "segmented-control",
      label: "Use initial value",
      noClear: true,
      $when: 'tweenMode != "auto"',
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
    });
    const autoFields = createAutoTweenFields(copy).map((field) => ({
      ...field,
      $when: 'tweenMode == "auto"',
    }));
    if (initialValueField) {
      fields.push(initialValueField);
    }
    fields.push(...autoFields);
  } else {
    fields.push({
      name: "useInitialValue",
      type: "segmented-control",
      label: "Use initial value",
      noClear: true,
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
    });
    if (initialValueField) {
      fields.push(initialValueField);
    }
  }

  return localizeForm(
    {
      title: "Add animation property",
      fields,
      actions: {
        layout: "",
        buttons: [
          {
            id: "submit",
            variant: "pr",
            label: "Add Property",
          },
        ],
      },
    },
    copy,
  );
};

const createTransitionAddPropertySideMenuItems = ({
  previousAvailable = false,
  nextAvailable = false,
  maskAvailable = false,
  copy = {},
} = {}) => {
  const items = [];

  if (previousAvailable) {
    items.push({
      label: copy.outTimelineLabel ?? "Outgoing",
      type: "item",
      value: "prev",
    });
  }

  if (nextAvailable) {
    items.push({
      label: copy.inTimelineLabel ?? "Incoming",
      type: "item",
      value: "next",
    });
  }

  if (maskAvailable) {
    items.push({
      label: copy.maskTitle ?? "Mask",
      type: "item",
      value: "mask",
    });
  }

  return items;
};

const createInitialImageSelectorDialogState = () => ({
  open: false,
  selectedImageId: undefined,
  target: undefined,
  index: undefined,
});

const createEmptyTweenBySection = () => ({
  update: {},
  prev: {},
  next: {},
});

const createEmptyImagesData = () => ({
  items: {},
  tree: [],
});

const DEFAULT_MASK_CHANNEL_OPTION = MASK_CHANNEL_OPTIONS[0];

const normalizeEditorMaskChannel = (channel) => {
  return MASK_CHANNEL_OPTIONS.some((option) => option.value === channel)
    ? channel
    : DEFAULT_MASK_CHANNEL_OPTION.value;
};

const createEmptyMaskPanelData = (copy = {}) => ({
  enabled: false,
  unsupported: false,
  unsupportedKind: undefined,
  unsupportedMessage: "",
  unsupportedDescription: "",
  kind: "single",
  kindLabel: copy.singleMaskKind ?? "Single",
  channelValue: DEFAULT_MASK_CHANNEL_OPTION.value,
  channelLabel: localizeText(DEFAULT_MASK_CHANNEL_OPTION.label, copy),
  sampleValue: "step",
  combineValue: "max",
  invertValue: "off",
  invertLabel: copy.offLabel ?? "Off",
  softness: 0.08,
  progressInitialValue: 0,
  progressDuration: 900,
  progressDurationLabel: "900 ms",
  progressEasing: "linear",
  progressEasingLabel: copy.linearEasingLabel ?? "Linear",
  singleImage: undefined,
  imageItems: [],
  imageLabel: copy.noImageSelectedLabel ?? "No image selected",
  sequenceItems: [],
  compositeItems: [],
});

const isMaskSide = (side) => {
  return side === MASK_SIDE_PREFIX || side?.startsWith(`${MASK_SIDE_PREFIX}:`);
};

const getMaskIndexFromSide = (side, fallbackIndex = 0) => {
  if (side === MASK_SIDE_PREFIX) {
    return fallbackIndex;
  }

  const index = Number.parseInt(side?.slice(MASK_SIDE_PREFIX.length + 1), 10);
  return Number.isInteger(index) && index >= 0 ? index : fallbackIndex;
};

const createMaskSide = (index) => `${MASK_SIDE_PREFIX}:${index}`;

const getTransitionMasks = (state) => {
  const masks = [];
  if (state.transitionMask) {
    masks.push(state.transitionMask);
  }
  masks.push(...(state.additionalTransitionMasks ?? []));
  return masks;
};

const getTransitionMask = (state, index = state.selectedMaskIndex ?? 0) => {
  if (index === 0) {
    return state.transitionMask;
  }

  return state.additionalTransitionMasks?.[index - 1];
};

const setTransitionMaskAtIndex = (state, index, mask) => {
  if (index === 0) {
    state.transitionMask = mask;
    return;
  }

  state.additionalTransitionMasks[index - 1] = mask;
};

const appendTransitionMask = (state, mask) => {
  if (!state.transitionMask) {
    state.transitionMask = mask;
    return 0;
  }

  state.additionalTransitionMasks.push(mask);
  return state.additionalTransitionMasks.length;
};

const removeTransitionMaskAtIndex = (state, index) => {
  if (index === 0) {
    state.transitionMask = state.additionalTransitionMasks.shift();
    return;
  }

  state.additionalTransitionMasks.splice(index - 1, 1);
};

const getTransitionMaskValue = (state) => {
  const masks = getTransitionMasks(state);
  if (masks.length === 0) {
    return undefined;
  }

  return masks.length === 1 ? masks[0] : masks;
};

const getSectionProperties = (state, side) => {
  if (isMaskSide(side)) {
    const maskIndex = getMaskIndexFromSide(side, state.selectedMaskIndex ?? 0);
    const progress = getTransitionMask(state, maskIndex)?.progress;
    return progress ? { [MASK_PROGRESS_PROPERTY]: progress } : {};
  }

  return state.tweenBySection?.[side] ?? {};
};

const getPropertyFieldConfig = (state) => {
  return createPropertyFieldConfig(state.projectResolution);
};

const getLocalizedPropertyFieldConfig = (state, copy = {}) => {
  return createPropertyFieldConfig(state.projectResolution, copy);
};

const getDefaultInitialValues = (state) => {
  return createDefaultInitialValuesByProperty(getPropertyFieldConfig(state));
};

const getMaskEditorTransitionMask = (state) => {
  return state.popover.mode === "addMask"
    ? state.pendingTransitionMask
    : getTransitionMask(state);
};

const setMaskEditorTransitionMask = (state, mask) => {
  if (state.popover.mode === "addMask") {
    state.pendingTransitionMask = mask;
    return;
  }

  setTransitionMaskAtIndex(state, state.selectedMaskIndex ?? 0, mask);
};

const cloneMaskProgress = (progress) => {
  if (!progress) {
    return undefined;
  }

  return {
    ...progress,
    keyframes: (progress.keyframes ?? []).map((keyframe) => ({
      ...keyframe,
    })),
  };
};

const cloneTransitionMask = (mask = {}) => {
  const nextMask = {};
  nextMask.kind = mask.kind;
  nextMask.imageId = mask.imageId;
  nextMask.imageIds = Array.isArray(mask.imageIds) ? [...mask.imageIds] : [];
  nextMask.items = Array.isArray(mask.items)
    ? mask.items.map((item) => ({
        imageId: item?.imageId,
        channel: item?.channel,
        invert: item?.invert,
      }))
    : [];
  nextMask.channel = mask.channel;
  nextMask.combine = mask.combine;
  nextMask.sample = mask.sample;
  nextMask.softness = mask.softness;
  nextMask.invert = mask.invert;
  nextMask.delay = mask.delay;
  nextMask.progress = cloneMaskProgress(mask.progress);
  nextMask.progressDelay = mask.progressDelay;
  nextMask.progressDuration = mask.progressDuration;
  nextMask.progressEasing = mask.progressEasing;
  return nextMask;
};

const getEffectiveTransitionMask = (state) => {
  return getTransitionMaskValue(state);
};

const getImageItems = (state) => {
  return state.imagesData?.items ?? {};
};

const getImageItemById = (state, imageId) => {
  return getImageItems(state)?.[imageId];
};

const resolveImageAspectRatio = (item) => {
  const width = Number(item?.width);
  const height = Number(item?.height);

  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return "16 / 9";
  }

  return `${Math.max(1, Math.round(width))} / ${Math.max(1, Math.round(height))}`;
};

const buildMaskImageItem = (state, imageId) => {
  if (!imageId) {
    return undefined;
  }

  const imageItem = getImageItemById(state, imageId);

  return {
    imageId,
    previewFileId: imageItem?.thumbnailFileId ?? imageItem?.fileId,
    previewAspectRatio: resolveImageAspectRatio(imageItem),
    name: imageItem?.name ?? imageId,
    itemBorderColor: "bo",
    itemHoverBorderColor: "ac",
  };
};

const getPropertyOptionsForSide = (side, propertyFieldConfig) => {
  return buildPropertyOptions(
    side === "update" ? UPDATE_PROPERTY_KEYS : TRANSITION_PROPERTY_KEYS,
    propertyFieldConfig,
  );
};

const PROPERTY_CONFLICTS = Object.freeze({
  x: ["translateX"],
  translateX: ["x"],
  y: ["translateY"],
  translateY: ["y"],
});

const hasPropertyConflict = (properties = {}, property) => {
  return (PROPERTY_CONFLICTS[property] ?? []).some((conflictingProperty) =>
    Object.prototype.hasOwnProperty.call(properties, conflictingProperty),
  );
};

const getAvailableProperties = (state, side, propertyFieldConfig) => {
  const currentProperties = getSectionProperties(state, side);

  return getPropertyOptionsForSide(side, propertyFieldConfig).filter((item) => {
    return (
      !Object.prototype.hasOwnProperty.call(currentProperties, item.value) &&
      !hasPropertyConflict(currentProperties, item.value)
    );
  });
};

export const createInitialState = () => ({
  data: EMPTY_TREE,
  imagesData: createEmptyImagesData(),
  selectedItemId: undefined,
  selectedEditorTab: DEFAULT_EDITOR_TAB,
  selectedKeyframe: undefined,
  selectedProperty: undefined,
  selectedMask: false,
  selectedMaskIndex: undefined,
  timelinePan: undefined,
  timelinePanClickSuppressed: false,
  timelinePanHovered: false,
  timelinePanMode: false,
  timelineZoom: TIMELINE_ZOOM_DEFAULT,
  timelineScrollLeft: 0,
  timelineViewportWidth: undefined,
  timelineDisplayDurationOverrideMs: undefined,
  timelineUsedDurationPreview: undefined,
  dialogType: "update",
  targetGroupId: undefined,
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  tweenBySection: createEmptyTweenBySection(),
  transitionMask: undefined,
  additionalTransitionMasks: [],
  pendingTransitionMask: undefined,
  dialogDefaultValues: {
    name: "",
    description: "",
  },
  editMode: false,
  editItemId: undefined,
  animationJsonCopyShortcutStartedAt: undefined,
  animationCanvasCaptureShortcutStartedAt: undefined,
  animationCanvasCaptureInProgress: false,
  animationVideoShortcutStartedAt: undefined,
  animationVideoExportInProgress: false,
  autosaveVersion: 0,
  autosavePersistedVersion: 0,
  autosaveInFlight: false,
  autosaveTimerId: undefined,
  autosavePendingSinceAt: undefined,
  lastAutosaveFlushStartedAt: undefined,
  autosavePersistedFingerprint: undefined,
  previewPlaybackMode: "auto",
  previewLoopEnabled: false,
  previewRenderVersion: 0,
  previewPreparedVersion: undefined,
  previewPlayheadTimeMs: undefined,
  previewPlayheadVisible: false,
  previewPlaybackFrameId: undefined,
  previewPlaybackStartedAtMs: undefined,
  previewPlaybackDurationMs: undefined,
  previewPlaybackRequestId: undefined,
  previewImages: createInitialPreviewImages(),
  isTouchMode: false,
  isPreviewDialogOpen: false,
  maskRemoveConfirmDialogOpen: false,
  propertyRemoveConfirmDialogOpen: false,
  popover: {
    mode: "none",
    x: undefined,
    y: undefined,
    payload: {},
    formValues: {},
  },
  imageSelectorDialog: createInitialImageSelectorDialogState(),
  fullImagePreviewVisible: false,
  fullImagePreviewImageId: undefined,
});

export const setItems = ({ state }, { data } = {}) => {
  state.data = data ?? EMPTY_TREE;
};

export const setImages = ({ state }, { images } = {}) => {
  state.imagesData = images ?? createEmptyImagesData();
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const setSelectedEditorTab = ({ state }, { tab } = {}) => {
  if (EDITOR_TAB_IDS.has(tab)) {
    state.selectedEditorTab = tab;
  }
};

export const selectSelectedEditorTab = ({ state }) => {
  return state.selectedEditorTab;
};

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
};

export const selectIsTouchMode = ({ state }) => {
  return state.isTouchMode;
};

export const setTimelineZoom = ({ state }, { zoom } = {}) => {
  const numericZoom = Number(zoom);
  if (!Number.isFinite(numericZoom)) {
    return;
  }

  state.timelineZoom = Math.min(
    TIMELINE_ZOOM_MAX,
    Math.max(TIMELINE_ZOOM_MIN, numericZoom),
  );
};

export const nudgeTimelineZoom = ({ state }, { delta } = {}) => {
  setTimelineZoom({ state }, { zoom: state.timelineZoom + Number(delta ?? 0) });
};

export const selectTimelineZoom = ({ state }) => {
  return state.timelineZoom;
};

export const selectTimelineViewportWidth = ({ state }) => {
  return state.timelineViewportWidth;
};

export const extendTimelineDisplayDuration = ({ state }, { duration } = {}) => {
  const numericDuration = Number(duration);
  if (!Number.isFinite(numericDuration) || numericDuration <= 0) {
    return;
  }

  state.timelineDisplayDurationOverrideMs = Math.max(
    state.timelineDisplayDurationOverrideMs ?? 0,
    numericDuration,
  );
};

export const setTimelineUsedDurationPreview = (
  { state },
  { side, duration } = {},
) => {
  const numericDuration = Number(duration);
  if (!side || !Number.isFinite(numericDuration) || numericDuration < 0) {
    return;
  }

  state.timelineUsedDurationPreview = {
    side,
    duration: numericDuration,
  };
};

export const clearTimelineUsedDurationPreview = ({ state }, _payload = {}) => {
  state.timelineUsedDurationPreview = undefined;
};

export const setTimelinePanHovered = ({ state }, { hovered } = {}) => {
  state.timelinePanHovered = hovered ?? false;
};

export const setTimelinePanMode = ({ state }, { enabled } = {}) => {
  state.timelinePanMode = enabled ?? false;
};

export const startTimelinePan = (
  { state },
  { pointerId, startX, startScrollLeft } = {},
) => {
  state.timelinePanClickSuppressed = true;
  state.timelinePan = {
    pointerId,
    startX,
    startScrollLeft,
  };
};

export const stopTimelinePan = ({ state }, _payload = {}) => {
  state.timelinePan = undefined;
};

export const selectTimelinePan = ({ state }) => {
  return state.timelinePan;
};

export const selectTimelinePanHovered = ({ state }) => {
  return state.timelinePanHovered;
};

export const selectTimelinePanMode = ({ state }) => {
  return state.timelinePanMode;
};

export const selectTimelinePanClickSuppressed = ({ state }) => {
  return state.timelinePanClickSuppressed;
};

export const clearTimelinePanClickSuppression = ({ state }, _payload = {}) => {
  state.timelinePanClickSuppressed = false;
};

export const setTimelineScrollMetrics = (
  { state },
  { scrollLeft, viewportWidth } = {},
) => {
  state.timelineScrollLeft = Math.max(0, Number(scrollLeft) || 0);
  state.timelineViewportWidth = Number.isFinite(Number(viewportWidth))
    ? Math.max(0, Number(viewportWidth))
    : undefined;
};

export const setAnimationName = ({ state }, { name } = {}) => {
  state.dialogDefaultValues.name = name ?? "";
};

export const selectAnimationName = ({ state }) => {
  return state.dialogDefaultValues.name ?? "";
};

export const setAnimationDescription = ({ state }, { description } = {}) => {
  state.dialogDefaultValues.description = description ?? "";
};

export const selectAnimationDescription = ({ state }) => {
  return state.dialogDefaultValues.description ?? "";
};

const cloneTweenBySectionFromItem = (itemData, dialogType) => {
  const tweenBySection = createEmptyTweenBySection();

  if (dialogType === "transition") {
    tweenBySection.prev = structuredClone(
      itemData?.animation?.prev?.tween ?? {},
    );
    tweenBySection.next = structuredClone(
      itemData?.animation?.next?.tween ?? {},
    );
    return tweenBySection;
  }

  tweenBySection.update = structuredClone(getUpdateAnimationTween(itemData));
  return tweenBySection;
};

const cloneTransitionMasksFromItem = (state, itemData, dialogType) => {
  if (dialogType !== "transition") {
    return [];
  }

  const persistedMask = itemData?.animation?.mask;
  const persistedMasks = Array.isArray(persistedMask)
    ? persistedMask
    : persistedMask
      ? [persistedMask]
      : [];

  return persistedMasks.map((mask) => {
    if (!isEditableTransitionMaskKind(mask.kind)) {
      return structuredClone(mask);
    }

    return normalizeTransitionMaskForEditor(mask, getImageItems(state));
  });
};

export const openDialog = (
  { state },
  { editMode, itemId, itemData, targetGroupId, dialogType } = {},
) => {
  const resolvedDialogType =
    dialogType ?? getDialogType(itemData?.animation?.type);

  state.dialogType = resolvedDialogType;
  state.selectedEditorTab = DEFAULT_EDITOR_TAB;
  state.selectedKeyframe = undefined;
  state.selectedProperty = undefined;
  state.selectedMask = false;
  state.selectedMaskIndex = undefined;
  state.timelineDisplayDurationOverrideMs = undefined;
  state.timelineUsedDurationPreview = undefined;
  state.maskRemoveConfirmDialogOpen = false;
  state.propertyRemoveConfirmDialogOpen = false;
  state.editMode = Boolean(editMode);
  state.editItemId = itemId;
  state.pendingTransitionMask = undefined;
  state.previewImages = normalizeAnimationPreviewData(itemData?.preview);

  if (editMode && itemData) {
    state.targetGroupId = itemData.parentId ?? undefined;
    state.dialogDefaultValues = {
      name: itemData.name ?? "",
      description: itemData.description ?? "",
    };
    state.tweenBySection = cloneTweenBySectionFromItem(
      itemData,
      resolvedDialogType,
    );
    const transitionMasks = cloneTransitionMasksFromItem(
      state,
      itemData,
      resolvedDialogType,
    );
    state.transitionMask = transitionMasks[0];
    state.additionalTransitionMasks = transitionMasks.slice(1);
    return;
  }

  state.targetGroupId =
    targetGroupId === "_root"
      ? undefined
      : (targetGroupId ?? itemData?.parentId ?? undefined);
  state.dialogDefaultValues = {
    name: "",
    description: "",
  };
  state.tweenBySection = createEmptyTweenBySection();
  state.transitionMask = undefined;
  state.additionalTransitionMasks = [];
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

export const selectEditItemData = ({ state }) => {
  if (!state.editItemId) {
    return undefined;
  }

  return state.data?.items?.[state.editItemId];
};

export const setAnimationJsonCopyShortcutStartedAt = (
  { state },
  { timestamp } = {},
) => {
  state.animationJsonCopyShortcutStartedAt = timestamp;
};

export const selectAnimationJsonCopyShortcutStartedAt = ({ state }) => {
  return state.animationJsonCopyShortcutStartedAt;
};

export const setAnimationCanvasCaptureShortcutStartedAt = (
  { state },
  { timestamp } = {},
) => {
  state.animationCanvasCaptureShortcutStartedAt = timestamp;
};

export const selectAnimationCanvasCaptureShortcutStartedAt = ({ state }) => {
  return state.animationCanvasCaptureShortcutStartedAt;
};

export const setAnimationCanvasCaptureInProgress = (
  { state },
  { inProgress } = {},
) => {
  state.animationCanvasCaptureInProgress = inProgress ?? false;
};

export const selectAnimationCanvasCaptureInProgress = ({ state }) => {
  return state.animationCanvasCaptureInProgress;
};

export const setAnimationVideoShortcutStartedAt = (
  { state },
  { timestamp } = {},
) => {
  state.animationVideoShortcutStartedAt = timestamp;
};

export const selectAnimationVideoShortcutStartedAt = ({ state }) => {
  return state.animationVideoShortcutStartedAt;
};

export const setAnimationVideoExportInProgress = (
  { state },
  { inProgress } = {},
) => {
  state.animationVideoExportInProgress = inProgress ?? false;
};

export const selectAnimationVideoExportInProgress = ({ state }) => {
  return state.animationVideoExportInProgress;
};

export const selectDialogType = ({ state }) => {
  return state.dialogType;
};

export const selectProjectResolution = ({ state }) => {
  return state.projectResolution;
};

export const selectDefaultInitialValue = ({ state }, { property } = {}) => {
  if (!property) {
    return 0;
  }

  return getDefaultInitialValues(state)[property] ?? 0;
};

export const selectDefaultAddPropertySide = ({ state }) => {
  if (state.dialogType !== "transition") {
    return "update";
  }

  const propertyFieldConfig = getLocalizedPropertyFieldConfig(state);
  const previousOptions = getAvailableProperties(
    state,
    "prev",
    propertyFieldConfig,
  );

  return previousOptions.length > 0 ? "prev" : "next";
};

const resolveDialogSide = (state, side) => {
  if (side) {
    return side;
  }

  return state.dialogType === "transition" ? "prev" : "update";
};

const getMutableSectionProperties = (state, side) => {
  const resolvedSide = resolveDialogSide(state, side);
  if (isMaskSide(resolvedSide)) {
    const maskIndex = getMaskIndexFromSide(
      resolvedSide,
      state.selectedMaskIndex ?? 0,
    );
    const progress = getTransitionMask(state, maskIndex)?.progress;
    return progress ? { [MASK_PROGRESS_PROPERTY]: progress } : {};
  }

  return state.tweenBySection[resolvedSide];
};

const selectedKeyframeMatches = (selectedKeyframe, { side, property } = {}) => {
  return (
    selectedKeyframe?.side === side && selectedKeyframe?.property === property
  );
};

export const setSelectedKeyframe = (
  { state },
  { side, property, index } = {},
) => {
  state.selectedProperty = undefined;
  state.selectedMask = false;
  state.selectedMaskIndex = undefined;
  const resolvedSide = resolveDialogSide(state, side);
  const resolvedIndex = Number(index);
  const keyframe = getSectionProperties(state, resolvedSide)[property]
    ?.keyframes?.[resolvedIndex];

  if (!keyframe) {
    state.selectedKeyframe = undefined;
    return;
  }

  state.selectedKeyframe = {
    side: resolvedSide,
    property,
    index: resolvedIndex,
  };
};

export const selectSelectedKeyframe = ({ state }) => {
  return state.selectedKeyframe;
};

export const clearSelectedKeyframe = ({ state }, _payload = {}) => {
  state.selectedKeyframe = undefined;
};

export const setSelectedProperty = ({ state }, { side, property } = {}) => {
  const resolvedSide = resolveDialogSide(state, side);
  const selectedProperty = getSectionProperties(state, resolvedSide)[property];

  state.selectedKeyframe = undefined;
  state.selectedMask = false;
  state.selectedMaskIndex = undefined;
  state.selectedProperty = selectedProperty
    ? { side: resolvedSide, property }
    : undefined;
};

export const selectSelectedProperty = ({ state }) => {
  return state.selectedProperty;
};

const getMutableSelectedAutoTween = (state) => {
  const selectedProperty = state.selectedProperty;
  if (!selectedProperty) {
    return undefined;
  }

  const { side, property } = selectedProperty;
  return getMutableSectionProperties(state, side)[property]?.auto;
};

export const setSelectedPropertyAutoDuration = (
  { state },
  { duration } = {},
) => {
  const auto = getMutableSelectedAutoTween(state);
  const nextDuration = Number.parseInt(duration, 10);
  if (auto && Number.isFinite(nextDuration) && nextDuration >= 1) {
    auto.duration = nextDuration;
  }
};

export const setSelectedPropertyAutoEasing = ({ state }, { easing } = {}) => {
  const auto = getMutableSelectedAutoTween(state);
  if (auto) {
    auto.easing = easing;
  }
};

export const setSelectedMask = ({ state }, { index, side } = {}) => {
  state.selectedKeyframe = undefined;
  state.selectedProperty = undefined;
  const maskIndex = Number.isInteger(Number(index))
    ? Number(index)
    : getMaskIndexFromSide(side, state.selectedMaskIndex ?? 0);
  state.selectedMask =
    state.dialogType === "transition" &&
    Boolean(getTransitionMask(state, maskIndex));
  state.selectedMaskIndex = state.selectedMask ? maskIndex : undefined;
};

export const selectSelectedMask = ({ state }) => {
  return state.selectedMask;
};

export const selectSelectedMaskIndex = ({ state }) => {
  return state.selectedMaskIndex;
};

export const clearTimelineSelection = ({ state }, _payload = {}) => {
  state.selectedKeyframe = undefined;
  state.selectedProperty = undefined;
  state.selectedMask = false;
  state.selectedMaskIndex = undefined;
};

export const selectTimelineSelection = ({ state }) => {
  return (
    state.selectedKeyframe ??
    state.selectedProperty ??
    (state.selectedMask
      ? { type: "mask", index: state.selectedMaskIndex }
      : undefined)
  );
};

const getMutableSelectedKeyframe = (state) => {
  const selectedKeyframe = state.selectedKeyframe;
  if (!selectedKeyframe) {
    return undefined;
  }

  const { side, property, index } = selectedKeyframe;
  return getMutableSectionProperties(state, side)[property]?.keyframes?.[index];
};

export const selectSelectedKeyframeFormValues = ({ state }) => {
  const keyframe = getMutableSelectedKeyframe(state);
  if (!keyframe) {
    return undefined;
  }

  return {
    delay: keyframe.delay ?? 0,
    duration: keyframe.duration,
    value: keyframe.value,
    easing: keyframe.easing ?? "linear",
    relative: keyframe.relative ?? false,
  };
};

export const setSelectedKeyframeEasing = ({ state }, { easing } = {}) => {
  const keyframe = getMutableSelectedKeyframe(state);
  if (keyframe) {
    keyframe.easing = easing;
  }
};

export const setSelectedKeyframeRelative = ({ state }, { relative } = {}) => {
  const keyframe = getMutableSelectedKeyframe(state);
  if (keyframe) {
    keyframe.relative = relative;
  }
};

export const setSelectedKeyframeDuration = ({ state }, { duration } = {}) => {
  const keyframe = getMutableSelectedKeyframe(state);
  const nextDuration = Number.parseInt(duration, 10);
  if (keyframe && Number.isFinite(nextDuration) && nextDuration >= 1) {
    keyframe.duration = nextDuration;
  }
};

export const setSelectedKeyframeDelay = ({ state }, { delay } = {}) => {
  const keyframe = getMutableSelectedKeyframe(state);
  const nextDelay = Number.parseInt(delay, 10);
  if (!keyframe || !Number.isFinite(nextDelay) || nextDelay < 0) {
    return;
  }

  if (nextDelay > 0) {
    keyframe.delay = nextDelay;
  } else {
    delete keyframe.delay;
  }
};

export const setSelectedKeyframeTiming = (
  { state },
  { delay, duration, followingDelay } = {},
) => {
  const selectedKeyframe = state.selectedKeyframe;
  if (!selectedKeyframe) {
    return;
  }

  const { side, property, index } = selectedKeyframe;
  const keyframes = getMutableSectionProperties(state, side)[property]
    ?.keyframes;
  const keyframe = keyframes?.[index];
  const nextDelay = Number.parseInt(delay, 10);
  const nextDuration = Number.parseInt(duration, 10);
  if (
    !keyframe ||
    !Number.isFinite(nextDelay) ||
    nextDelay < 0 ||
    !Number.isFinite(nextDuration) ||
    nextDuration < 1
  ) {
    return;
  }

  let nextFollowingDelay;
  if (followingDelay !== undefined && keyframes[index + 1]) {
    nextFollowingDelay = Number.parseInt(followingDelay, 10);
    if (!Number.isFinite(nextFollowingDelay) || nextFollowingDelay < 0) {
      return;
    }
  }

  if (nextDelay > 0) {
    keyframe.delay = nextDelay;
  } else {
    delete keyframe.delay;
  }
  keyframe.duration = nextDuration;

  if (nextFollowingDelay === undefined) {
    return;
  }

  if (nextFollowingDelay > 0) {
    keyframes[index + 1].delay = nextFollowingDelay;
  } else {
    delete keyframes[index + 1].delay;
  }
};

export const setSelectedKeyframeValue = ({ state }, { value } = {}) => {
  const keyframe = getMutableSelectedKeyframe(state);
  const nextValue = Number(value);
  if (keyframe && Number.isFinite(nextValue)) {
    keyframe.value = nextValue;
  }
};

export const setSelectedKeyframeStartValue = (
  { state },
  { startValue } = {},
) => {
  const keyframe = getMutableSelectedKeyframe(state);
  if (!keyframe) {
    return;
  }

  if (startValue === undefined || startValue === "") {
    delete keyframe.startValue;
    return;
  }

  const nextStartValue = Number(startValue);
  if (Number.isFinite(nextStartValue)) {
    keyframe.startValue = nextStartValue;
  }
};

export const selectDefaultSelectedKeyframeStartValue = ({ state }) => {
  const selectedKeyframe = state.selectedKeyframe;
  if (!selectedKeyframe) {
    return 0;
  }

  const { side, property, index } = selectedKeyframe;
  const propertyConfig = getSectionProperties(state, side)[property];
  const selectedFrame = propertyConfig?.keyframes?.[index];
  if (!selectedFrame) {
    return 0;
  }

  if (selectedFrame.relative) {
    return 0;
  }

  let currentValue = Number(propertyConfig.initialValue);
  if (!Number.isFinite(currentValue)) {
    currentValue = getDefaultInitialValues(state)[property] ?? 0;
  }

  for (const keyframe of propertyConfig.keyframes.slice(0, index)) {
    const value = Number(keyframe.value);
    if (!Number.isFinite(value)) {
      continue;
    }
    currentValue = keyframe.relative ? currentValue + value : value;
  }

  return currentValue;
};

export const selectSelectedKeyframeDuration = ({ state }) => {
  return getMutableSelectedKeyframe(state)?.duration;
};

export const selectSelectedKeyframeDelay = ({ state }) => {
  return getMutableSelectedKeyframe(state)?.delay ?? 0;
};

export const selectSelectedKeyframeValue = ({ state }) => {
  return getMutableSelectedKeyframe(state)?.value;
};

const resolveAutoTweenConfig = (config = {}) => {
  const duration = Number(config.duration);
  const resolvedDuration =
    Number.isFinite(duration) && duration >= 1
      ? duration
      : AUTO_TWEEN_DEFAULT_DURATION;

  return {
    duration: resolvedDuration,
    easing: config.easing ?? AUTO_TWEEN_DEFAULT_EASING,
  };
};

const getTweenPropertyDuration = (config = {}) => {
  if (config?.auto) {
    return Number(config.auto.duration) || 0;
  }

  return (config?.keyframes ?? []).reduce((sum, keyframe) => {
    return (
      sum +
      Math.max(0, Number(keyframe.delay) || 0) +
      (Number(keyframe.duration) || 0)
    );
  }, 0);
};

export const selectProperties = ({ state }, { side } = {}) => {
  return getMutableSectionProperties(state, side) ?? {};
};

export const setPopover = ({ state }, { mode, x, y, payload } = {}) => {
  state.popover.mode = mode;
  state.popover.x = x;
  state.popover.y = y;
  state.popover.payload = payload ?? {};
};

export const closePopover = ({ state }, _payload = {}) => {
  state.popover.mode = "none";
  state.popover.x = undefined;
  state.popover.y = undefined;
  state.popover.payload = {};
  state.popover.formValues = {};
  state.pendingTransitionMask = undefined;
};

export const updatePopoverFormValues = ({ state }, { formValues } = {}) => {
  state.popover.formValues = formValues ?? {};
};

export const selectPopover = ({ state }) => {
  return state.popover;
};

const createTweenAnimationsForTarget = ({
  properties,
  projectResolution,
  targetId,
  animationIdPrefix,
} = {}) => {
  const animations = [];
  const defaultInitialValuesByProperty = createDefaultInitialValuesByProperty(
    createPropertyFieldConfig(projectResolution),
  );

  if (properties && Object.keys(properties).length > 0) {
    for (const [property, config] of Object.entries(properties)) {
      const tween = {};

      if (config?.auto) {
        tween[property] = {
          auto: resolveAutoTweenConfig(config.auto),
        };
      } else if (config?.keyframes?.length) {
        tween[property] = {
          keyframes: config.keyframes.map((keyframe) => {
            let value = parseFloat(keyframe.value) ?? 0;
            const nextKeyframe = {
              duration: keyframe.duration,
              value,
              easing: keyframe.easing ?? "linear",
              relative: keyframe.relative ?? false,
            };
            if (
              keyframe.startValue !== undefined &&
              keyframe.startValue !== ""
            ) {
              nextKeyframe.startValue = parseFloat(keyframe.startValue);
            }
            const delay = Math.max(0, Number(keyframe.delay) || 0);
            if (delay > 0) {
              nextKeyframe.delay = delay;
            }
            return nextKeyframe;
          }),
        };
      } else {
        continue;
      }

      if (!config?.auto) {
        const defaultValue = defaultInitialValuesByProperty[property] ?? 0;
        const initialValue =
          config.initialValue !== undefined && config.initialValue !== ""
            ? parseFloat(config.initialValue)
            : undefined;
        const processedInitialValue = Number.isNaN(initialValue)
          ? defaultValue
          : initialValue;

        if (processedInitialValue !== undefined) {
          tween[property].initialValue = processedInitialValue;
        }
      }

      animations.push({
        id: `${animationIdPrefix}-${property}`,
        targetId,
        type: "update",
        tween,
      });
    }
  }

  return animations;
};

const createTweenPayload = ({ properties, projectResolution } = {}) => {
  const tween = {};
  const defaultInitialValuesByProperty = createDefaultInitialValuesByProperty(
    createPropertyFieldConfig(projectResolution),
  );

  for (const [property, config] of Object.entries(properties ?? {})) {
    if (config?.auto) {
      tween[property] = {
        auto: resolveAutoTweenConfig(config.auto),
      };
      continue;
    }

    if (!config?.keyframes?.length) {
      continue;
    }

    tween[property] = {
      keyframes: config.keyframes.map((keyframe) => {
        const nextKeyframe = {
          duration: keyframe.duration,
          value: parseFloat(keyframe.value) ?? 0,
          easing: keyframe.easing ?? "linear",
          relative: keyframe.relative ?? false,
        };
        if (keyframe.startValue !== undefined && keyframe.startValue !== "") {
          nextKeyframe.startValue = parseFloat(keyframe.startValue);
        }
        const delay = Math.max(0, Number(keyframe.delay) || 0);
        if (delay > 0) {
          nextKeyframe.delay = delay;
        }
        return nextKeyframe;
      }),
    };

    const defaultValue = defaultInitialValuesByProperty[property] ?? 0;
    const initialValue =
      config.initialValue !== undefined && config.initialValue !== ""
        ? parseFloat(config.initialValue)
        : undefined;
    const processedInitialValue = Number.isNaN(initialValue)
      ? defaultValue
      : initialValue;

    if (processedInitialValue !== undefined) {
      tween[property].initialValue = processedInitialValue;
    }
  }

  return tween;
};

const getPropertiesDuration = (properties = {}) => {
  return Object.values(properties).reduce((maxDuration, config) => {
    const propertyDuration = getTweenPropertyDuration(config);

    return Math.max(maxDuration, propertyDuration);
  }, 0);
};

const createAnimationRenderState = ({
  dialogType,
  updateProperties,
  previousProperties,
  nextProperties,
  transitionMask,
  imagesData,
  previewImages,
  projectResolution,
  includeAnimations = true,
} = {}) => {
  if (dialogType !== "transition") {
    const animations = includeAnimations
      ? createTweenAnimationsForTarget({
          properties: updateProperties,
          projectResolution,
          targetId: PREVIEW_UPDATE_ELEMENT_ID,
          animationIdPrefix: "preview-animation",
        })
      : [];

    return {
      ...createAnimationResetState({
        dialogType,
        imagesData,
        previewImages,
        projectResolution,
      }),
      animations,
    };
  }

  const prevTween = createTweenPayload({
    properties: previousProperties,
    projectResolution,
  });
  const nextTween = createTweenPayload({
    properties: nextProperties,
    projectResolution,
  });
  const compiledMask = compileTransitionMaskForRuntime(
    transitionMask,
    imagesData?.items ?? {},
  );
  const transitionAnimation = {
    id: "preview-transition-animation",
    targetId: PREVIEW_TRANSITION_ELEMENT_ID,
    type: "transition",
  };

  if (Object.keys(prevTween).length > 0) {
    transitionAnimation.prev = {
      tween: prevTween,
    };
  }

  if (Object.keys(nextTween).length > 0) {
    transitionAnimation.next = {
      tween: nextTween,
    };
  }

  if (compiledMask) {
    transitionAnimation.mask = compiledMask;
  }

  const hasTransitionAnimation =
    includeAnimations &&
    (transitionAnimation.prev ||
      transitionAnimation.next ||
      transitionAnimation.mask);

  return {
    elements: [
      createPreviewBackgroundElement({
        imagesData,
        previewImages,
        projectResolution,
      }),
      createPreviewContentElement({
        id: PREVIEW_TRANSITION_ELEMENT_ID,
        previewSlot: getPreviewSlot(previewImages, "preview-incoming"),
        imagesData,
        projectResolution,
        fallbackFill: PREVIEW_TRANSITION_NEXT_FILL,
      }),
    ],
    animations: hasTransitionAnimation ? [transitionAnimation] : [],
  };
};

export const selectAnimationResetState = ({ state }) => {
  return createAnimationResetState({
    dialogType: state.dialogType,
    imagesData: state.imagesData,
    previewImages: state.previewImages,
    projectResolution: state.projectResolution,
  });
};

export const selectAnimationRenderStateWithAnimations = ({ state }) => {
  return createAnimationRenderState({
    dialogType: state.dialogType,
    updateProperties: state.tweenBySection.update,
    previousProperties: state.tweenBySection.prev,
    nextProperties: state.tweenBySection.next,
    transitionMask: getEffectiveTransitionMask(state),
    imagesData: state.imagesData,
    previewImages: state.previewImages,
    projectResolution: state.projectResolution,
    includeAnimations: true,
  });
};

export const selectPreviewDurationMs = ({ state }) => {
  if (state.dialogType === "transition") {
    return getTransitionTimelineDuration({
      prevProperties: state.tweenBySection.prev,
      nextProperties: state.tweenBySection.next,
      mask: getEffectiveTransitionMask(state),
    });
  }

  return getPropertiesDuration(state.tweenBySection.update);
};

export const addProperty = (
  { state },
  { side, property, initialValue, tweenMode, autoDuration, autoEasing } = {},
) => {
  const properties = getMutableSectionProperties(state, side);

  if (
    !property ||
    !properties ||
    properties[property] ||
    hasPropertyConflict(properties, property)
  ) {
    return;
  }

  if (resolveDialogSide(state, side) === "update" && tweenMode === "auto") {
    properties[property] = {
      auto: resolveAutoTweenConfig({
        duration: autoDuration,
        easing: autoEasing,
      }),
    };
    return;
  }

  properties[property] = {
    keyframes: [],
  };

  if (initialValue !== undefined && initialValue !== "") {
    properties[property].initialValue = initialValue;
  }
};

export const addKeyframe = ({ state }, keyframe = {}) => {
  if (!keyframe.property) {
    return;
  }

  const properties = getMutableSectionProperties(state, keyframe.side);
  const keyframes = properties?.[keyframe.property]?.keyframes;
  if (!Array.isArray(keyframes)) {
    return;
  }

  const index =
    keyframe.index === undefined ? keyframes.length : Number(keyframe.index);

  if (
    selectedKeyframeMatches(state.selectedKeyframe, {
      side: resolveDialogSide(state, keyframe.side),
      property: keyframe.property,
    }) &&
    state.selectedKeyframe.index >= index
  ) {
    state.selectedKeyframe.index += 1;
  }

  const nextKeyframe = {
    duration: parseInt(keyframe.duration, 10),
    easing: keyframe.easing,
    value: parseFloat(keyframe.value),
    relative: keyframe.relative,
  };
  if (keyframe.startValue !== undefined && keyframe.startValue !== "") {
    nextKeyframe.startValue = parseFloat(keyframe.startValue);
  }
  if (keyframe.delay !== undefined) {
    nextKeyframe.delay = Math.max(0, parseInt(keyframe.delay, 10) || 0);
  }

  keyframes.splice(index, 0, nextKeyframe);

  if (keyframe.followingDelay !== undefined && keyframes[index + 1]) {
    keyframes[index + 1].delay = Math.max(
      0,
      parseInt(keyframe.followingDelay, 10) || 0,
    );
  }
};

export const deleteKeyframe = ({ state }, { side, property, index } = {}) => {
  const resolvedSide = resolveDialogSide(state, side);
  const resolvedIndex = Number(index);
  const properties = getMutableSectionProperties(state, side);
  const keyframes = properties?.[property]?.keyframes;
  if (!Array.isArray(keyframes)) {
    return;
  }
  if (isMaskSide(resolvedSide) && keyframes.length <= 1) {
    return;
  }

  keyframes.splice(resolvedIndex, 1);

  if (
    selectedKeyframeMatches(state.selectedKeyframe, {
      side: resolvedSide,
      property,
    })
  ) {
    if (state.selectedKeyframe.index === resolvedIndex) {
      state.selectedKeyframe = undefined;
    } else if (state.selectedKeyframe.index > resolvedIndex) {
      state.selectedKeyframe.index -= 1;
    }
  }
};

export const deleteProperty = ({ state }, { side, property } = {}) => {
  const resolvedSide = resolveDialogSide(state, side);
  const properties = getMutableSectionProperties(state, side);

  if (!property || !properties || isMaskSide(resolvedSide)) {
    return;
  }

  delete properties[property];

  if (
    selectedKeyframeMatches(state.selectedKeyframe, {
      side: resolvedSide,
      property,
    })
  ) {
    state.selectedKeyframe = undefined;
  }

  if (
    state.selectedProperty?.side === resolveDialogSide(state, side) &&
    state.selectedProperty.property === property
  ) {
    state.selectedProperty = undefined;
  }
};

export const moveKeyframeRight = (
  { state },
  { side, property, index } = {},
) => {
  const numIndex = Number(index);
  const properties = getMutableSectionProperties(state, side);
  const keyframes = properties?.[property]?.keyframes;
  if (!Array.isArray(keyframes) || numIndex >= keyframes.length - 1) {
    return;
  }

  const current = keyframes[numIndex];
  keyframes[numIndex] = keyframes[numIndex + 1];
  keyframes[numIndex + 1] = current;

  if (
    selectedKeyframeMatches(state.selectedKeyframe, {
      side: resolveDialogSide(state, side),
      property,
    })
  ) {
    if (state.selectedKeyframe.index === numIndex) {
      state.selectedKeyframe.index += 1;
    } else if (state.selectedKeyframe.index === numIndex + 1) {
      state.selectedKeyframe.index -= 1;
    }
  }
};

export const moveKeyframeLeft = ({ state }, { side, property, index } = {}) => {
  const numIndex = Number(index);
  const properties = getMutableSectionProperties(state, side);
  const keyframes = properties?.[property]?.keyframes;
  if (!Array.isArray(keyframes) || numIndex <= 0) {
    return;
  }

  const current = keyframes[numIndex];
  keyframes[numIndex] = keyframes[numIndex - 1];
  keyframes[numIndex - 1] = current;

  if (
    selectedKeyframeMatches(state.selectedKeyframe, {
      side: resolveDialogSide(state, side),
      property,
    })
  ) {
    if (state.selectedKeyframe.index === numIndex) {
      state.selectedKeyframe.index -= 1;
    } else if (state.selectedKeyframe.index === numIndex - 1) {
      state.selectedKeyframe.index += 1;
    }
  }
};

export const updateKeyframe = (
  { state },
  { side, property, index, keyframe } = {},
) => {
  const properties = getMutableSectionProperties(state, side);
  const keyframes = properties?.[property]?.keyframes;
  if (!Array.isArray(keyframes) || !keyframe) {
    return;
  }

  const nextKeyframe = {
    ...keyframe,
    duration: parseInt(keyframe.duration, 10),
    value: parseFloat(keyframe.value),
    relative: keyframe.relative,
  };
  const currentStartValue = keyframes[index]?.startValue;
  if (keyframe.startValue === undefined && currentStartValue !== undefined) {
    nextKeyframe.startValue = currentStartValue;
  } else if (keyframe.startValue !== undefined) {
    nextKeyframe.startValue = parseFloat(keyframe.startValue);
  }
  const currentDelay = Math.max(0, Number(keyframes[index]?.delay) || 0);
  if (keyframe.delay === undefined && currentDelay > 0) {
    nextKeyframe.delay = currentDelay;
  } else {
    const nextDelay = Math.max(0, Number.parseInt(keyframe.delay, 10) || 0);
    if (nextDelay > 0) {
      nextKeyframe.delay = nextDelay;
    } else {
      delete nextKeyframe.delay;
    }
  }
  keyframes[index] = nextKeyframe;
};

export const updateInitialValue = (
  { state },
  { side, property, initialValue } = {},
) => {
  const properties = getMutableSectionProperties(state, side);

  if (!property || !properties?.[property]) {
    return;
  }

  if (initialValue === undefined || initialValue === "") {
    delete properties[property].initialValue;
    return;
  }

  properties[property].initialValue = initialValue;
};

export const updateAutoProperty = (
  { state },
  { side, property, duration, easing } = {},
) => {
  const properties = getMutableSectionProperties(state, side);

  if (!property || !properties?.[property]?.auto) {
    return;
  }

  properties[property].auto = resolveAutoTweenConfig({
    duration,
    easing,
  });
};

export const enableTransitionMask = ({ state }, _payload = {}) => {
  if (!state.transitionMask) {
    state.transitionMask = createDefaultTransitionMask();
  }
};

export const startPendingTransitionMask = ({ state }, _payload = {}) => {
  state.pendingTransitionMask = createDefaultTransitionMask();
};

export const commitPendingTransitionMask = ({ state }, _payload = {}) => {
  if (!state.pendingTransitionMask) {
    return;
  }

  state.selectedMaskIndex = appendTransitionMask(
    state,
    cloneTransitionMask(state.pendingTransitionMask),
  );
  state.selectedMask = true;
  state.pendingTransitionMask = undefined;
};

export const disableTransitionMask = ({ state }, _payload = {}) => {
  removeTransitionMaskAtIndex(state, state.selectedMaskIndex ?? 0);
  state.selectedMask = false;
  state.selectedMaskIndex = undefined;
  state.selectedKeyframe = undefined;
  state.selectedProperty = undefined;
};

export const selectTransitionMask = ({ state }) => {
  return getTransitionMask(state);
};

export const selectTransitionMasks = ({ state }) => {
  return getTransitionMasks(state);
};

export const selectHasEffectiveTransitionMask = ({ state }) => {
  return Boolean(getEffectiveTransitionMask(state));
};

export const selectMaskEditorTransitionMask = ({ state }) => {
  return getMaskEditorTransitionMask(state);
};

export const setTransitionMaskKind = ({ state }, { kind } = {}) => {
  const currentMask = getMaskEditorTransitionMask(state);
  if (!currentMask || !kind || kind !== "single") {
    return;
  }

  const nextMask = createDefaultTransitionMask();
  nextMask.softness = currentMask.softness;
  nextMask.progress = cloneMaskProgress(currentMask.progress);
  nextMask.progressDelay = currentMask.progressDelay ?? nextMask.progressDelay;
  nextMask.progressDuration = currentMask.progressDuration;
  nextMask.progressEasing = currentMask.progressEasing;
  nextMask.imageId =
    currentMask.imageId ??
    currentMask.imageIds?.find(Boolean) ??
    currentMask.items?.find((item) => item?.imageId)?.imageId;
  nextMask.channel = normalizeEditorMaskChannel(
    currentMask.channel ??
      currentMask.items?.find((item) => item?.channel)?.channel,
  );
  nextMask.invert =
    currentMask.invert ??
    currentMask.items?.find((item) => item?.invert !== undefined)?.invert ??
    nextMask.invert;

  setMaskEditorTransitionMask(state, nextMask);
};

export const setTransitionMaskInvert = ({ state }, { invert } = {}) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  transitionMask.invert = invert ?? false;
};

export const setTransitionMaskChannel = ({ state }, { channel } = {}) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask || !channel) {
    return;
  }

  transitionMask.channel = normalizeEditorMaskChannel(channel);
};

export const setTransitionMaskSample = ({ state }, { sample } = {}) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask || !sample) {
    return;
  }

  transitionMask.sample = sample;
};

export const setTransitionMaskCombine = ({ state }, { combine } = {}) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask || !combine) {
    return;
  }

  transitionMask.combine = combine;
};

export const setTransitionMaskSoftness = ({ state }, { softness } = {}) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  const numericSoftness = Number(softness);
  if (!Number.isFinite(numericSoftness) || numericSoftness < 0) {
    return;
  }

  transitionMask.softness = numericSoftness;
};

export const setTransitionMaskProgressDuration = (
  { state },
  { duration } = {},
) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  const numericDuration = Number(duration);
  if (!Number.isFinite(numericDuration) || numericDuration < 1) {
    return;
  }

  transitionMask.progressDuration = numericDuration;
  if (transitionMask.progress?.keyframes?.length === 1) {
    transitionMask.progress.keyframes[0].duration = numericDuration;
  }
};

export const setTransitionMaskProgressEasing = ({ state }, { easing } = {}) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask || !easing) {
    return;
  }

  transitionMask.progressEasing = easing;
  if (transitionMask.progress?.keyframes?.length === 1) {
    transitionMask.progress.keyframes[0].easing = easing;
  }
};

export const setTransitionMaskImage = ({ state }, { imageId } = {}) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  transitionMask.imageId = imageId;
};

export const clearTransitionMaskImage = ({ state }, _payload = {}) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  transitionMask.imageId = undefined;
};

export const addTransitionMaskSequenceImage = ({ state }, { imageId } = {}) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask || !imageId) {
    return;
  }

  transitionMask.imageIds.push(imageId);
};

export const updateTransitionMaskSequenceImage = (
  { state },
  { index, imageId } = {},
) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask || imageId === undefined) {
    return;
  }

  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex)) {
    return;
  }

  transitionMask.imageIds[numericIndex] = imageId;
};

export const removeTransitionMaskSequenceImage = (
  { state },
  { index } = {},
) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex)) {
    return;
  }

  transitionMask.imageIds.splice(numericIndex, 1);
};

export const moveTransitionMaskSequenceImageUp = (
  { state },
  { index } = {},
) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || numericIndex <= 0) {
    return;
  }

  const currentImageId = transitionMask.imageIds[numericIndex];
  transitionMask.imageIds[numericIndex] =
    transitionMask.imageIds[numericIndex - 1];
  transitionMask.imageIds[numericIndex - 1] = currentImageId;
};

export const moveTransitionMaskSequenceImageDown = (
  { state },
  { index } = {},
) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  const numericIndex = Number(index);
  if (
    !Number.isInteger(numericIndex) ||
    numericIndex >= transitionMask.imageIds.length - 1
  ) {
    return;
  }

  const currentImageId = transitionMask.imageIds[numericIndex];
  transitionMask.imageIds[numericIndex] =
    transitionMask.imageIds[numericIndex + 1];
  transitionMask.imageIds[numericIndex + 1] = currentImageId;
};

export const addTransitionMaskCompositeItem = ({ state }, { imageId } = {}) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  const item = createDefaultTransitionMaskCompositeItem();
  item.imageId = imageId;
  transitionMask.items.push(item);
};

export const updateTransitionMaskCompositeItemImage = (
  { state },
  { index, imageId } = {},
) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || !transitionMask.items[numericIndex]) {
    return;
  }

  transitionMask.items[numericIndex].imageId = imageId;
};

export const updateTransitionMaskCompositeItemChannel = (
  { state },
  { index, channel } = {},
) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask || !channel) {
    return;
  }

  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || !transitionMask.items[numericIndex]) {
    return;
  }

  transitionMask.items[numericIndex].channel = channel;
};

export const updateTransitionMaskCompositeItemInvert = (
  { state },
  { index, invert } = {},
) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || !transitionMask.items[numericIndex]) {
    return;
  }

  transitionMask.items[numericIndex].invert = invert ?? false;
};

export const removeTransitionMaskCompositeItem = (
  { state },
  { index } = {},
) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex)) {
    return;
  }

  transitionMask.items.splice(numericIndex, 1);
};

export const moveTransitionMaskCompositeItemUp = (
  { state },
  { index } = {},
) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || numericIndex <= 0) {
    return;
  }

  const currentItem = transitionMask.items[numericIndex];
  transitionMask.items[numericIndex] = transitionMask.items[numericIndex - 1];
  transitionMask.items[numericIndex - 1] = currentItem;
};

export const moveTransitionMaskCompositeItemDown = (
  { state },
  { index } = {},
) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask) {
    return;
  }

  const numericIndex = Number(index);
  if (
    !Number.isInteger(numericIndex) ||
    numericIndex >= transitionMask.items.length - 1
  ) {
    return;
  }

  const currentItem = transitionMask.items[numericIndex];
  transitionMask.items[numericIndex] = transitionMask.items[numericIndex + 1];
  transitionMask.items[numericIndex + 1] = currentItem;
};

export const showImageSelectorDialog = (
  { state },
  { target, index, selectedImageId } = {},
) => {
  state.imageSelectorDialog.open = true;
  state.imageSelectorDialog.target = target;
  state.imageSelectorDialog.index = index;
  state.imageSelectorDialog.selectedImageId = selectedImageId;
};

export const hideImageSelectorDialog = ({ state }, _payload = {}) => {
  state.imageSelectorDialog = createInitialImageSelectorDialogState();
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
};

export const setImageSelectorSelectedImageId = (
  { state },
  { imageId } = {},
) => {
  state.imageSelectorDialog.selectedImageId = imageId;
};

export const setPreviewImage = ({ state }, { target, imageId } = {}) => {
  const slotConfig = getPreviewSlotConfig(target);
  if (!slotConfig) {
    return;
  }

  if (!state.previewImages[slotConfig.field]) {
    state.previewImages[slotConfig.field] = {};
  }
  state.previewImages[slotConfig.field].imageId = imageId;
};

export const selectPreviewImageId = ({ state }, { target } = {}) => {
  if (target === "preview-target") {
    return getUpdatePreviewSlot(state.previewImages).imageId;
  }

  return getPreviewSlotImageId(state.previewImages, target);
};

export const selectPreviewData = ({ state }) => {
  const background = structuredClone(state.previewImages.background ?? {});

  if (state.dialogType === "transition") {
    return {
      background,
      outgoing: structuredClone(state.previewImages.outgoing ?? {}),
      incoming: structuredClone(state.previewImages.incoming ?? {}),
    };
  }

  return {
    background,
    target: structuredClone(getUpdatePreviewSlot(state.previewImages)),
  };
};

export const showFullImagePreview = ({ state }, { imageId } = {}) => {
  state.fullImagePreviewVisible = true;
  state.fullImagePreviewImageId = imageId;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
};

export const selectImageSelectorDialog = ({ state }) => {
  return state.imageSelectorDialog;
};

export const queueAutosave = ({ state }, _payload = {}) => {
  state.autosaveVersion += 1;
};

export const markAutosavePersisted = (
  { state },
  { version, fingerprint } = {},
) => {
  state.autosavePersistedVersion = version ?? state.autosaveVersion;
  state.autosavePersistedFingerprint = fingerprint;
};

export const setAutosaveInFlight = ({ state }, { inFlight } = {}) => {
  state.autosaveInFlight = inFlight ?? false;
};

export const selectAutosaveVersion = ({ state }) => {
  return state.autosaveVersion;
};

export const selectAutosavePersistedVersion = ({ state }) => {
  return state.autosavePersistedVersion;
};

export const selectAutosaveInFlight = ({ state }) => {
  return state.autosaveInFlight;
};

export const setAutosaveTimerId = ({ state }, { timerId } = {}) => {
  state.autosaveTimerId = timerId;
};

export const clearAutosaveTimer = ({ state }, _payload = {}) => {
  state.autosaveTimerId = undefined;
};

export const selectAutosaveTimerId = ({ state }) => {
  return state.autosaveTimerId;
};

export const setAutosavePendingSinceAt = ({ state }, { timestamp } = {}) => {
  state.autosavePendingSinceAt = timestamp;
};

export const selectAutosavePendingSinceAt = ({ state }) => {
  return state.autosavePendingSinceAt;
};

export const setLastAutosaveFlushStartedAt = (
  { state },
  { timestamp } = {},
) => {
  state.lastAutosaveFlushStartedAt = timestamp;
};

export const selectLastAutosaveFlushStartedAt = ({ state }) => {
  return state.lastAutosaveFlushStartedAt;
};

export const setAutosavePersistedFingerprint = (
  { state },
  { fingerprint } = {},
) => {
  state.autosavePersistedFingerprint = fingerprint;
};

export const selectAutosavePersistedFingerprint = ({ state }) => {
  return state.autosavePersistedFingerprint;
};

export const markAnimationPersisted = ({ state }, { animationId } = {}) => {
  state.editMode = true;
  state.editItemId = animationId;
  state.selectedItemId = animationId;
};

export const bumpPreviewRenderVersion = ({ state }, _payload = {}) => {
  state.previewRenderVersion += 1;
  state.previewPreparedVersion = undefined;
};

export const setPreviewPlaybackMode = ({ state }, { mode } = {}) => {
  state.previewPlaybackMode = mode ?? "auto";
  if (state.previewPlaybackMode !== "manual") {
    state.previewPreparedVersion = undefined;
  }
};

export const markPreviewPrepared = ({ state }, _payload = {}) => {
  state.previewPreparedVersion = state.previewRenderVersion;
};

export const selectPreviewPlaybackMode = ({ state }) => {
  return state.previewPlaybackMode;
};

export const togglePreviewLoop = ({ state }, _payload = {}) => {
  state.previewLoopEnabled = !state.previewLoopEnabled;
};

export const selectPreviewLoopEnabled = ({ state }) => {
  return state.previewLoopEnabled;
};

export const selectPreviewRenderVersion = ({ state }) => {
  return state.previewRenderVersion;
};

export const selectPreviewPreparedVersion = ({ state }) => {
  return state.previewPreparedVersion;
};

export const startPreviewPlayback = (
  { state },
  { startedAtMs, durationMs, timeMs = 0 } = {},
) => {
  state.previewPlaybackStartedAtMs = startedAtMs;
  state.previewPlaybackDurationMs = durationMs;
  state.previewPlayheadTimeMs = timeMs;
  state.previewPlayheadVisible = true;
  state.previewPlaybackFrameId = undefined;
};

export const setPreviewPlaybackRequestId = ({ state }, { requestId } = {}) => {
  state.previewPlaybackRequestId = requestId;
};

export const setPreviewPlayhead = ({ state }, { timeMs, visible } = {}) => {
  state.previewPlayheadTimeMs = timeMs;
  state.previewPlayheadVisible = visible ?? state.previewPlayheadVisible;
};

export const setPreviewPlaybackFrameId = ({ state }, { frameId } = {}) => {
  state.previewPlaybackFrameId = frameId;
};

export const stopPreviewPlayback = (
  { state },
  { preservePlayhead = false } = {},
) => {
  if (!preservePlayhead) {
    state.previewPlayheadTimeMs = undefined;
    state.previewPlayheadVisible = false;
  }
  state.previewPlaybackFrameId = undefined;
  state.previewPlaybackStartedAtMs = undefined;
  state.previewPlaybackDurationMs = undefined;
};

export const selectPreviewPlayheadTimeMs = ({ state }) => {
  return state.previewPlayheadTimeMs;
};

export const selectPreviewPlayheadVisible = ({ state }) => {
  return state.previewPlayheadVisible;
};

export const selectPreviewPlaybackFrameId = ({ state }) => {
  return state.previewPlaybackFrameId;
};

export const selectPreviewPlaybackStartedAtMs = ({ state }) => {
  return state.previewPlaybackStartedAtMs;
};

export const selectPreviewPlaybackDurationMs = ({ state }) => {
  return state.previewPlaybackDurationMs;
};

export const selectPreviewPlaying = ({ state }) => {
  return state.previewPlaybackStartedAtMs !== undefined;
};

export const selectPreviewPlaybackRequestId = ({ state }) => {
  return state.previewPlaybackRequestId;
};

export const openPreviewDialog = ({ state }, _payload = {}) => {
  state.isPreviewDialogOpen = true;
};

export const closePreviewDialog = ({ state }, _payload = {}) => {
  state.isPreviewDialogOpen = false;
};

export const openMaskRemoveConfirmDialog = ({ state }, _payload = {}) => {
  state.maskRemoveConfirmDialogOpen = true;
};

export const closeMaskRemoveConfirmDialog = ({ state }, _payload = {}) => {
  state.maskRemoveConfirmDialogOpen = false;
};

export const openPropertyRemoveConfirmDialog = ({ state }, _payload = {}) => {
  state.propertyRemoveConfirmDialogOpen = true;
};

export const closePropertyRemoveConfirmDialog = ({ state }, _payload = {}) => {
  state.propertyRemoveConfirmDialogOpen = false;
};

const buildTransitionMaskPanelDataForMask = (
  state,
  transitionMask,
  copy = {},
) => {
  if (!transitionMask) {
    return createEmptyMaskPanelData(copy);
  }

  if (!isEditableTransitionMaskKind(transitionMask.kind)) {
    return {
      ...createEmptyMaskPanelData(copy),
      enabled: true,
      unsupported: true,
      unsupportedKind: transitionMask.kind,
      unsupportedMessage: `${
        transitionMask.kind
      } ${copy.unsupportedMaskMessageSuffix ?? "masks are hidden for now"}`,
      unsupportedDescription:
        copy.unsupportedMaskDescription ??
        "This existing mask will be preserved when you save. Remove it if you want to add a new single-image mask.",
    };
  }

  const kind = transitionMask.kind;
  const channelValue = normalizeEditorMaskChannel(transitionMask.channel);
  const invertValue = transitionMask.invert ? "on" : "off";
  const progressDuration = transitionMask.progressDuration ?? 900;
  const progressEasing = transitionMask.progressEasing ?? "linear";
  const progressInitialValue = transitionMask.progress?.initialValue ?? 0;
  const singleImage = buildMaskImageItem(state, transitionMask.imageId);
  const sequenceItems = (transitionMask.imageIds ?? []).map(
    (imageId, index) => ({
      ...buildMaskImageItem(state, imageId),
      index,
      canMoveUp: index > 0,
      canMoveDown: index < transitionMask.imageIds.length - 1,
    }),
  );
  const compositeItems = (transitionMask.items ?? []).map((item, index) => ({
    ...buildMaskImageItem(state, item.imageId),
    index,
    channelValue: normalizeEditorMaskChannel(item.channel),
    invertValue: item.invert ? "on" : "off",
    canMoveUp: index > 0,
    canMoveDown: index < transitionMask.items.length - 1,
  }));
  const imageItems =
    kind === "sequence"
      ? sequenceItems
      : kind === "composite"
        ? compositeItems
        : singleImage
          ? [singleImage]
          : [];

  return {
    enabled: true,
    unsupported: false,
    unsupportedKind: undefined,
    unsupportedMessage: "",
    unsupportedDescription: "",
    kind,
    kindLabel: getOptionLabel(localizeOptions(MASK_KIND_OPTIONS, copy), kind),
    channelValue,
    channelLabel: getOptionLabel(
      localizeOptions(MASK_CHANNEL_OPTIONS, copy),
      channelValue,
    ),
    sampleValue: transitionMask.sample ?? "step",
    combineValue: transitionMask.combine ?? "max",
    invertValue,
    invertLabel: getOptionLabel(
      localizeOptions(MASK_BOOLEAN_OPTIONS, copy),
      invertValue,
    ),
    softness: transitionMask.softness ?? 0.08,
    progressInitialValue,
    progressDuration,
    progressDurationLabel: `${progressDuration} ms`,
    progressEasing,
    progressEasingLabel: getOptionLabel(
      createEasingOptions(copy),
      progressEasing,
    ),
    singleImage,
    imageItems: imageItems.filter((item) => item?.imageId),
    imageLabel:
      singleImage?.name ?? copy.noImageSelectedLabel ?? "No image selected",
    sequenceItems,
    compositeItems,
  };
};

const buildTransitionMaskPanelData = (state, copy = {}) => {
  return buildTransitionMaskPanelDataForMask(
    state,
    getTransitionMask(state),
    copy,
  );
};

const buildPreviewPanelData = (state, copy = {}) => {
  return {
    items: getPreviewImageSlotConfigs(state.dialogType).map((slot) => {
      const imageId =
        slot.target === "preview-target"
          ? getUpdatePreviewSlot(state.previewImages).imageId
          : state.previewImages[slot.field]?.imageId;
      const image = buildMaskImageItem(state, imageId);

      return {
        label: localizeText(slot.label, copy),
        target: slot.target,
        imageId,
        image,
        imageLabel: image?.name ?? copy.selectImageLabel ?? "Select image",
      };
    }),
  };
};

const buildMaskEditorPanelData = (state, copy = {}) => {
  if (state.popover.mode === "addMask") {
    return buildTransitionMaskPanelDataForMask(
      state,
      state.pendingTransitionMask,
      copy,
    );
  }

  return buildTransitionMaskPanelData(state, copy);
};

const buildSelectedKeyframePanelData = (
  state,
  propertyFieldConfig,
  copy = {},
) => {
  const selectedKeyframe = state.selectedKeyframe;
  if (!selectedKeyframe) {
    return undefined;
  }

  const { side, property, index } = selectedKeyframe;
  const keyframe = getSectionProperties(state, side)[property]?.keyframes?.[
    index
  ];
  if (!keyframe) {
    return undefined;
  }

  const timelineLabel =
    side === "prev"
      ? (copy.outTimelineLabel ?? "Outgoing")
      : side === "next"
        ? (copy.inTimelineLabel ?? "Incoming")
        : isMaskSide(side)
          ? (copy.maskTitle ?? "Mask")
          : (copy.updateType ?? "Update");
  const easing = keyframe.easing ?? "linear";
  const valueSlider = propertyFieldConfig[property]?.slider;
  const hasStartValue =
    keyframe.startValue !== undefined && keyframe.startValue !== "";
  const fields = [
    {
      type: "text",
      label: copy.timelineLabel ?? "Timeline",
      value: timelineLabel,
    },
    {
      type: "text",
      label: copy.propertyLabel ?? "Property",
      value: propertyFieldConfig[property]?.label ?? property,
    },
    {
      type: "slot",
      label: copy.delayMsLabel ?? "Delay (ms)",
      slot: "keyframe-delay",
    },
    {
      type: "slot",
      label: copy.durationMsLabel ?? "Duration (ms)",
      slot: "keyframe-duration",
    },
    {
      type: "slot",
      label: copy.easingLabel ?? "Easing",
      slot: "keyframe-easing",
    },
  ];
  if (hasStartValue) {
    fields.push({
      type: "slot",
      slot: "keyframe-start-value",
    });
  }
  fields.push(
    {
      type: "slot",
      label: copy.valueLabel ?? "Value",
      slot: "keyframe-value",
    },
    {
      type: "slot",
      label: copy.valueTypeLabel ?? "Value type",
      slot: "keyframe-value-type",
    },
  );

  return {
    id: `${side}:${property}:${index}`,
    editor: {
      delay: keyframe.delay ?? 0,
      delayLabel: copy.delayMsLabel ?? "Delay (ms)",
      duration: keyframe.duration,
      durationLabel: copy.durationMsLabel ?? "Duration (ms)",
      easing,
      easingOptions: createEasingOptions(copy),
      relative: keyframe.relative ?? false,
      relativeOptions: [
        { label: copy.absoluteValueType ?? "Absolute", value: false },
        { label: copy.relativeValueType ?? "Relative", value: true },
      ],
      hasStartValue,
      startValue: keyframe.startValue,
      startValueLabel: copy.startValueLabel ?? "Start value",
      value: keyframe.value,
      valueLabel: copy.valueLabel ?? "Value",
      valueStep: propertyFieldConfig[property]?.input?.step ?? "any",
      valueSlider,
      valueUsesPopover: Boolean(propertyFieldConfig[property]?.input),
    },
    fields,
  };
};

const buildSelectedPropertyPanelData = (
  state,
  propertyFieldConfig,
  copy = {},
) => {
  const selectedProperty = state.selectedProperty;
  if (!selectedProperty) {
    return undefined;
  }

  const { side, property } = selectedProperty;
  const propertyConfig = getSectionProperties(state, side)[property];
  if (!propertyConfig) {
    return undefined;
  }

  const timelineLabel =
    side === "prev"
      ? (copy.outTimelineLabel ?? "Outgoing")
      : side === "next"
        ? (copy.inTimelineLabel ?? "Incoming")
        : isMaskSide(side)
          ? (copy.maskTitle ?? "Mask")
          : (copy.updateType ?? "Update");
  const hasInitialValue =
    propertyConfig.initialValue !== undefined &&
    propertyConfig.initialValue !== "";
  const autoConfig = propertyConfig.auto;
  const initialValue = hasInitialValue
    ? propertyConfig.initialValue
    : (propertyFieldConfig[property]?.defaultValue ?? 0);
  const initialValueSlider = propertyFieldConfig[property]?.slider;
  const fields = [
    {
      type: "text",
      label: copy.timelineLabel ?? "Timeline",
      value: timelineLabel,
    },
    {
      type: "text",
      label: copy.propertyLabel ?? "Property",
      value: propertyFieldConfig[property]?.label ?? property,
    },
  ];

  if (autoConfig) {
    fields.push(
      {
        type: "slot",
        label: copy.durationMsLabel ?? "Duration (ms)",
        slot: "property-auto-duration",
      },
      {
        type: "slot",
        label: copy.easingLabel ?? "Easing",
        slot: "property-auto-easing",
      },
    );
  } else {
    fields.push({
      type: "slot",
      label: copy.initialValueLabel ?? "Initial value",
      slot: "property-initial-value",
    });
  }

  return {
    id: `${side}:${property}`,
    editor: autoConfig
      ? {
          auto: true,
          duration: autoConfig.duration,
          durationLabel: copy.durationMsLabel ?? "Duration (ms)",
          easing: autoConfig.easing ?? "linear",
          easingOptions: createEasingOptions(copy),
        }
      : {
          hasInitialValue,
          initialValue,
          initialValueLabel: copy.initialValueLabel ?? "Initial value",
          initialValueSlider,
          initialValueStep: propertyFieldConfig[property]?.input?.step ?? "any",
          initialValueUsesPopover: Boolean(
            propertyFieldConfig[property]?.input,
          ),
        },
    fields,
  };
};

const createTimelineMetrics = ({ state, activeTimelineDuration }) => {
  const timelinePixelsPerSecond = Math.round(
    TIMELINE_BASE_PIXELS_PER_SECOND * state.timelineZoom,
  );
  const viewportTimelineDuration =
    state.timelineViewportWidth > TIMELINE_PROPERTY_COLUMN_WIDTH
      ? ((state.timelineViewportWidth - TIMELINE_PROPERTY_COLUMN_WIDTH) /
          timelinePixelsPerSecond) *
        1000
      : 0;
  const timelineDisplayDuration = Math.max(
    TIMELINE_MIN_DISPLAY_DURATION_MS,
    activeTimelineDuration,
    viewportTimelineDuration,
    state.timelineDisplayDurationOverrideMs ?? 0,
  );
  const timelineCanvasWidth = Math.round(
    TIMELINE_PROPERTY_COLUMN_WIDTH +
      (timelineDisplayDuration / 1000) * timelinePixelsPerSecond,
  );
  const timelinePlayheadTimeMs = Number(state.previewPlayheadTimeMs);
  const timelinePlayheadRatio =
    timelineDisplayDuration > 0 && Number.isFinite(timelinePlayheadTimeMs)
      ? Math.min(
          1,
          Math.max(0, timelinePlayheadTimeMs / timelineDisplayDuration),
        )
      : 0;
  const timelinePlayheadViewportX =
    TIMELINE_PROPERTY_COLUMN_WIDTH +
    (timelineCanvasWidth - TIMELINE_PROPERTY_COLUMN_WIDTH) *
      timelinePlayheadRatio -
    state.timelineScrollLeft;
  const timelinePlayheadWithinViewport =
    state.timelineViewportWidth === undefined ||
    (timelinePlayheadViewportX >= TIMELINE_PROPERTY_COLUMN_WIDTH &&
      timelinePlayheadViewportX <= state.timelineViewportWidth);

  return {
    timelineCanvasWidth,
    timelineDisplayDuration,
    timelinePixelsPerSecond,
    timelinePlayheadRatio,
    timelinePlayheadWithinViewport,
  };
};

const getActiveTimelineDuration = (state) => {
  const preview = state.timelineUsedDurationPreview;
  if (state.dialogType !== "transition") {
    return preview?.side === "update"
      ? preview.duration
      : getPropertiesDuration(getSectionProperties(state, "update"));
  }

  const previousDuration =
    preview?.side === "prev"
      ? preview.duration
      : getPropertiesDuration(getSectionProperties(state, "prev"));
  const nextDuration =
    preview?.side === "next"
      ? preview.duration
      : getPropertiesDuration(getSectionProperties(state, "next"));
  const maskDuration = getTransitionMasks(state).reduce(
    (maxDuration, mask, index) => {
      const side = createMaskSide(index);
      if (preview?.side !== side) {
        return Math.max(maxDuration, getTransitionTimelineDuration({ mask }));
      }

      const committedProgressDuration = getPropertiesDuration(
        getSectionProperties(state, side),
      );
      const committedMaskDuration = getTransitionTimelineDuration({ mask });
      const previewMaskDuration =
        committedMaskDuration - committedProgressDuration + preview.duration;
      return Math.max(maxDuration, previewMaskDuration);
    },
    0,
  );

  return Math.max(previousDuration, nextDuration, maskDuration);
};

export const selectTimelinePlayheadVisible = ({ state }) => {
  const activeTimelineDuration = getActiveTimelineDuration(state);
  const { timelinePlayheadWithinViewport } = createTimelineMetrics({
    state,
    activeTimelineDuration,
  });

  return (
    state.previewPlayheadVisible &&
    activeTimelineDuration > 0 &&
    timelinePlayheadWithinViewport
  );
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectAnimationEditorPageCopy(i18n);
  const previewPlaying = selectPreviewPlaying({ state });
  const propertyFieldConfig = getLocalizedPropertyFieldConfig(state, copy);
  const defaultInitialValuesByProperty = getDefaultInitialValues(state);
  const dialogType = state.dialogType;
  const updateProperties = getSectionProperties(state, "update");
  const previousProperties = getSectionProperties(state, "prev");
  const nextProperties = getSectionProperties(state, "next");
  const activeTimelineDuration = getActiveTimelineDuration(state);
  const transitionTimelineDuration =
    dialogType === "transition" ? activeTimelineDuration : 0;
  const {
    timelineCanvasWidth,
    timelineDisplayDuration,
    timelinePixelsPerSecond,
    timelinePlayheadRatio,
    timelinePlayheadWithinViewport,
  } = createTimelineMetrics({ state, activeTimelineDuration });
  const timelinePlayheadVisible =
    state.previewPlayheadVisible &&
    activeTimelineDuration > 0 &&
    timelinePlayheadWithinViewport;
  const timelineUsedAreaRatio =
    timelineDisplayDuration > 0
      ? Math.min(1, activeTimelineDuration / timelineDisplayDuration)
      : 0;
  const timelineUsedAreaStyle = `top: 0; bottom: 0; left: 104px; width: calc((100% - 104px) * ${timelineUsedAreaRatio}); pointer-events: none; z-index: 0;`;
  const timelinePlayheadStyle = timelinePlayheadVisible
    ? `top: 10px; bottom: 0; left: calc(104px + (100% - 104px) * ${timelinePlayheadRatio}); width: 1px; transform: translateX(-0.5px); pointer-events: none; z-index: 8;`
    : "";
  const updateTimelineDefaultValues = createTimelineDefaultValues(
    UPDATE_PROPERTY_KEYS,
    propertyFieldConfig,
  );
  const transitionTimelineDefaultValues = createTimelineDefaultValues(
    TRANSITION_PROPERTY_KEYS,
    propertyFieldConfig,
  );
  const updateAddPropertyOptions = getAvailableProperties(
    state,
    "update",
    propertyFieldConfig,
  );
  const previousAddPropertyOptions = getAvailableProperties(
    state,
    "prev",
    propertyFieldConfig,
  );
  const nextAddPropertyOptions = getAvailableProperties(
    state,
    "next",
    propertyFieldConfig,
  );
  const transitionAddPropertySideOptions =
    createTransitionAddPropertySideMenuItems({
      previousAvailable: previousAddPropertyOptions.length > 0,
      nextAvailable: nextAddPropertyOptions.length > 0,
      maskAvailable: true,
      copy,
    });
  const transitionPropertySideOptions =
    createTransitionAddPropertySideMenuItems({
      previousAvailable: previousAddPropertyOptions.length > 0,
      nextAvailable: nextAddPropertyOptions.length > 0,
      copy,
    });
  const defaultTransitionAddPropertySide =
    previousAddPropertyOptions.length > 0 ? "prev" : "next";
  const addPropertySide =
    state.popover.formValues.side ??
    state.popover.payload?.side ??
    (dialogType === "transition" ? defaultTransitionAddPropertySide : "update");
  const addPropertyOptions = getAvailableProperties(
    state,
    addPropertySide,
    propertyFieldConfig,
  );
  const transitionMaskPanel = buildTransitionMaskPanelData(state, copy);
  const maskEditorPanel = buildMaskEditorPanelData(state, copy);
  const selectedMask = state.selectedMask && transitionMaskPanel.enabled;
  const maskTimelineRows = getTransitionMasks(state).map(
    (transitionMask, index) => {
      const side = createMaskSide(index);
      const panel = buildTransitionMaskPanelDataForMask(
        state,
        transitionMask,
        copy,
      );
      const progress = getSectionProperties(state, side)[
        MASK_PROGRESS_PROPERTY
      ];
      const rowSelected =
        state.selectedMask && state.selectedMaskIndex === index;
      const image = panel.singleImage ?? panel.imageItems[0] ?? {};
      const imageBorderColor = rowSelected ? "pr" : "bo";
      const label = copy.maskTitle ?? "Mask";
      const editable = !panel.unsupported && Boolean(progress);
      const properties = editable
        ? {
            [MASK_PROGRESS_PROPERTY]: {
              ...progress,
              selected: rowSelected,
              thumbnail: true,
              thumbnailBorderColor: imageBorderColor,
              thumbnailFileId: image.previewFileId,
              thumbnailName: image.name ?? label,
            },
          }
        : {};

      return {
        editable,
        image,
        imageBorderColor,
        index,
        label,
        properties,
        selected: rowSelected,
        side,
      };
    },
  );
  const maskTimelineRow = maskTimelineRows[0];
  const maskTimelineProperties = maskTimelineRow?.properties ?? {};
  const previousTimelineVisible = Object.keys(previousProperties).length > 0;
  const nextTimelineVisible = Object.keys(nextProperties).length > 0;
  const maskTimelineVisible = maskTimelineRows.length > 0;
  const activeTimelineEmpty =
    dialogType === "transition"
      ? !previousTimelineVisible && !nextTimelineVisible && !maskTimelineVisible
      : Object.keys(updateProperties).length === 0;
  const previewPanel = buildPreviewPanelData(state, copy);
  const selectedKeyframePanel = buildSelectedKeyframePanelData(
    state,
    propertyFieldConfig,
    copy,
  );
  const selectedPropertyPanel = buildSelectedPropertyPanelData(
    state,
    propertyFieldConfig,
    copy,
  );
  const selectedKeyframeAddMenuItems =
    selectedKeyframePanel?.editor && !selectedKeyframePanel.editor.hasStartValue
      ? [
          {
            label: copy.startValueLabel ?? "Start value",
            type: "item",
            value: "start-value",
          },
        ]
      : [];
  const selectedKeyframeCanDelete = (() => {
    if (!state.selectedKeyframe) {
      return false;
    }

    const { side, property } = state.selectedKeyframe;
    const keyframes =
      getSectionProperties(state, side)[property]?.keyframes ?? [];
    return !isMaskSide(side) || keyframes.length > 1;
  })();
  const imageFolderItems = toFlatItems(state.imagesData).filter(
    (item) => item.type === "folder",
  );

  const keyframeDropdownItems = (() => {
    if (state.popover.mode !== "keyframeMenu") {
      const propertyMenuItems = localizeMenuItems(
        propertyNameDropdownItems,
        copy,
      );
      if (state.popover.mode !== "propertyNameMenu") {
        return propertyMenuItems;
      }

      const { side, property } = state.popover.payload;
      const propertyConfig = getSectionProperties(state, side)[property];
      return propertyConfig?.auto
        ? propertyMenuItems.filter(
            (item) => item.value !== "edit-initial-value",
          )
        : propertyMenuItems;
    }

    const { side, property, index } = state.popover.payload;
    const keyframes =
      getSectionProperties(state, side)[property]?.keyframes ?? [];
    const currentIndex = Number(index);
    const isFirstKeyframe = currentIndex === 0;
    const isLastKeyframe = currentIndex === keyframes.length - 1;

    return localizeMenuItems(baseKeyframeDropdownItems, copy).filter((item) => {
      if (
        item.value === "delete-keyframe" &&
        isMaskSide(side) &&
        keyframes.length <= 1
      ) {
        return false;
      }
      if (item.value === "move-left" && isFirstKeyframe) {
        return false;
      }
      if (item.value === "move-right" && isLastKeyframe) {
        return false;
      }
      return true;
    });
  })();

  let addPropertyContext = {};
  let addPropertyFormDefaultValues = {
    useInitialValue: false,
    tweenMode: "keyframes",
    duration: AUTO_TWEEN_DEFAULT_DURATION,
    easing: AUTO_TWEEN_DEFAULT_EASING,
  };
  let editKeyframeDefaultValues = {};
  let editAutoDefaultValues = {};
  let editInitialValueDefaultValues = {};
  let editInitialValueContext = {};
  let addPropertySelectedProperty = addPropertyOptions[0]?.value;

  if (dialogType === "transition") {
    addPropertyFormDefaultValues.side = addPropertySide;
  }

  if (state.popover.mode === "addProperty") {
    addPropertySelectedProperty =
      state.popover.formValues.property ?? addPropertySelectedProperty;
  }

  if (addPropertySelectedProperty) {
    addPropertyFormDefaultValues.property = addPropertySelectedProperty;
    addPropertyFormDefaultValues.initialValue =
      defaultInitialValuesByProperty[addPropertySelectedProperty] ?? 0;
  }

  if (state.popover.mode === "addProperty") {
    addPropertyFormDefaultValues = {
      ...addPropertyFormDefaultValues,
      ...state.popover.formValues,
    };

    if (
      addPropertySelectedProperty &&
      (addPropertyFormDefaultValues.initialValue === undefined ||
        addPropertyFormDefaultValues.initialValue === "")
    ) {
      addPropertyFormDefaultValues.initialValue =
        defaultInitialValuesByProperty[addPropertySelectedProperty] ?? 0;
    }

    addPropertyContext = {
      ...addPropertyFormDefaultValues,
    };
  }
  const addPropertyFormKey = [
    state.popover.mode === "addProperty" ? "open" : "closed",
    addPropertySide,
    addPropertySelectedProperty ?? "",
    addPropertyFormDefaultValues.tweenMode ?? "",
    addPropertyFormDefaultValues.useInitialValue ? "initial" : "current",
  ].join(":");

  if (state.popover.mode === "editKeyframe") {
    const { side, property, index } = state.popover.payload;
    const currentKeyframe = getSectionProperties(state, side)[property]
      ?.keyframes?.[index];

    if (currentKeyframe) {
      editKeyframeDefaultValues = {
        delay: currentKeyframe.delay ?? 0,
        duration: currentKeyframe.duration,
        value: currentKeyframe.value,
        easing: currentKeyframe.easing,
        relative: currentKeyframe.relative,
      };
    }
  }

  if (state.popover.mode === "editAuto") {
    const { side, property } = state.popover.payload;
    const currentAuto = getSectionProperties(state, side)[property]?.auto;

    if (currentAuto) {
      editAutoDefaultValues = {
        duration: currentAuto.duration ?? AUTO_TWEEN_DEFAULT_DURATION,
        easing: currentAuto.easing ?? AUTO_TWEEN_DEFAULT_EASING,
      };
    }
  }

  if (state.popover.mode === "editInitialValue") {
    const { side, property } = state.popover.payload;
    const currentInitialValue = getSectionProperties(state, side)[property]
      ?.initialValue;
    const defaultValue = defaultInitialValuesByProperty[property] ?? 0;
    const isUsingDefault =
      currentInitialValue === undefined || currentInitialValue === "";

    editInitialValueDefaultValues = {
      initialValue: isUsingDefault ? defaultValue : currentInitialValue,
      valueSource: isUsingDefault ? "default" : "custom",
    };

    editInitialValueContext = {
      ...editInitialValueDefaultValues,
      ...state.popover.formValues,
    };
  }

  const showAddPropertyPopover =
    !state.isTouchMode && state.popover.mode === "addProperty";
  const showAddKeyframePopover =
    !state.isTouchMode && state.popover.mode === "addKeyframe";
  const showAddPropertyDialog =
    state.isTouchMode && state.popover.mode === "addProperty";
  const showAddKeyframeDialog =
    state.isTouchMode && state.popover.mode === "addKeyframe";
  const showEditKeyframeDialog = state.popover.mode === "editKeyframe";
  const showEditAutoDialog =
    state.isTouchMode && state.popover.mode === "editAuto";
  const showSelectedMaskSoftnessPopover =
    state.popover.mode === "editSelectedMaskSoftness";
  const showSelectedMaskInitialValuePopover =
    state.popover.mode === "editSelectedMaskInitialValue";

  return {
    resourceCategory: ANIMATION_RESOURCE_CATEGORY,
    selectedResourceId: ANIMATION_SELECTED_RESOURCE_ID,
    dialogType,
    dialogDefaultValues: state.dialogDefaultValues,
    animationName: state.dialogDefaultValues?.name ?? "",
    previewPlayheadTimeMs: state.previewPlayheadTimeMs,
    previewPlayheadVisible: state.previewPlayheadVisible,
    previewLoopEnabled: state.previewLoopEnabled,
    previewLoopButtonVariant: state.previewLoopEnabled ? "pr" : "ol",
    timelinePlayheadVisible,
    timelinePlayheadStyle,
    timelineUsedAreaStyle,
    timelineZoom: state.timelineZoom,
    timelineZoomMin: TIMELINE_ZOOM_MIN,
    timelineZoomMax: TIMELINE_ZOOM_MAX,
    timelineZoomStep: TIMELINE_ZOOM_STEP,
    timelinePixelsPerSecond,
    timelineCanvasStyle: `width: ${timelineCanvasWidth}px; min-width: 100%; flex-shrink: 0;${state.timelinePanMode ? " pointer-events: none; user-select: none;" : ""}`,
    timelinePanCursor: state.timelinePan
      ? "grabbing"
      : state.timelinePanMode
        ? "grab"
        : "default",
    timelineDisplayDuration,
    activeTimelineDuration,
    dialogTypeLabel:
      dialogType === "transition"
        ? (copy.transitionType ?? "Transition")
        : (copy.updateType ?? "Update"),
    transitionTimelineDuration,
    canvasAspectRatio: formatProjectResolutionAspectRatio(
      state.projectResolution,
    ),
    previewCanvasMaxWidth: formatHalfViewportCanvasMaxWidth(
      state.projectResolution,
    ),
    updateProperties,
    previousProperties,
    nextProperties,
    previousTimelineVisible,
    nextTimelineVisible,
    selectedKeyframe: state.selectedKeyframe,
    selectedProperty: state.selectedProperty,
    selectedKeyframeDetailId: selectedKeyframePanel?.id,
    selectedKeyframeDetailFields: selectedKeyframePanel?.fields ?? [],
    selectedKeyframeEditor: selectedKeyframePanel?.editor,
    selectedKeyframeAddMenuItems,
    selectedKeyframeCanDelete,
    selectedPropertyDetailId: selectedPropertyPanel?.id,
    selectedPropertyDetailFields: selectedPropertyPanel?.fields ?? [],
    selectedPropertyEditor: selectedPropertyPanel?.editor,
    selectedMask,
    maskTimelineRow,
    maskTimelineRows,
    maskTimelineVisible,
    activeTimelineEmpty,
    maskTimelineProperties,
    maskTimelineDefaultValues: { [MASK_PROGRESS_PROPERTY]: 0 },
    updateTimelineDefaultValues,
    transitionTimelineDefaultValues,
    addPropertyForm: createAddPropertyForm(
      addPropertyOptions,
      propertyFieldConfig,
      {
        side: addPropertySide,
        property: addPropertySelectedProperty,
        sideOptions:
          state.isTouchMode && dialogType === "transition"
            ? transitionPropertySideOptions
            : [],
      },
      copy,
    ),
    addPropertyFormKey,
    addPropertyContext,
    addKeyframeForm: createAddKeyframeForm(
      state.popover.payload?.property,
      propertyFieldConfig,
      {},
      copy,
    ),
    addKeyframeDefaultValues,
    updateKeyframeForm: createUpdateKeyframeForm(
      state.popover.payload?.property,
      propertyFieldConfig,
      {},
      copy,
    ),
    editAutoForm: createEditAutoTweenForm(copy),
    editInitialValueForm: localizeForm(editInitialValueForm, copy),
    editInitialValueContext,
    editKeyframeDefaultValues,
    editAutoDefaultValues,
    editInitialValueDefaultValues,
    keyframeDropdownItems,
    transitionMaskPanel,
    maskEditorPanel,
    previewPanel,
    maskKindOptions: localizeOptions(MASK_KIND_OPTIONS, copy),
    maskChannelOptions: localizeOptions(MASK_CHANNEL_OPTIONS, copy),
    maskSampleOptions: localizeOptions(MASK_SAMPLE_OPTIONS, copy),
    maskCombineOptions: localizeOptions(MASK_COMBINE_OPTIONS, copy),
    maskBooleanOptions: localizeOptions(MASK_BOOLEAN_OPTIONS, copy),
    maskProgressEasingOptions: createEasingOptions(copy),
    updateAddPropertyButtonVisible: updateAddPropertyOptions.length > 0,
    transitionAddPropertyButtonVisible:
      transitionAddPropertySideOptions.length > 0,
    addPropertySideMenuItems: transitionAddPropertySideOptions,
    popover: {
      ...state.popover,
      popoverIsOpen:
        state.popover.mode === "editInitialValue" ||
        showAddPropertyPopover ||
        showAddKeyframePopover,
      maskDialogIsOpen: ["addMask", "editMask"].includes(state.popover.mode),
      dropdownMenuIsOpen: ["keyframeMenu", "propertyNameMenu"].includes(
        state.popover.mode,
      ),
      addPropertySideMenuIsOpen: state.popover.mode === "addPropertySideMenu",
      selectedKeyframeAddMenuIsOpen:
        state.popover.mode === "selectedKeyframeAddMenu",
    },
    addPropertyFormDefaultValues,
    imageSelectorDialog: state.imageSelectorDialog,
    imageFolderItems,
    showImageSelectorFileExplorer: !state.isTouchMode,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewImageId: state.fullImagePreviewImageId,
    isPreviewDialogOpen: state.isPreviewDialogOpen,
    maskRemoveConfirmDialogOpen: state.maskRemoveConfirmDialogOpen,
    propertyRemoveConfirmDialogOpen: state.propertyRemoveConfirmDialogOpen,
    showRightPanel: !state.isTouchMode,
    selectedEditorTab: state.selectedEditorTab,
    editorTabs: [
      {
        id: DEFAULT_EDITOR_TAB,
        label: copy.timelineLabel ?? "Timeline",
        panelId: "animationTweenPanel",
      },
      {
        id: "preview",
        label: copy.previewTitle ?? "Preview",
        panelId: "animationPreviewPanel",
      },
    ].map((item, index) => {
      const selected = item.id === state.selectedEditorTab;
      return {
        ...item,
        index,
        selected,
        tabIndex: selected ? 0 : -1,
        backgroundColor: selected ? "ac" : "",
        borderColor: selected ? "" : "tr",
        textColor: selected ? "fg" : "mu-fg",
      };
    }),
    editorPanelsLabel: copy.editorPanelsLabel ?? "Animation editor panels",
    showAddPropertyPopover,
    showAddKeyframePopover,
    showAddPropertyDialog,
    showAddKeyframeDialog,
    showEditKeyframeDialog,
    showEditAutoDialog,
    selectedMaskNumberPopoverIsOpen:
      showSelectedMaskInitialValuePopover || showSelectedMaskSoftnessPopover,
    showSelectedMaskInitialValuePopover,
    showSelectedMaskSoftnessPopover,
    addMaskDisabled: !isTransitionMaskComplete(
      getMaskEditorTransitionMask(state),
    ),
    addButton: copy.addButton ?? "Add",
    addPropertyButtonLabel: copy.addPropertyButton ?? "Add Property",
    addMaskButton: copy.addMaskButton ?? "Add Mask",
    addMaskTitle: copy.addMaskTitle ?? "Add Mask",
    cancelButton: copy.cancelButton ?? "Cancel",
    channelLabel: copy.channelLabel ?? "Channel",
    doneButton: copy.doneButton ?? "Done",
    deletePropertyButtonLabel:
      copy.deletePropertyButtonLabel ?? "Delete property",
    deleteKeyframeButtonLabel: copy.deleteKeyframeMenuItem ?? "Delete keyframe",
    propertyRemoveConfirmMessage:
      copy.propertyRemoveConfirmMessage ??
      "Delete this animation property? This cannot be undone.",
    propertyRemoveConfirmTitle:
      copy.propertyRemoveConfirmTitle ?? "Delete Property",
    editPreviewButton: copy.editPreviewButton ?? "Edit Preview",
    editKeyframeButtonLabel: copy.editKeyframeMenuItem ?? "Edit keyframe",
    imageLabel: copy.imageLabel ?? "Image",
    initialValueLabel: copy.initialValueLabel ?? "Initial value",
    removeStartValueButtonLabel:
      copy.removeStartValueButtonLabel ?? "Remove start value",
    useDefaultValueButtonLabel:
      copy.useDefaultValueSource ?? "Use Default Value",
    inTimelineLabel: copy.inTimelineLabel ?? "Incoming",
    invertLabel: copy.invertLabel ?? "Invert",
    detailsPanelTitle: selectedMask
      ? (copy.maskTitle ?? "Mask")
      : selectedPropertyPanel
        ? (copy.propertyDetailsTitle ?? "Property")
        : selectedKeyframePanel
          ? (copy.keyframeDetailsTitle ?? "Keyframe Details")
          : undefined,
    kindLabel: copy.kindLabel ?? "Kind",
    loopPreviewLabel: copy.loopPreviewLabel ?? "Loop preview",
    maskRemoveConfirmMessage:
      copy.maskRemoveConfirmMessage ??
      "Remove this transition mask? This cannot be undone.",
    maskRemoveConfirmTitle: copy.maskRemoveConfirmTitle ?? "Remove Mask",
    maskTitle: copy.maskTitle ?? "Mask",
    noMaskAvailable: copy.noMaskAvailable ?? "No mask available.",
    noPreviewLabel: copy.noPreviewLabel ?? "No preview",
    noSelectionLabel: copy.noSelectionLabel ?? "No selection",
    okButton: copy.okButton ?? "OK",
    outTimelineLabel: copy.outTimelineLabel ?? "Outgoing",
    playButton: previewPlaying
      ? (copy.pauseButton ?? "Pause")
      : (copy.playButton ?? "Play"),
    previewPlaying,
    previewTitle: copy.previewTitle ?? "Preview",
    progressDurationLabel:
      copy.progressDurationLabel ?? "Progress Duration (ms)",
    progressEasingLabel: copy.progressEasingLabel ?? "Progress Easing",
    removeButton: copy.removeMenuItem ?? "Remove",
    saveButton: copy.saveButton ?? "Save",
    selectImageLabel: copy.selectImageLabel ?? "Select image",
    softnessLabel: copy.softnessLabel ?? "Softness",
    timelineZoomLabel: copy.timelineZoomLabel ?? "Timeline zoom",
    timelineZoomInLabel: copy.timelineZoomInLabel ?? "Zoom timeline in",
    timelineZoomOutLabel: copy.timelineZoomOutLabel ?? "Zoom timeline out",
    tweenPropertiesTitle: copy.tweenPropertiesTitle ?? "Tween Properties",
  };
};
