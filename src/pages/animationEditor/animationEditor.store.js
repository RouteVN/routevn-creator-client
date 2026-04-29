import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import { toFlatItems } from "../../internal/project/tree.js";
import {
  compileTransitionMaskForRuntime,
  createDefaultTransitionMask,
  createDefaultTransitionMaskCompositeItem,
  isEditableTransitionMaskKind,
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
  TRANSITION_PROPERTY_KEYS,
  UPDATE_PROPERTY_KEYS,
} from "./animationEditor.constants.js";

const createPropertyFieldConfig = (
  projectResolution = DEFAULT_PROJECT_RESOLUTION,
) => {
  const { width, height } = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );

  return {
    alpha: {
      label: "Alpha",
      defaultValue: 1,
      slider: {
        min: 0,
        max: 1,
        step: 0.01,
      },
    },
    x: {
      label: "Position X",
      defaultValue: width / 2,
      slider: {
        min: 0,
        max: width,
      },
    },
    y: {
      label: "Position Y",
      defaultValue: height / 2,
      slider: {
        min: 0,
        max: height,
      },
    },
    scaleX: {
      label: "Scale X",
      defaultValue: 1,
      slider: {
        min: 0.1,
        max: 5,
        step: 0.1,
      },
    },
    scaleY: {
      label: "Scale Y",
      defaultValue: 1,
      slider: {
        min: 0.1,
        max: 5,
        step: 0.1,
      },
    },
    translateX: {
      label: "Translate X",
      defaultValue: 0,
      slider: {
        min: -2,
        max: 2,
        step: 0.05,
      },
      tooltip: {
        content:
          "Uses viewport-width units. 1 moves by one full screen width, -1 moves by one full screen width to the left.",
      },
    },
    translateY: {
      label: "Translate Y",
      defaultValue: 0,
      slider: {
        min: -2,
        max: 2,
        step: 0.05,
      },
      tooltip: {
        content:
          "Uses viewport-height units. 1 moves by one full screen height, -1 moves by one full screen height upward.",
      },
    },
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

const PREVIEW_IMAGE_SLOT_CONFIGS = Object.freeze([
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
});

const getPreviewSlotConfig = (target) => {
  return PREVIEW_IMAGE_SLOT_CONFIGS.find((slot) => slot.target === target);
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
        previewSlot: getPreviewSlot(previewImages, "preview-incoming"),
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

const EASING_OPTIONS = Object.freeze(
  SUPPORTED_EASING_NAMES.map((easingName) => ({
    label: formatEasingLabel(easingName),
    value: easingName,
  })),
);

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

const createAutoTweenFields = () => {
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
      options: EASING_OPTIONS,
      required: true,
      defaultValue: AUTO_TWEEN_DEFAULT_EASING,
    },
  ];
};

const createEditAutoTweenForm = () => {
  return {
    title: "Edit Auto Tween",
    fields: createAutoTweenFields(),
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
  };
};

const createAddKeyframeForm = (
  property,
  propertyFieldConfig,
  { includeDuration = true } = {},
) => {
  if (!property) {
    return {};
  }

  const fields = [];

  if (includeDuration) {
    fields.push({
      name: "duration",
      type: "input-text",
      label: "Duration (ms)",
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
      options: EASING_OPTIONS,
      required: true,
    },
  );

  return {
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
  };
};

const createUpdateKeyframeForm = (
  property,
  propertyFieldConfig,
  options = {},
) => {
  return {
    ...createAddKeyframeForm(property, propertyFieldConfig, options),
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
  };
};

const createAddPropertyForm = (
  availableProperties,
  propertyFieldConfig,
  { side } = {},
) => {
  const isUpdateSide = side === "update";
  const initialValueFields = Object.keys(propertyFieldConfig).map(
    (property) => {
      const field = createSliderField({
        property,
        propertyFieldConfig,
        name: "initialValue",
        label: "Initial value",
      });
      field.$when = isUpdateSide
        ? `tweenMode != "auto" && useInitialValue == true && property == "${property}"`
        : `useInitialValue == true && property == "${property}"`;
      return field;
    },
  );
  const fields = [
    {
      name: "property",
      type: "select",
      label: "Property",
      options: availableProperties,
      required: true,
    },
  ];

  if (isUpdateSide) {
    fields.push({
      name: "tweenMode",
      type: "segmented-control",
      label: "Tween Mode",
      noClear: true,
      options: TWEEN_MODE_OPTIONS,
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
    const autoFields = createAutoTweenFields().map((field) => ({
      ...field,
      $when: 'tweenMode == "auto"',
    }));
    fields.push(...initialValueFields, ...autoFields);
  } else {
    fields.push(
      {
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
      },
      ...initialValueFields,
    );
  }

  return {
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
  };
};

const createTransitionAddPropertySideMenuItems = ({
  previousAvailable = false,
  nextAvailable = false,
} = {}) => {
  const items = [];

  if (previousAvailable) {
    items.push({
      label: "Out",
      type: "item",
      value: "prev",
    });
  }

  if (nextAvailable) {
    items.push({
      label: "In",
      type: "item",
      value: "next",
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

const createEmptyMaskPanelData = () => ({
  enabled: false,
  unsupported: false,
  unsupportedKind: undefined,
  kind: "single",
  kindLabel: "Single",
  channelValue: "alpha",
  channelLabel: "Alpha",
  sampleValue: "step",
  combineValue: "max",
  invertValue: "off",
  invertLabel: "Off",
  softness: 0.08,
  progressDuration: 900,
  progressDurationLabel: "900 ms",
  progressEasing: "linear",
  progressEasingLabel: "Linear",
  singleImage: undefined,
  imageItems: [],
  imageLabel: "No image selected",
  sequenceItems: [],
  compositeItems: [],
});

const getSectionProperties = (state, side) => {
  return state.tweenBySection?.[side] ?? {};
};

const getPropertyFieldConfig = (state) => {
  return createPropertyFieldConfig(state.projectResolution);
};

const getDefaultInitialValues = (state) => {
  return createDefaultInitialValuesByProperty(getPropertyFieldConfig(state));
};

const getTransitionMask = (state) => {
  return state.transitionMask;
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

  state.transitionMask = mask;
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
  nextMask.progressDuration = mask.progressDuration;
  nextMask.progressEasing = mask.progressEasing;
  return nextMask;
};

const getPersistedTransitionMask = (state) => {
  if (!state.editItemId) {
    return undefined;
  }

  return state.data?.items?.[state.editItemId]?.animation?.mask;
};

const getUnsupportedPersistedTransitionMask = (state) => {
  if (state.dialogType !== "transition" || state.transitionMaskRemoved) {
    return undefined;
  }

  const persistedMask = getPersistedTransitionMask(state);
  if (
    !persistedMask?.kind ||
    isEditableTransitionMaskKind(persistedMask.kind)
  ) {
    return undefined;
  }

  return persistedMask;
};

const getEffectiveTransitionMask = (state) => {
  return (
    getTransitionMask(state) ?? getUnsupportedPersistedTransitionMask(state)
  );
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

const getAvailableProperties = (state, side, propertyFieldConfig) => {
  const currentProperties = getSectionProperties(state, side);

  return getPropertyOptionsForSide(side, propertyFieldConfig).filter((item) => {
    return !Object.keys(currentProperties).includes(item.value);
  });
};

export const createInitialState = () => ({
  data: EMPTY_TREE,
  imagesData: createEmptyImagesData(),
  selectedItemId: undefined,
  dialogType: "update",
  targetGroupId: undefined,
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  tweenBySection: createEmptyTweenBySection(),
  transitionMask: undefined,
  pendingTransitionMask: undefined,
  dialogDefaultValues: {
    name: "",
    description: "",
  },
  editMode: false,
  editItemId: undefined,
  autosaveVersion: 0,
  autosavePersistedVersion: 0,
  autosaveInFlight: false,
  previewPlaybackMode: "auto",
  previewRenderVersion: 0,
  previewPreparedVersion: undefined,
  previewPlayheadTimeMs: undefined,
  previewPlayheadVisible: false,
  previewPlaybackFrameId: undefined,
  previewPlaybackStartedAtMs: undefined,
  previewPlaybackDurationMs: undefined,
  previewImages: createInitialPreviewImages(),
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
  transitionMaskRemoved: false,
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

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
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

const cloneTransitionMaskFromItem = (state, itemData, dialogType) => {
  if (dialogType !== "transition") {
    return undefined;
  }

  return normalizeTransitionMaskForEditor(
    itemData?.animation?.mask,
    getImageItems(state),
  );
};

export const openDialog = (
  { state },
  { editMode, itemId, itemData, targetGroupId, dialogType } = {},
) => {
  const resolvedDialogType =
    dialogType ?? getDialogType(itemData?.animation?.type);

  state.dialogType = resolvedDialogType;
  state.editMode = Boolean(editMode);
  state.editItemId = itemId;
  state.transitionMaskRemoved = false;
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
    state.transitionMask = cloneTransitionMaskFromItem(
      state,
      itemData,
      resolvedDialogType,
    );
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
  state.transitionMaskRemoved = false;
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

const resolveDialogSide = (state, side) => {
  if (side) {
    return side;
  }

  return state.dialogType === "transition" ? "prev" : "update";
};

const getMutableSectionProperties = (state, side) => {
  return state.tweenBySection[resolveDialogSide(state, side)];
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
    return sum + (Number(keyframe.duration) || 0);
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

            return {
              duration: keyframe.duration,
              value,
              easing: keyframe.easing ?? "linear",
              relative: keyframe.relative ?? false,
            };
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
      keyframes: config.keyframes.map((keyframe) => ({
        duration: keyframe.duration,
        value: parseFloat(keyframe.value) ?? 0,
        easing: keyframe.easing ?? "linear",
        relative: keyframe.relative ?? false,
      })),
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

  if (!property || !properties || properties[property]) {
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
    keyframe.index === undefined ? keyframes.length : keyframe.index;

  keyframes.splice(index, 0, {
    duration: parseInt(keyframe.duration, 10),
    easing: keyframe.easing,
    value: parseFloat(keyframe.value),
    relative: keyframe.relative,
  });
};

export const deleteKeyframe = ({ state }, { side, property, index } = {}) => {
  const properties = getMutableSectionProperties(state, side);
  const keyframes = properties?.[property]?.keyframes;
  if (!Array.isArray(keyframes)) {
    return;
  }

  keyframes.splice(index, 1);
};

export const deleteProperty = ({ state }, { side, property } = {}) => {
  const properties = getMutableSectionProperties(state, side);

  if (!property || !properties) {
    return;
  }

  delete properties[property];
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

  keyframes[index] = {
    ...keyframe,
    duration: parseInt(keyframe.duration, 10),
    value: parseFloat(keyframe.value),
    relative: keyframe.relative,
  };
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
  state.transitionMask = createDefaultTransitionMask();
  state.transitionMaskRemoved = false;
};

export const startPendingTransitionMask = ({ state }, _payload = {}) => {
  state.pendingTransitionMask = createDefaultTransitionMask();
  state.transitionMaskRemoved = false;
};

export const commitPendingTransitionMask = ({ state }, _payload = {}) => {
  if (!state.pendingTransitionMask) {
    return;
  }

  state.transitionMask = cloneTransitionMask(state.pendingTransitionMask);
  state.pendingTransitionMask = undefined;
  state.transitionMaskRemoved = false;
};

export const disableTransitionMask = ({ state }, _payload = {}) => {
  state.transitionMask = undefined;
  state.transitionMaskRemoved = true;
};

export const selectTransitionMask = ({ state }) => {
  return getTransitionMask(state);
};

export const selectMaskEditorTransitionMask = ({ state }) => {
  return getMaskEditorTransitionMask(state);
};

export const selectTransitionMaskRemoved = ({ state }) => {
  return state.transitionMaskRemoved === true;
};

export const setTransitionMaskKind = ({ state }, { kind } = {}) => {
  const currentMask = getMaskEditorTransitionMask(state);
  if (!currentMask || !kind || kind !== "single") {
    return;
  }

  const nextMask = createDefaultTransitionMask();
  nextMask.softness = currentMask.softness;
  nextMask.progressDuration = currentMask.progressDuration;
  nextMask.progressEasing = currentMask.progressEasing;
  nextMask.imageId =
    currentMask.imageId ??
    currentMask.imageIds?.find(Boolean) ??
    currentMask.items?.find((item) => item?.imageId)?.imageId;
  nextMask.channel =
    currentMask.channel ??
    currentMask.items?.find((item) => item?.channel)?.channel ??
    nextMask.channel;
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

  transitionMask.channel = channel;
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
};

export const setTransitionMaskProgressEasing = ({ state }, { easing } = {}) => {
  const transitionMask = getMaskEditorTransitionMask(state);
  if (!transitionMask || !easing) {
    return;
  }

  transitionMask.progressEasing = easing;
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
  return getPreviewSlotImageId(state.previewImages, target);
};

export const selectPreviewData = ({ state }) => {
  return structuredClone(state.previewImages);
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

export const markAutosavePersisted = ({ state }, { version } = {}) => {
  state.autosavePersistedVersion = version ?? state.autosaveVersion;
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

export const selectPreviewRenderVersion = ({ state }) => {
  return state.previewRenderVersion;
};

export const selectPreviewPreparedVersion = ({ state }) => {
  return state.previewPreparedVersion;
};

export const startPreviewPlayback = (
  { state },
  { startedAtMs, durationMs } = {},
) => {
  state.previewPlaybackStartedAtMs = startedAtMs;
  state.previewPlaybackDurationMs = durationMs;
  state.previewPlayheadTimeMs = 0;
  state.previewPlayheadVisible = true;
  state.previewPlaybackFrameId = undefined;
};

export const setPreviewPlayhead = ({ state }, { timeMs, visible } = {}) => {
  state.previewPlayheadTimeMs = timeMs;
  state.previewPlayheadVisible = visible ?? state.previewPlayheadVisible;
};

export const setPreviewPlaybackFrameId = ({ state }, { frameId } = {}) => {
  state.previewPlaybackFrameId = frameId;
};

export const stopPreviewPlayback = ({ state }, _payload = {}) => {
  state.previewPlayheadTimeMs = undefined;
  state.previewPlayheadVisible = false;
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

const buildTransitionMaskPanelDataForMask = (
  state,
  transitionMask,
  unsupportedPersistedMask,
) => {
  if (!transitionMask && !unsupportedPersistedMask) {
    return createEmptyMaskPanelData();
  }

  if (unsupportedPersistedMask) {
    return {
      ...createEmptyMaskPanelData(),
      enabled: true,
      unsupported: true,
      unsupportedKind: unsupportedPersistedMask.kind,
    };
  }

  const kind = transitionMask.kind;
  const channelValue = transitionMask.channel ?? "alpha";
  const invertValue = transitionMask.invert ? "on" : "off";
  const progressDuration = transitionMask.progressDuration ?? 900;
  const progressEasing = transitionMask.progressEasing ?? "linear";
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
    channelValue: item.channel ?? "alpha",
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
    kind,
    kindLabel: getOptionLabel(MASK_KIND_OPTIONS, kind),
    channelValue,
    channelLabel: getOptionLabel(MASK_CHANNEL_OPTIONS, channelValue),
    sampleValue: transitionMask.sample ?? "step",
    combineValue: transitionMask.combine ?? "max",
    invertValue,
    invertLabel: getOptionLabel(MASK_BOOLEAN_OPTIONS, invertValue),
    softness: transitionMask.softness ?? 0.08,
    progressDuration,
    progressDurationLabel: `${progressDuration} ms`,
    progressEasing,
    progressEasingLabel: getOptionLabel(EASING_OPTIONS, progressEasing),
    singleImage,
    imageItems: imageItems.filter((item) => item?.imageId),
    imageLabel: singleImage?.name ?? "No image selected",
    sequenceItems,
    compositeItems,
  };
};

const buildTransitionMaskPanelData = (state) => {
  return buildTransitionMaskPanelDataForMask(
    state,
    getTransitionMask(state),
    getUnsupportedPersistedTransitionMask(state),
  );
};

const buildPreviewPanelData = (state) => {
  return {
    items: PREVIEW_IMAGE_SLOT_CONFIGS.map((slot) => {
      const imageId = state.previewImages[slot.field]?.imageId;
      const image = buildMaskImageItem(state, imageId);

      return {
        label: slot.label,
        target: slot.target,
        imageId,
        image,
        imageLabel: image?.name ?? "Select image",
      };
    }),
  };
};

const buildMaskEditorPanelData = (state) => {
  if (state.popover.mode === "addMask") {
    return buildTransitionMaskPanelDataForMask(
      state,
      state.pendingTransitionMask,
      undefined,
    );
  }

  return buildTransitionMaskPanelData(state);
};

export const selectViewData = ({ state }) => {
  const propertyFieldConfig = getPropertyFieldConfig(state);
  const defaultInitialValuesByProperty = getDefaultInitialValues(state);
  const dialogType = state.dialogType;
  const updateProperties = getSectionProperties(state, "update");
  const previousProperties = getSectionProperties(state, "prev");
  const nextProperties = getSectionProperties(state, "next");
  const transitionTimelineDuration = getTransitionTimelineDuration({
    prevProperties: previousProperties,
    nextProperties,
    mask: getEffectiveTransitionMask(state),
  });
  const addPropertySide =
    state.popover.payload?.side ??
    (dialogType === "transition" ? "prev" : "update");
  const addPropertyOptions = getAvailableProperties(
    state,
    addPropertySide,
    propertyFieldConfig,
  );
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
  const transitionMaskPanel = buildTransitionMaskPanelData(state);
  const maskEditorPanel = buildMaskEditorPanelData(state);
  const previewPanel = buildPreviewPanelData(state);
  const imageFolderItems = toFlatItems(state.imagesData).filter(
    (item) => item.type === "folder",
  );

  const keyframeDropdownItems = (() => {
    if (state.popover.mode !== "keyframeMenu") {
      return propertyNameDropdownItems;
    }

    const { side, property, index } = state.popover.payload;
    const keyframes =
      getSectionProperties(state, side)[property]?.keyframes ?? [];
    const currentIndex = Number(index);
    const isFirstKeyframe = currentIndex === 0;
    const isLastKeyframe = currentIndex === keyframes.length - 1;

    return baseKeyframeDropdownItems.filter((item) => {
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
  let editKeyframeDefaultValues = {};
  let editAutoDefaultValues = {};
  let editInitialValueDefaultValues = {};
  let editInitialValueContext = {};

  if (state.popover.mode === "addProperty") {
    addPropertyContext = {
      useInitialValue: false,
      tweenMode: "keyframes",
      duration: AUTO_TWEEN_DEFAULT_DURATION,
      easing: AUTO_TWEEN_DEFAULT_EASING,
      ...state.popover.formValues,
    };
  }

  if (state.popover.mode === "editKeyframe") {
    const { side, property, index } = state.popover.payload;
    const currentKeyframe = getSectionProperties(state, side)[property]
      ?.keyframes?.[index];

    if (currentKeyframe) {
      editKeyframeDefaultValues = {
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

  return {
    resourceCategory: ANIMATION_RESOURCE_CATEGORY,
    selectedResourceId: ANIMATION_SELECTED_RESOURCE_ID,
    dialogType,
    dialogDefaultValues: state.dialogDefaultValues,
    animationName: state.dialogDefaultValues?.name ?? "",
    previewPlayheadTimeMs: state.previewPlayheadTimeMs,
    previewPlayheadVisible: state.previewPlayheadVisible,
    dialogTypeLabel: dialogType === "transition" ? "Transition" : "Update",
    transitionTimelineDuration,
    canvasAspectRatio: formatProjectResolutionAspectRatio(
      state.projectResolution,
    ),
    updateProperties,
    previousProperties,
    nextProperties,
    updateTimelineDefaultValues,
    transitionTimelineDefaultValues,
    addPropertyForm: createAddPropertyForm(
      addPropertyOptions,
      propertyFieldConfig,
      {
        side: addPropertySide,
      },
    ),
    addPropertyContext,
    addKeyframeForm: createAddKeyframeForm(
      state.popover.payload?.property,
      propertyFieldConfig,
    ),
    addKeyframeDefaultValues,
    updateKeyframeForm: createUpdateKeyframeForm(
      state.popover.payload?.property,
      propertyFieldConfig,
    ),
    editAutoForm: createEditAutoTweenForm(),
    editInitialValueForm,
    editInitialValueContext,
    editKeyframeDefaultValues,
    editAutoDefaultValues,
    editInitialValueDefaultValues,
    keyframeDropdownItems,
    transitionMaskPanel,
    maskEditorPanel,
    previewPanel,
    maskKindOptions: MASK_KIND_OPTIONS,
    maskChannelOptions: MASK_CHANNEL_OPTIONS,
    maskSampleOptions: MASK_SAMPLE_OPTIONS,
    maskCombineOptions: MASK_COMBINE_OPTIONS,
    maskBooleanOptions: MASK_BOOLEAN_OPTIONS,
    maskProgressEasingOptions: EASING_OPTIONS,
    updateAddPropertyButtonVisible: updateAddPropertyOptions.length > 0,
    transitionAddPropertyButtonVisible:
      previousAddPropertyOptions.length > 0 ||
      nextAddPropertyOptions.length > 0,
    addPropertySideMenuItems: createTransitionAddPropertySideMenuItems({
      previousAvailable: previousAddPropertyOptions.length > 0,
      nextAvailable: nextAddPropertyOptions.length > 0,
    }),
    popover: {
      ...state.popover,
      popoverIsOpen: [
        "addProperty",
        "addKeyframe",
        "editKeyframe",
        "editAuto",
        "editInitialValue",
      ].includes(state.popover.mode),
      maskDialogIsOpen: ["editMask", "addMask"].includes(state.popover.mode),
      dropdownMenuIsOpen: ["keyframeMenu", "propertyNameMenu"].includes(
        state.popover.mode,
      ),
      addPropertySideMenuIsOpen: state.popover.mode === "addPropertySideMenu",
    },
    addPropertyFormDefaultValues: {
      useInitialValue: false,
      tweenMode: "keyframes",
      duration: AUTO_TWEEN_DEFAULT_DURATION,
      easing: AUTO_TWEEN_DEFAULT_EASING,
    },
    imageSelectorDialog: state.imageSelectorDialog,
    imageFolderItems,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewImageId: state.fullImagePreviewImageId,
  };
};
