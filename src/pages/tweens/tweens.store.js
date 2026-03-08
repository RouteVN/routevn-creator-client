import { toFlatItems } from "../../domain/treeHelpers.js";
import { createCatalogPageStore } from "../../deps/features/resourcePages/catalog/createCatalogPageStore.js";
import { resetState } from "./tweens.constants";

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
  };

  return {
    title: "Add Keyframe",
    fields: [
      {
        name: "duration",
        type: "input-text",
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
        type: "slider-with-input",
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
    ],
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

const propertyOptions = [
  { label: "Alpha", value: "alpha" },
  { label: "Position X", value: "x" },
  { label: "Position Y", value: "y" },
  { label: "Scale X", value: "scaleX" },
  { label: "Scale Y", value: "scaleY" },
];

const createAddPropertyForm = (availableProperties) => {
  return {
    title: "Add tween property",
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
        "$if useInitialValue == true": [
          {
            $when: 'property == "x"',
            name: "initialValue",
            type: "slider-with-input",
            min: 0,
            max: 1920,
            label: "Initial value",
          },
          {
            $when: 'property == "y"',
            name: "initialValue",
            type: "slider-with-input",
            min: 0,
            max: 1080,
            label: "Initial value",
          },
          {
            $when: 'property == "alpha"',
            name: "initialValue",
            type: "slider-with-input",
            step: 0.01,
            min: 0,
            max: 1,
            label: "Initial value",
          },
          {
            $when: 'property == "scaleX" || property == "scaleY"',
            name: "initialValue",
            type: "slider-with-input",
            min: 0.1,
            max: 5,
            step: 0.1,
            label: "Initial value",
          },
        ],
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

const addTweenForm = {
  title: "Add Tween Animation",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Name",
      required: true,
    },
    {
      name: "properties",
      type: "slot",
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
        label: "Add Tween Animation",
      },
    ],
  },
};

const editTweenForm = {
  title: "Edit Tween Animation",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Name",
      required: true,
    },
    {
      name: "properties",
      type: "slot",
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
        label: "Update Tween Animation",
      },
    ],
  },
};

const defaultInitialValuesByProperty = {
  x: 960,
  y: 540,
  alpha: 1,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
};

const buildCatalogItem = (item) => ({
  ...item,
  cardKind: "tween",
  itemWidth: "f",
});

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const description = (item.description ?? "").toLowerCase();
  return name.includes(searchQuery) || description.includes(searchQuery);
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
  itemType: "tween",
  resourceType: "tweens",
  title: "Tweens",
  selectedResourceId: "tweens",
  resourceCategory: "assets",
  addText: "Add Tween Animation",
  buildCatalogItem,
  matchesSearch,
  extendViewData: ({ state, selectedItem, baseViewData }) => {
    const selectedTweenPropertyCount = Object.keys(
      selectedItem?.properties ?? {},
    ).length;

    const availableProperties = propertyOptions.filter(
      (item) => !Object.keys(state.properties).includes(item.value),
    );

    const keyframeDropdownItems = (() => {
      if (state.popover.mode !== "keyframeMenu") {
        return propertyNameDropdownItems;
      }

      const { property, index } = state.popover.payload;
      const keyframes = state.properties[property]?.keyframes ?? [];
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
      const { property, index } = state.popover.payload;
      const currentKeyframe = state.properties[property]?.keyframes?.[index];

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
      const { property } = state.popover.payload;
      const currentInitialValue = state.properties[property]?.initialValue;
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
      selectedItemDuration: String(selectedItem?.duration ?? ""),
      selectedTweenPropertyCount,
      isDialogOpen: state.isDialogOpen,
      dialogDefaultValues: state.dialogDefaultValues,
      dialogForm: state.dialogForm,
      properties: state.properties,
      addPropertyForm: createAddPropertyForm(availableProperties),
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
      addPropertyButtonVisible: availableProperties.length > 0,
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
  targetGroupId: undefined,
  properties: {},
  dialogDefaultValues: {
    name: "",
  },
  dialogForm: addTweenForm,
  editMode: false,
  editItemId: undefined,
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

export const selectTweenItemById = selectItemById;

export const selectTweenDisplayItemById = ({ state }, { itemId } = {}) => {
  return toFlatItems(state.data).find(
    (item) => item.id === itemId && item.type === "tween",
  );
};

export const openDialog = (
  { state },
  { editMode, itemId, itemData, targetGroupId } = {},
) => {
  state.isDialogOpen = true;
  state.editMode = Boolean(editMode);
  state.editItemId = itemId;

  if (editMode && itemData) {
    state.targetGroupId = itemData.parentId ?? undefined;
    state.dialogForm = editTweenForm;
    state.dialogDefaultValues = {
      name: itemData.name ?? "",
    };
    state.properties = structuredClone(itemData.properties ?? {});
    return;
  }

  state.targetGroupId =
    targetGroupId === "_root"
      ? undefined
      : (targetGroupId ?? itemData?.parentId ?? undefined);
  state.dialogForm = addTweenForm;
  state.dialogDefaultValues = {
    name: "",
  };
  state.properties = {};
};

export const closeDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = false;
  state.targetGroupId = undefined;
  state.editMode = false;
  state.editItemId = undefined;
  state.dialogDefaultValues = {
    name: "",
  };
  state.dialogForm = addTweenForm;
  state.properties = {};
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

export const selectProperties = ({ state }) => {
  return state.properties;
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

      let propName = property;
      const defaultValue = defaultInitialValuesByProperty[property] ?? 0;
      const initialValue =
        config.initialValue !== undefined && config.initialValue !== ""
          ? parseFloat(config.initialValue)
          : defaultValue;

      let processedInitialValue = Number.isNaN(initialValue)
        ? defaultValue
        : initialValue;
      if (property === "rotation") {
        processedInitialValue = (processedInitialValue * Math.PI) / 180;
      }

      const animationProperties = {};
      animationProperties[propName] = {
        initialValue: processedInitialValue,
        keyframes: config.keyframes.map((keyframe) => {
          let value = parseFloat(keyframe.value) ?? 0;
          if (property === "rotation") {
            value = (value * Math.PI) / 180;
          }

          return {
            duration: keyframe.duration,
            value,
            easing: keyframe.easing ?? "linear",
            relative: keyframe.relative ?? false,
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

  return {
    ...resetState,
    animations,
  };
};

export const selectAnimationRenderState = ({ state }) => {
  return createAnimationRenderState(state.properties, false);
};

export const selectAnimationRenderStateWithAnimations = ({ state }) => {
  return createAnimationRenderState(state.properties, true);
};

export const addProperty = ({ state }, { property, initialValue } = {}) => {
  if (!property || state.properties[property]) {
    return;
  }

  state.properties[property] = {
    initialValue,
    keyframes: [],
  };
};

export const addKeyframe = ({ state }, keyframe = {}) => {
  if (!keyframe.property) {
    return;
  }

  const keyframes = state.properties[keyframe.property]?.keyframes;
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

export const deleteKeyframe = ({ state }, { property, index } = {}) => {
  const keyframes = state.properties[property]?.keyframes;
  if (!Array.isArray(keyframes)) {
    return;
  }

  keyframes.splice(index, 1);
};

export const deleteProperty = ({ state }, { property } = {}) => {
  if (!property) {
    return;
  }

  delete state.properties[property];
};

export const moveKeyframeRight = ({ state }, { property, index } = {}) => {
  const numIndex = Number(index);
  const keyframes = state.properties[property]?.keyframes;
  if (!Array.isArray(keyframes) || numIndex >= keyframes.length - 1) {
    return;
  }

  const current = keyframes[numIndex];
  keyframes[numIndex] = keyframes[numIndex + 1];
  keyframes[numIndex + 1] = current;
};

export const moveKeyframeLeft = ({ state }, { property, index } = {}) => {
  const numIndex = Number(index);
  const keyframes = state.properties[property]?.keyframes;
  if (!Array.isArray(keyframes) || numIndex <= 0) {
    return;
  }

  const current = keyframes[numIndex];
  keyframes[numIndex] = keyframes[numIndex - 1];
  keyframes[numIndex - 1] = current;
};

export const updateKeyframe = (
  { state },
  { property, index, keyframe } = {},
) => {
  const keyframes = state.properties[property]?.keyframes;
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
  { property, initialValue } = {},
) => {
  if (!property || !state.properties[property]) {
    return;
  }

  state.properties[property].initialValue = initialValue;
};

export const selectViewData = (context) => {
  return selectCatalogViewData(context);
};
