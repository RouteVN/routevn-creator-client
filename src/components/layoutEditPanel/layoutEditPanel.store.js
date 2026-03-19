import { parseAndRender } from "jempl";
import { toFlatGroups } from "../../internal/project/tree.js";
import { getFirstTextStyleId } from "../../constants/textStyles.js";
import { getVariableOptions } from "../../internal/project/projection.js";
import { getInteractionActions } from "../../internal/project/interactionPayload.js";
import { getLayoutEditorItemCapabilities } from "../../internal/layoutEditorTypes.js";

const ACTION_INTERACTION_LABELS = {
  click: "Click",
  rightClick: "Right Click",
};

const ACTION_LABELS = {
  nextLine: "Next Line",
  sectionTransition: "Section Transition",
  toggleAutoMode: "Toggle Auto Mode",
  toggleSkipMode: "Toggle Skip Mode",
  toggleDialogueUI: "Toggle Dialogue Box",
  pushLayeredView: "Push Layered View",
  popLayeredView: "Pop Layered View",
  updateVariable: "Update Variable",
};

const ACTION_INTERACTION_TYPES = ["click", "rightClick"];

const getLayoutInteractionActions = (values, interactionType) => {
  return getInteractionActions(values?.[interactionType]);
};

const toLayoutActionItems = (values) => {
  return ACTION_INTERACTION_TYPES.flatMap((interactionType) =>
    Object.entries(getLayoutInteractionActions(values, interactionType)).map(
      ([key]) => ({
        id: key,
        interactionType,
        label: `${ACTION_INTERACTION_LABELS[interactionType]}: ${ACTION_LABELS[key] ?? key}`,
        svg: `action-${key}`,
      }),
    ),
  );
};

const getLayoutEditPanelSections = ({ constants, resourceType }) => {
  return resourceType === "controls"
    ? constants.controlSections || []
    : constants.layoutSections || [];
};

const findFieldPopoverFormInSections = (sections, fieldName) => {
  for (const section of sections || []) {
    for (const item of section.items || []) {
      if (item.type !== "group") {
        continue;
      }

      const field = (item.fields || []).find(
        (entry) => entry.name === fieldName,
      );
      if (field?.popoverForm) {
        return field.popoverForm;
      }
    }
  }

  return undefined;
};

const createDefaultValues = () => ({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  anchor: {
    x: 0,
    y: 0,
  },
  direction: undefined,
  gap: 0,
  actions: {},
});

const toTextStyleOptions = (textStylesData = {}) => {
  const textStyleGroups = toFlatGroups(textStylesData);
  return textStyleGroups.flatMap((group) =>
    group.children.map((item) => ({
      label: item.name,
      value: item.id,
    })),
  );
};

const toInspectorValues = ({ values, firstTextStyleId }) => {
  return {
    ...values,
    direction: values?.direction ?? "",
    textStyleId: values?.textStyleId || firstTextStyleId || "",
    hoverTextStyleId: values?.hoverTextStyleId ?? "",
    clickTextStyleId: values?.clickTextStyleId ?? "",
    actions: toLayoutActionItems(values),
  };
};

export const createInitialState = () => {
  return {
    tempSelectedImageId: undefined,
    imageSelectorDialog: {
      open: false,
      name: undefined,
    },
    popover: {
      key: 0,
      x: undefined,
      y: undefined,
      open: false,
      defaultValues: {},
      name: undefined,
      form: undefined,
      context: {},
    },
    textStylesData: { tree: [], items: {} },
    variablesData: { tree: [], items: {} },
    values: createDefaultValues(),
    activeInteractionType: "click",
  };
};

export const updateValueProperty = ({ state }, { value, name } = {}) => {
  if (!name) {
    return;
  }

  const keys = name.split(".");

  if (keys.length === 1) {
    if (value === undefined) {
      delete state.values[name];
    } else {
      state.values[name] = value;
    }
    return;
  }

  let current = state.values;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  if (value === undefined) {
    delete current[lastKey];
  } else {
    current[lastKey] = value;
  }
};

export const openPopoverForm = ({ state }, { x, y, name, form } = {}) => {
  if (!name) {
    return;
  }

  const value = state.values[name];
  const popoverFormValues = {
    value,
  };

  if (value && typeof value === "string" && value.startsWith("${")) {
    popoverFormValues.contentType = "variable";
  } else {
    popoverFormValues.contentType = "plain";
  }

  state.popover = {
    key: state.popover.key + 1,
    open: true,
    x,
    y,
    defaultValues: popoverFormValues,
    name,
    form,
    context: {
      popoverFormValues,
    },
  };
};

export const updatePopoverFormContext = ({ state }, { values = {} } = {}) => {
  state.popover.context = {
    popoverFormValues: values,
  };
  state.popover.defaultValues = values;
  state.popover.key = state.popover.key + 1;
};

export const closePopoverForm = ({ state }, _payload = {}) => {
  state.popover = {
    key: 0,
    open: false,
    x: undefined,
    y: undefined,
    defaultValues: {},
    name: undefined,
    form: undefined,
  };
};

export const selectFieldPopoverForm = ({ constants, props }, { name } = {}) => {
  if (!name) {
    return undefined;
  }

  const sections = getLayoutEditPanelSections({
    constants,
    resourceType: props.resourceType,
  });

  return findFieldPopoverFormInSections(sections, name);
};

export const selectPopoverForm = ({ state }) => {
  return state.popover;
};

export const openImageSelectorDialog = ({ state }, { name } = {}) => {
  state.imageSelectorDialog = {
    open: true,
    name,
  };
};

export const closeImageSelectorDialog = ({ state }, _payload = {}) => {
  state.imageSelectorDialog = {
    open: false,
    name: undefined,
  };
  state.tempSelectedImageId = undefined;
};

export const setValues = ({ state }, { values } = {}) => {
  state.values = values ?? {};
};

export const setActiveInteractionType = (
  { state },
  { interactionType } = {},
) => {
  if (!ACTION_INTERACTION_TYPES.includes(interactionType)) {
    return;
  }

  state.activeInteractionType = interactionType;
};

export const selectActiveInteractionType = ({ state }) => {
  return state.activeInteractionType ?? "click";
};

export const setTextStylesData = ({ state }, { textStylesData } = {}) => {
  state.textStylesData = textStylesData;
};

export const setVariablesData = ({ state }, { variablesData } = {}) => {
  state.variablesData = variablesData;
};

export const selectValues = ({ state }) => {
  return state.values;
};

export const setTempSelectedImageId = ({ state }, { imageId } = {}) => {
  state.tempSelectedImageId = imageId;
};

export const selectImageSelectorDialog = ({ state }) => {
  return state.imageSelectorDialog;
};

export const selectTempSelectedImageId = ({ state }) => {
  return state.tempSelectedImageId;
};

export const selectViewData = ({ state, props, constants }) => {
  const textStyleItems = toTextStyleOptions(state.textStylesData);
  const firstTextStyleId = getFirstTextStyleId(state.textStylesData);
  const textStyleItemsWithNone = [
    { label: "None", value: "" },
    ...textStyleItems,
  ];
  const variableOptions = getVariableOptions(state.variablesData, {
    type: "number",
  });
  const variableOptionsWithNone = [
    { label: "None", value: "" },
    ...variableOptions,
  ];
  const values = toInspectorValues({
    values: state.values,
    firstTextStyleId,
  });
  const capabilities = getLayoutEditorItemCapabilities(props.itemType);
  const sections = parseAndRender(
    getLayoutEditPanelSections({
      constants,
      resourceType: props.resourceType,
    }),
    {
      itemType: props.itemType,
      layoutType: props.layoutType,
      resourceType: props.resourceType,
      textStyleItems,
      textStyleItemsWithNone,
      variableOptionsWithNone,
      values,
      canAddSpriteImageVariant:
        !values.imageId || !values.hoverImageId || !values.clickImageId,
      showsGapField:
        capabilities.supportsDirection &&
        (values.direction === "vertical" || values.direction === "horizontal"),
      ...capabilities,
    },
  );

  return {
    values: state.values,
    actionsData: getLayoutInteractionActions(
      state.values,
      state.activeInteractionType,
    ),
    config: {
      sections,
    },
    popover: state.popover,
    imageSelectorDialog: state.imageSelectorDialog,
    tempSelectedImageId: state.tempSelectedImageId,
  };
};
