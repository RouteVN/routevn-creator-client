import { toFlatItems } from "../../internal/project/tree.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { resetState } from "./animations.constants";

const PROPERTY_FIELD_CONFIG = {
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
    defaultValue: 960,
    slider: {
      min: 0,
      max: 1920,
    },
  },
  y: {
    label: "Position Y",
    defaultValue: 540,
    slider: {
      min: 0,
      max: 1080,
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

const UPDATE_PROPERTY_KEYS = ["alpha", "x", "y", "scaleX", "scaleY"];
const TRANSITION_PROPERTY_KEYS = [
  "translateX",
  "translateY",
  "alpha",
  "scaleX",
  "scaleY",
];

const buildPropertyOptions = (propertyKeys) => {
  return propertyKeys.map((property) => ({
    label: PROPERTY_FIELD_CONFIG[property]?.label ?? property,
    value: property,
  }));
};

const updatePropertyOptions = buildPropertyOptions(UPDATE_PROPERTY_KEYS);
const transitionPropertyOptions = buildPropertyOptions(
  TRANSITION_PROPERTY_KEYS,
);

const defaultInitialValuesByProperty = Object.fromEntries(
  Object.entries(PROPERTY_FIELD_CONFIG).map(([property, config]) => [
    property,
    config.defaultValue,
  ]),
);

const updateTimelineDefaultValues = Object.fromEntries(
  UPDATE_PROPERTY_KEYS.map((property) => [
    property,
    defaultInitialValuesByProperty[property],
  ]),
);

const transitionTimelineDefaultValues = Object.fromEntries(
  TRANSITION_PROPERTY_KEYS.map((property) => [
    property,
    defaultInitialValuesByProperty[property],
  ]),
);

const createSliderField = ({
  property,
  name,
  label,
  required = false,
  fallbackLabel = "Value",
} = {}) => {
  const config = PROPERTY_FIELD_CONFIG[property];

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

const createAddKeyframeForm = (property, { includeDuration = true } = {}) => {
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
      options: [{ label: "Linear", value: "linear" }],
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

const addKeyframeDefaultValues = {
  relative: false,
  duration: 1000,
  value: 0,
  easing: "linear",
};

const createUpdateKeyframeForm = (property, options = {}) => {
  return {
    ...createAddKeyframeForm(property, options),
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

const editInitialValueForm = {
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

const createAddPropertyForm = (availableProperties) => {
  const initialValueFields = Object.keys(PROPERTY_FIELD_CONFIG).map(
    (property) => {
      const field = createSliderField({
        property,
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

const createTypeMenuItems = [
  {
    label: "Update",
    type: "item",
    value: "update",
  },
  {
    label: "Transition",
    type: "item",
    value: "transition",
  },
];

const createAnimationForm = ({
  title,
  buttonLabel,
  typeLabel,
  timelineFields,
} = {}) => {
  return {
    title,
    fields: [
      {
        type: "read-only-text",
        content: `Type: ${typeLabel}`,
      },
      {
        name: "name",
        type: "input-text",
        label: "Name",
        required: true,
      },
      ...timelineFields,
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: buttonLabel,
        },
      ],
    },
  };
};

const updateTimelineFields = [
  {
    name: "properties",
    type: "slot",
    slot: "timeline",
    label: "Animation timeline",
  },
];

const transitionTimelineFields = [
  {
    name: "previous",
    type: "slot",
    slot: "previousTimeline",
    label: "Previous",
  },
  {
    name: "next",
    type: "slot",
    slot: "nextTimeline",
    label: "Next",
  },
];

const addUpdateAnimationForm = createAnimationForm({
  title: "Add Animation",
  buttonLabel: "Add Animation",
  typeLabel: "Update",
  timelineFields: updateTimelineFields,
});

const editUpdateAnimationForm = createAnimationForm({
  title: "Edit Animation",
  buttonLabel: "Update Animation",
  typeLabel: "Update",
  timelineFields: updateTimelineFields,
});

const addTransitionAnimationForm = createAnimationForm({
  title: "Add Animation",
  buttonLabel: "Add Animation",
  typeLabel: "Transition",
  timelineFields: transitionTimelineFields,
});

const editTransitionAnimationForm = createAnimationForm({
  title: "Edit Animation",
  buttonLabel: "Update Animation",
  typeLabel: "Transition",
  timelineFields: transitionTimelineFields,
});

const getDialogForm = (dialogType, editMode = false) => {
  if (dialogType === "transition") {
    return editMode ? editTransitionAnimationForm : addTransitionAnimationForm;
  }

  return editMode ? editUpdateAnimationForm : addUpdateAnimationForm;
};

const getDialogType = (animationType) => {
  return animationType === "transition" ? "transition" : "update";
};

const getAnimationTypeLabel = (animationType) => {
  return getDialogType(animationType) === "transition"
    ? "Transition"
    : "Update";
};

const getUpdateAnimationTween = (item = {}) => {
  if (
    (item?.animation?.type === "live" || item?.animation?.type === "update") &&
    item.animation.tween &&
    typeof item.animation.tween === "object"
  ) {
    return item.animation.tween;
  }

  return {};
};

const getTransitionSideTween = (item = {}, side) => {
  if (
    item?.animation?.type === "transition" &&
    item.animation?.[side]?.tween &&
    typeof item.animation[side].tween === "object"
  ) {
    return item.animation[side].tween;
  }

  return {};
};

const getAnimationDuration = (tween = {}) => {
  return Object.values(tween).reduce((maxDuration, propertyConfig) => {
    const totalDuration = (propertyConfig?.keyframes ?? []).reduce(
      (sum, keyframe) => {
        return sum + (Number(keyframe?.duration) || 0);
      },
      0,
    );

    return Math.max(maxDuration, totalDuration);
  }, 0);
};

const getAnimationDisplayProperties = (item = {}) => {
  const dialogType = getDialogType(item?.animation?.type);

  return dialogType === "transition"
    ? {}
    : structuredClone(getUpdateAnimationTween(item));
};

const getAnimationDisplayDuration = (item = {}) => {
  const dialogType = getDialogType(item?.animation?.type);

  if (dialogType === "transition") {
    return Math.max(
      getAnimationDuration(getTransitionSideTween(item, "prev")),
      getAnimationDuration(getTransitionSideTween(item, "next")),
    );
  }

  return getAnimationDuration(getUpdateAnimationTween(item));
};

const getTransitionTimelineDuration = ({
  prevProperties = {},
  nextProperties = {},
} = {}) => {
  return Math.max(
    getAnimationDuration(prevProperties),
    getAnimationDuration(nextProperties),
  );
};

const toAnimationDisplayItem = (item) => {
  const animationType = getDialogType(item?.animation?.type);
  const properties = getAnimationDisplayProperties(item);
  const prevProperties = structuredClone(getTransitionSideTween(item, "prev"));
  const nextProperties = structuredClone(getTransitionSideTween(item, "next"));
  const updateProperties = structuredClone(getUpdateAnimationTween(item));
  const propertyCount =
    animationType === "transition"
      ? Object.keys(prevProperties).length + Object.keys(nextProperties).length
      : Object.keys(updateProperties).length;
  const transitionTimelineDuration =
    animationType === "transition"
      ? getTransitionTimelineDuration({
          prevProperties,
          nextProperties,
        })
      : 0;

  return {
    ...item,
    animationType,
    animationTypeLabel: getAnimationTypeLabel(item?.animation?.type),
    properties,
    updateProperties,
    prevProperties,
    nextProperties,
    transitionTimelineDuration,
    propertyCount,
    duration: getAnimationDisplayDuration(item),
    cardKind: "animation",
    itemWidth: "f",
  };
};

const buildCatalogItem = (item) => toAnimationDisplayItem(item);

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const description = (item.description ?? "").toLowerCase();
  return name.includes(searchQuery) || description.includes(searchQuery);
};

const createEmptyTweenBySection = () => ({
  update: {},
  prev: {},
  next: {},
});

const getSectionProperties = (state, side) => {
  return state.tweenBySection?.[side] ?? {};
};

const getPropertyOptionsForSide = (side) => {
  return side === "update" ? updatePropertyOptions : transitionPropertyOptions;
};

const getAvailableProperties = (state, side) => {
  const currentProperties = getSectionProperties(state, side);

  return getPropertyOptionsForSide(side).filter((item) => {
    return !Object.keys(currentProperties).includes(item.value);
  });
};

const {
  createInitialState: createCatalogInitialState,
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectItemById,
  selectSelectedItemId,
  setSearchQuery,
  selectViewData: selectCatalogViewData,
} = createCatalogPageStore({
  itemType: "animation",
  resourceType: "animations",
  title: "Animations",
  selectedResourceId: "animations",
  resourceCategory: "assets",
  addText: "Add Animation",
  buildCatalogItem,
  matchesSearch,
  extendViewData: ({ state, selectedItem, baseViewData }) => {
    const selectedAnimationItem = selectedItem
      ? toAnimationDisplayItem(selectedItem)
      : undefined;
    const selectedAnimationPropertyCount =
      selectedAnimationItem?.propertyCount ?? 0;
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
    const addPropertyOptions = getAvailableProperties(state, addPropertySide);

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
      ...baseViewData,
      selectedAnimationTypeLabel:
        selectedAnimationItem?.animationTypeLabel ?? "",
      selectedItemDuration: String(selectedAnimationItem?.duration ?? ""),
      selectedAnimationPropertyCount,
      createTypeMenu: state.createTypeMenu,
      isDialogOpen: state.isDialogOpen,
      dialogType,
      dialogDefaultValues: state.dialogDefaultValues,
      dialogForm: state.dialogForm,
      dialogFormKey: `${dialogType}-${state.editMode ? "edit" : "add"}-${state.editItemId ?? "new"}-${state.isDialogOpen ? "open" : "closed"}`,
      transitionTimelineDuration,
      transitionTimelineDurationLabel: `${transitionTimelineDuration}ms`,
      updateProperties,
      previousProperties,
      nextProperties,
      updateTimelineDefaultValues,
      transitionTimelineDefaultValues,
      addPropertyForm: createAddPropertyForm(addPropertyOptions),
      addPropertyContext,
      addKeyframeForm: createAddKeyframeForm(state.popover.payload?.property),
      addKeyframeDefaultValues,
      updateKeyframeForm: createUpdateKeyframeForm(
        state.popover.payload?.property,
      ),
      editInitialValueForm,
      editInitialValueContext,
      editKeyframeDefaultValues,
      editInitialValueDefaultValues,
      keyframeDropdownItems,
      updateAddPropertyButtonVisible:
        getAvailableProperties(state, "update").length > 0,
      previousAddPropertyButtonVisible:
        getAvailableProperties(state, "prev").length > 0,
      nextAddPropertyButtonVisible:
        getAvailableProperties(state, "next").length > 0,
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
    };
  },
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isDialogOpen: false,
  dialogType: "update",
  targetGroupId: undefined,
  tweenBySection: createEmptyTweenBySection(),
  dialogDefaultValues: {
    name: "",
  },
  dialogForm: addUpdateAnimationForm,
  editMode: false,
  editItemId: undefined,
  createTypeMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetGroupId: undefined,
    items: createTypeMenuItems,
  },
  popover: {
    mode: "none",
    x: undefined,
    y: undefined,
    payload: {},
    formValues: {},
  },
});

export {
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectAnimationItemById = selectItemById;

export const selectAnimationDisplayItemById = ({ state }, { itemId } = {}) => {
  const rawItem = toFlatItems(state.data).find(
    (item) => item.id === itemId && item.type === "animation",
  );
  return rawItem ? toAnimationDisplayItem(rawItem) : undefined;
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

  state.isDialogOpen = true;
  state.dialogType = resolvedDialogType;
  state.editMode = Boolean(editMode);
  state.editItemId = itemId;

  if (editMode && itemData) {
    state.targetGroupId = itemData.parentId ?? undefined;
    state.dialogForm = getDialogForm(resolvedDialogType, true);
    state.dialogDefaultValues = {
      name: itemData.name ?? "",
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
  state.dialogForm = getDialogForm(resolvedDialogType, false);
  state.dialogDefaultValues = {
    name: "",
  };
  state.tweenBySection = createEmptyTweenBySection();
};

export const closeDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = false;
  state.dialogType = "update";
  state.targetGroupId = undefined;
  state.editMode = false;
  state.editItemId = undefined;
  state.dialogDefaultValues = {
    name: "",
  };
  state.dialogForm = addUpdateAnimationForm;
  state.tweenBySection = createEmptyTweenBySection();
};

export const openCreateTypeMenu = ({ state }, { x, y, targetGroupId } = {}) => {
  state.createTypeMenu.isOpen = true;
  state.createTypeMenu.x = x ?? 0;
  state.createTypeMenu.y = y ?? 0;
  state.createTypeMenu.targetGroupId =
    targetGroupId === "_root" ? undefined : targetGroupId;
};

export const closeCreateTypeMenu = ({ state }) => {
  state.createTypeMenu.isOpen = false;
  state.createTypeMenu.x = 0;
  state.createTypeMenu.y = 0;
  state.createTypeMenu.targetGroupId = undefined;
};

export const selectCreateTypeMenuTargetGroupId = ({ state }) => {
  return state.createTypeMenu.targetGroupId;
};

export const setTargetGroupId = ({ state }, { groupId } = {}) => {
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
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

const createAnimationRenderState = (properties, includeAnimations = true) => {
  const animations = [];

  if (includeAnimations && properties && Object.keys(properties).length > 0) {
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
        id: `animation-${property}`,
        targetId: "preview-element",
        type: "live",
        tween,
      });
    }
  }

  return {
    ...resetState,
    animations,
  };
};

export const selectAnimationRenderState = ({ state }) => {
  return createAnimationRenderState(state.tweenBySection.update, false);
};

export const selectAnimationRenderStateWithAnimations = ({ state }) => {
  return createAnimationRenderState(state.tweenBySection.update, true);
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

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
