import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import {
  getDialogType,
  getTransitionTimelineDuration,
  getUpdateAnimationTween,
} from "../../internal/animationDisplay.js";
import {
  addKeyframeDefaultValues,
  ANIMATION_RESOURCE_CATEGORY,
  ANIMATION_SELECTED_RESOURCE_ID,
  baseKeyframeDropdownItems,
  editInitialValueForm,
  EMPTY_TREE,
  PREVIEW_BG_COLOR,
  PREVIEW_RECT_HEIGHT,
  PREVIEW_RECT_WIDTH,
  PREVIEW_TRANSITION_NEXT_ELEMENT_ID,
  PREVIEW_TRANSITION_NEXT_FILL,
  PREVIEW_TRANSITION_OFFSET_X,
  PREVIEW_TRANSITION_PREV_ELEMENT_ID,
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

const createPreviewRect = ({
  id,
  x,
  y,
  fill,
  width = PREVIEW_RECT_WIDTH,
  height = PREVIEW_RECT_HEIGHT,
} = {}) => {
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

const createAnimationResetState = (dialogType, projectResolution) => {
  const { width, height } = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );

  const centerX = width / 2;
  const centerY = height / 2;
  const elements = [
    {
      id: "bg",
      type: "rect",
      x: 0,
      y: 0,
      width,
      height,
      fill: PREVIEW_BG_COLOR,
    },
  ];

  if (dialogType === "transition") {
    elements.push(
      createPreviewRect({
        id: PREVIEW_TRANSITION_PREV_ELEMENT_ID,
        x: centerX - PREVIEW_TRANSITION_OFFSET_X,
        y: centerY,
        fill: PREVIEW_TRANSITION_PREV_FILL,
      }),
      createPreviewRect({
        id: PREVIEW_TRANSITION_NEXT_ELEMENT_ID,
        x: centerX + PREVIEW_TRANSITION_OFFSET_X,
        y: centerY,
        fill: PREVIEW_TRANSITION_NEXT_FILL,
      }),
    );
  } else {
    elements.push(
      createPreviewRect({
        id: PREVIEW_UPDATE_ELEMENT_ID,
        x: centerX,
        y: centerY,
        fill: "white",
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

const buildPropertyOptions = (propertyKeys, propertyFieldConfig) => {
  return propertyKeys.map((property) => ({
    label: propertyFieldConfig[property]?.label ?? property,
    value: property,
  }));
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
      type: "select",
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

const createAddPropertyForm = (availableProperties, propertyFieldConfig) => {
  const initialValueFields = Object.keys(propertyFieldConfig).map(
    (property) => {
      const field = createSliderField({
        property,
        propertyFieldConfig,
        name: "initialValue",
        label: "Initial value",
      });
      field.$when = `property == "${property}"`;
      return field;
    },
  );

  return {
    title: "Add animation property",
    fields: [
      {
        name: "property",
        type: "select",
        label: "Property",
        options: availableProperties,
        required: true,
      },
      {
        name: "useInitialValue",
        type: "select",
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
        "$if useInitialValue == true": initialValueFields,
      },
    ],
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

const createEmptyTweenBySection = () => ({
  update: {},
  prev: {},
  next: {},
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
  selectedItemId: undefined,
  dialogType: "update",
  targetGroupId: undefined,
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  tweenBySection: createEmptyTweenBySection(),
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
  popover: {
    mode: "none",
    x: undefined,
    y: undefined,
    payload: {},
    formValues: {},
  },
});

export const setItems = ({ state }, { data } = {}) => {
  state.data = data ?? EMPTY_TREE;
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

export const openDialog = (
  { state },
  { editMode, itemId, itemData, targetGroupId, dialogType } = {},
) => {
  const resolvedDialogType =
    dialogType ?? getDialogType(itemData?.animation?.type);

  state.dialogType = resolvedDialogType;
  state.editMode = Boolean(editMode);
  state.editItemId = itemId;

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
      if (!config.keyframes?.length) {
        continue;
      }

      const defaultValue = defaultInitialValuesByProperty[property] ?? 0;
      const initialValue =
        config.initialValue !== undefined && config.initialValue !== ""
          ? parseFloat(config.initialValue)
          : defaultValue;
      const processedInitialValue = Number.isNaN(initialValue)
        ? defaultValue
        : initialValue;
      const tween = {
        [property]: {
          initialValue: processedInitialValue,
          keyframes: config.keyframes.map((keyframe) => {
            let value = parseFloat(keyframe.value) ?? 0;

            return {
              duration: keyframe.duration,
              value,
              easing: keyframe.easing ?? "linear",
              relative: keyframe.relative ?? false,
            };
          }),
        },
      };

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

const getPropertiesDuration = (properties = {}) => {
  return Object.values(properties).reduce((maxDuration, config) => {
    const propertyDuration = (config?.keyframes ?? []).reduce(
      (sum, keyframe) => sum + (Number(keyframe.duration) || 0),
      0,
    );

    return Math.max(maxDuration, propertyDuration);
  }, 0);
};

const createAnimationRenderState = ({
  dialogType,
  updateProperties,
  previousProperties,
  nextProperties,
  projectResolution,
  includeAnimations = true,
} = {}) => {
  const animations = includeAnimations
    ? dialogType === "transition"
      ? [
          ...createTweenAnimationsForTarget({
            properties: previousProperties,
            projectResolution,
            targetId: PREVIEW_TRANSITION_PREV_ELEMENT_ID,
            animationIdPrefix: "preview-prev-animation",
          }),
          ...createTweenAnimationsForTarget({
            properties: nextProperties,
            projectResolution,
            targetId: PREVIEW_TRANSITION_NEXT_ELEMENT_ID,
            animationIdPrefix: "preview-next-animation",
          }),
        ]
      : createTweenAnimationsForTarget({
          properties: updateProperties,
          projectResolution,
          targetId: PREVIEW_UPDATE_ELEMENT_ID,
          animationIdPrefix: "preview-animation",
        })
    : [];

  return {
    ...createAnimationResetState(dialogType, projectResolution),
    animations,
  };
};

export const selectAnimationResetState = ({ state }) => {
  return createAnimationResetState(state.dialogType, state.projectResolution);
};

export const selectAnimationRenderStateWithAnimations = ({ state }) => {
  return createAnimationRenderState({
    dialogType: state.dialogType,
    updateProperties: state.tweenBySection.update,
    previousProperties: state.tweenBySection.prev,
    nextProperties: state.tweenBySection.next,
    projectResolution: state.projectResolution,
    includeAnimations: true,
  });
};

export const selectPreviewDurationMs = ({ state }) => {
  if (state.dialogType === "transition") {
    return getTransitionTimelineDuration({
      prevProperties: state.tweenBySection.prev,
      nextProperties: state.tweenBySection.next,
    });
  }

  return getPropertiesDuration(state.tweenBySection.update);
};

export const addProperty = (
  { state },
  { side, property, initialValue } = {},
) => {
  const properties = getMutableSectionProperties(state, side);

  if (!property || !properties || properties[property]) {
    return;
  }

  properties[property] = {
    initialValue,
    keyframes: [],
  };
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

  properties[property].initialValue = initialValue;
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
  let editInitialValueDefaultValues = {};
  let editInitialValueContext = {};

  if (state.popover.mode === "addProperty") {
    addPropertyContext = { ...state.popover.formValues };
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

  if (state.popover.mode === "editInitialValue") {
    const { side, property } = state.popover.payload;
    const currentInitialValue = getSectionProperties(state, side)[property]
      ?.initialValue;
    const defaultValue = defaultInitialValuesByProperty[property] ?? 0;
    const isUsingDefault = currentInitialValue === defaultValue;

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
    editInitialValueForm,
    editInitialValueContext,
    editKeyframeDefaultValues,
    editInitialValueDefaultValues,
    keyframeDropdownItems,
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
        "editInitialValue",
      ].includes(state.popover.mode),
      dropdownMenuIsOpen: ["keyframeMenu", "propertyNameMenu"].includes(
        state.popover.mode,
      ),
      addPropertySideMenuIsOpen: state.popover.mode === "addPropertySideMenu",
    },
    addPropertyFormDefaultValues: {
      useInitialValue: false,
    },
  };
};
