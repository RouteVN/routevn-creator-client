import { parseAndRender } from "jempl";
import { toFlatGroups } from "../../internal/project/tree.js";
import { getFirstTextStyleId } from "../../constants/textStyles.js";
import { getVariableOptions } from "../../internal/project/projection.js";
import { getSystemVariableItems } from "../../internal/systemVariables.js";
import { getFragmentLayoutOptions } from "../../internal/layoutFragments.js";
import {
  getInteractionActions,
  getInteractionPayload,
} from "../../internal/project/interactionPayload.js";
import { getLayoutEditorItemCapabilities } from "../../internal/layoutEditorTypes.js";
import {
  SAVE_DATA_AVAILABLE_CONDITION_ID,
  getFixedVisibilityStateItems,
  splitVisibilityConditionFromWhen,
} from "../../internal/layoutVisibilityCondition.js";

const ACTION_INTERACTION_LABELS = {
  click: "Click",
  rightClick: "Right Click",
};

const HIDDEN_LAYOUT_ACTION_MODES = new Set();

const ACTION_LABELS = {
  nextLine: "Next Line",
  sectionTransition: "Section Transition",
  toggleAutoMode: "Toggle Auto Mode",
  toggleSkipMode: "Toggle Skip Mode",
  toggleDialogueUI: "Toggle Dialogue Box",
  pushLayeredView: "Push Layered View",
  popLayeredView: "Pop Layered View",
  rollbackByOffset: "Rollback",
  updateVariable: "Update Variable",
  showConfirmDialog: "Show Confirm Dialog",
  hideConfirmDialog: "Hide Confirm Dialog",
  saveSlot: "Save Slot",
};

const ACTION_INTERACTION_TYPES = ["click", "rightClick"];

const REVEAL_EFFECT_OPTIONS = [
  { label: "Typewriter", value: "typewriter" },
  { label: "Soft Wipe", value: "softWipe" },
  { label: "None", value: "none" },
];

const VISIBILITY_CONDITION_OP_OPTIONS = [{ label: "Equals", value: "eq" }];
const SAVE_LOAD_PAGINATION_MODE_OPTIONS = [
  { label: "Continuous", value: "continuous" },
  { label: "Paginated", value: "paginated" },
];
const INHERIT_TO_CHILDREN_OPTIONS = [
  { label: "Disabled", value: false },
  { label: "Enabled", value: true },
];

const VISIBILITY_BOOLEAN_OPTIONS = [
  { label: "True", value: true },
  { label: "False", value: false },
];

const SUPPORTED_VISIBILITY_VARIABLE_TYPES = new Set([
  "boolean",
  "number",
  "string",
]);

const getLayoutInteractionActions = (values, interactionType) => {
  return getInteractionActions(values?.[interactionType]);
};

const toLayoutActionItems = (values) => {
  return ACTION_INTERACTION_TYPES.flatMap((interactionType) =>
    Object.entries(getLayoutInteractionActions(values, interactionType))
      .filter(([key]) => !HIDDEN_LAYOUT_ACTION_MODES.has(key))
      .map(([key]) => ({
        id: key,
        interactionType,
        label: `${ACTION_INTERACTION_LABELS[interactionType]}: ${ACTION_LABELS[key] ?? key}`,
        svg: `action-${key}`,
      })),
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

const getChildInteractionSummary = (values = {}) => {
  const labels = [];

  if (values?.inheritHoverToChildren === true) {
    labels.push("Hover");
  }

  if (values?.inheritClickToChildren === true) {
    labels.push("Click");
  }

  if (values?.inheritRightClickToChildren === true) {
    labels.push("Right Click");
  }

  if (labels.length === 0) {
    return "None";
  }

  return labels.join(", ");
};

const getScalarVariableItems = (variablesData = {}, options = {}) => {
  const projectVariables = Object.entries(variablesData?.items || {}).filter(
    ([, item]) =>
      item?.type !== "folder" &&
      SUPPORTED_VISIBILITY_VARIABLE_TYPES.has(
        String(item?.type || "string").toLowerCase(),
      ),
  );
  const systemVariables = Object.entries(getSystemVariableItems()).filter(
    ([, item]) =>
      SUPPORTED_VISIBILITY_VARIABLE_TYPES.has(
        String(item?.type || "string").toLowerCase(),
      ),
  );
  const fixedStateVariables = Object.entries(
    getFixedVisibilityStateItems(),
  ).filter(([, item]) =>
    SUPPORTED_VISIBILITY_VARIABLE_TYPES.has(
      String(item?.type || "string").toLowerCase(),
    ),
  );

  const scalarVariables = Object.fromEntries([
    ...projectVariables,
    ...systemVariables,
    ...fixedStateVariables,
  ]);

  if (options.includeSaveDataAvailable) {
    scalarVariables[SAVE_DATA_AVAILABLE_CONDITION_ID] = {
      name: "Save Data Available",
      type: "boolean",
      source: "slot",
      description: "Whether this save/load slot already has saved data",
    };
  }

  return scalarVariables;
};

const toVisibilityConditionVariableOptions = (
  variablesData = {},
  options = {},
) => {
  return Object.entries(getScalarVariableItems(variablesData, options)).map(
    ([id, variable]) => ({
      label: `${variable.name} (${String(variable.type || "string").toLowerCase()})`,
      value: id,
    }),
  );
};

const toVisibilityConditionVariableTypeById = (
  variablesData = {},
  options = {},
) => {
  return Object.fromEntries(
    Object.entries(getScalarVariableItems(variablesData, options)).map(
      ([id, variable]) => [id, String(variable.type || "string").toLowerCase()],
    ),
  );
};

const getVisibilityConditionSummary = (
  visibilityCondition,
  variablesData = {},
  options = {},
) => {
  if (!visibilityCondition?.variableId || visibilityCondition?.op !== "eq") {
    return "Always visible";
  }

  const variable = getScalarVariableItems(variablesData, options)[
    visibilityCondition.variableId
  ];
  const variableName = variable?.name ?? visibilityCondition.variableId;
  const value =
    typeof visibilityCondition.value === "string"
      ? `"${visibilityCondition.value}"`
      : String(visibilityCondition.value);

  return `${variableName} == ${value}`;
};

const normalizeConditionalTextStyleRules = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (rule) =>
      rule &&
      typeof rule === "object" &&
      typeof rule.variableId === "string" &&
      rule.variableId.length > 0 &&
      rule.op === "eq" &&
      typeof rule.textStyleId === "string" &&
      rule.textStyleId.length > 0,
  );
};

const getConditionalTextStyleRuleSummary = (
  rule,
  textStylesData = {},
  variablesData = {},
  options = {},
) => {
  const conditionSummary = getVisibilityConditionSummary(
    rule,
    variablesData,
    options,
  );
  const textStyleName =
    textStylesData?.items?.[rule?.textStyleId]?.name ?? rule?.textStyleId;

  return `${conditionSummary} -> ${textStyleName}`;
};

const getConditionalTextStylesSummary = (rules = []) => {
  if (rules.length === 0) {
    return "No conditional styles";
  }

  if (rules.length === 1) {
    return "1 conditional style";
  }

  return `${rules.length} conditional styles`;
};

const createConditionalTextStyleRuleDefaults = (rule, variableTypeById) => {
  const variableId = rule?.variableId ?? "";
  const selectedVariableType = variableId
    ? (variableTypeById[variableId] ?? "string")
    : undefined;
  const rawValue = rule?.value;
  const parsedNumberValue = Number(rawValue);

  return {
    variableId,
    op: rule?.op ?? "eq",
    textStyleId: rule?.textStyleId ?? "",
    booleanValue: rawValue === true,
    numberValue: Number.isFinite(parsedNumberValue) ? parsedNumberValue : 0,
    stringValue: typeof rawValue === "string" ? rawValue : "",
    selectedVariableType,
  };
};

const createConditionalTextStyleRuleForm = ({
  variableOptions,
  textStyleOptions,
} = {}) => {
  return {
    title: "Conditional Text Style",
    fields: [
      {
        name: "variableId",
        type: "select",
        label: "Variable",
        required: true,
        clearable: false,
        options: variableOptions,
      },
      {
        $when: "variableId",
        name: "op",
        type: "select",
        label: "Operation",
        required: true,
        clearable: false,
        options: VISIBILITY_CONDITION_OP_OPTIONS,
      },
      {
        $when: "variableId && selectedVariableType == 'boolean'",
        name: "booleanValue",
        type: "select",
        label: "Value",
        required: true,
        clearable: false,
        options: VISIBILITY_BOOLEAN_OPTIONS,
      },
      {
        $when: "variableId && selectedVariableType == 'number'",
        name: "numberValue",
        type: "input-number",
        label: "Value",
        required: true,
      },
      {
        $when: "variableId && selectedVariableType == 'string'",
        name: "stringValue",
        type: "input-text",
        label: "Value",
        required: true,
      },
      {
        name: "textStyleId",
        type: "select",
        label: "Text Style",
        required: true,
        clearable: false,
        options: textStyleOptions,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: "Save",
        },
      ],
    },
  };
};

const createVisibilityConditionDialogDefaults = (
  visibilityCondition,
  variableTypeById,
) => {
  const variableId = visibilityCondition?.variableId ?? "";
  const selectedVariableType = variableId
    ? (variableTypeById[variableId] ?? "string")
    : undefined;
  const rawValue = visibilityCondition?.value;
  const parsedNumberValue = Number(rawValue);

  return {
    variableId,
    op: visibilityCondition?.op ?? "eq",
    booleanValue: rawValue === true,
    numberValue: Number.isFinite(parsedNumberValue) ? parsedNumberValue : 0,
    stringValue: typeof rawValue === "string" ? rawValue : "",
    selectedVariableType,
  };
};

const createVisibilityConditionForm = ({
  hasCondition,
  variableOptions,
} = {}) => {
  return {
    title: "Visibility Condition",
    fields: [
      {
        name: "variableId",
        type: "select",
        label: "Variable",
        required: false,
        options: variableOptions,
      },
      {
        $when: "variableId",
        name: "op",
        type: "select",
        label: "Operation",
        required: true,
        clearable: false,
        options: VISIBILITY_CONDITION_OP_OPTIONS,
      },
      {
        $when: "variableId && selectedVariableType == 'boolean'",
        name: "booleanValue",
        type: "select",
        label: "Value",
        required: true,
        clearable: false,
        options: VISIBILITY_BOOLEAN_OPTIONS,
      },
      {
        $when: "variableId && selectedVariableType == 'number'",
        name: "numberValue",
        type: "input-number",
        label: "Value",
        required: true,
      },
      {
        $when: "variableId && selectedVariableType == 'string'",
        name: "stringValue",
        type: "input-text",
        label: "Value",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "clear",
          align: "left",
          variant: "se",
          label: "Clear",
          disabled: !hasCondition,
        },
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: "Save",
        },
      ],
    },
  };
};

const getSaveLoadPaginationSummary = ({ values, variablesData } = {}) => {
  const paginationMode = values?.paginationMode ?? "continuous";

  if (paginationMode !== "paginated") {
    return "Continuous";
  }

  const variableId = values?.paginationVariableId;
  const variableName =
    variableId &&
    (variablesData?.items?.[variableId]?.name ??
      getSystemVariableItems()?.[variableId]?.name ??
      variableId);
  const paginationSize = Number(values?.paginationSize);
  const resolvedPaginationSize =
    Number.isFinite(paginationSize) && paginationSize > 0 ? paginationSize : 0;

  return `Paginated: ${variableName ?? "No variable"} • ${resolvedPaginationSize} per page`;
};

const createSaveLoadPaginationDialogDefaults = (values = {}) => {
  const paginationSize = Number(values?.paginationSize);

  return {
    paginationMode: values?.paginationMode ?? "continuous",
    paginationVariableId: values?.paginationVariableId ?? "",
    paginationSize:
      Number.isFinite(paginationSize) && paginationSize > 0
        ? paginationSize
        : 3,
  };
};

const createSaveLoadPaginationForm = ({ variableOptions } = {}) => {
  return {
    title: "Pagination",
    fields: [
      {
        name: "paginationMode",
        type: "select",
        label: "Pagination",
        required: true,
        clearable: false,
        options: SAVE_LOAD_PAGINATION_MODE_OPTIONS,
      },
      {
        $when: 'paginationMode == "paginated"',
        name: "paginationVariableId",
        type: "select",
        label: "Pagination Variable",
        required: true,
        options: variableOptions,
      },
      {
        $when: 'paginationMode == "paginated"',
        name: "paginationSize",
        type: "input-number",
        label: "Pagination Number",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: "Save",
        },
      ],
    },
  };
};

const createChildInteractionDialogDefaults = (values = {}) => {
  return {
    inheritHoverToChildren: values?.inheritHoverToChildren === true,
    inheritClickToChildren: values?.inheritClickToChildren === true,
    inheritRightClickToChildren: values?.inheritRightClickToChildren === true,
  };
};

const createChildInteractionForm = () => {
  return {
    title: "Child Interaction",
    fields: [
      {
        name: "inheritHoverToChildren",
        type: "select",
        label: "Hover",
        required: true,
        clearable: false,
        options: INHERIT_TO_CHILDREN_OPTIONS,
      },
      {
        name: "inheritClickToChildren",
        type: "select",
        label: "Click",
        required: true,
        clearable: false,
        options: INHERIT_TO_CHILDREN_OPTIONS,
      },
      {
        name: "inheritRightClickToChildren",
        type: "select",
        label: "Right Click",
        required: true,
        clearable: false,
        options: INHERIT_TO_CHILDREN_OPTIONS,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: "Save",
        },
      ],
    },
  };
};

const toTextStyleOptions = (textStylesData = {}) => {
  const textStyleGroups = toFlatGroups(textStylesData);
  return textStyleGroups.flatMap((group) =>
    group.children.map((item) => ({
      label: item.name,
      value: item.id,
    })),
  );
};

const getSliderBoundVariableId = (values = {}) => {
  if (values?.type !== "slider") {
    return values?.variableId;
  }

  if (values?.variableId) {
    return values.variableId;
  }

  const interactionPayload = getInteractionPayload(values.change);
  const updateVariable = interactionPayload?.actions?.updateVariable;
  const firstOperation = Array.isArray(updateVariable?.operations)
    ? updateVariable.operations[0]
    : undefined;

  return firstOperation?.variableId;
};

const toInspectorValues = ({ values, firstTextStyleId }) => {
  const revealEffect =
    values?.type === "text-revealing-ref-dialogue-content"
      ? (values?.revealEffect ?? "typewriter")
      : values?.revealEffect;
  const variableId = getSliderBoundVariableId(values);

  return {
    ...values,
    revealEffect,
    variableId,
    fragmentLayoutId: values?.fragmentLayoutId ?? "",
    paginationMode: values?.paginationMode ?? "continuous",
    paginationVariableId: values?.paginationVariableId ?? "",
    paginationSize: values?.paginationSize ?? 3,
    scroll: values?.scroll ?? false,
    inheritHoverToChildren: values?.inheritHoverToChildren === true,
    inheritClickToChildren: values?.inheritClickToChildren === true,
    inheritRightClickToChildren: values?.inheritRightClickToChildren === true,
    direction: values?.direction,
    textStyleId: values?.textStyleId || firstTextStyleId || "",
    hoverTextStyleId: values?.hoverTextStyleId ?? "",
    clickTextStyleId: values?.clickTextStyleId ?? "",
    conditionalTextStyles: normalizeConditionalTextStyleRules(
      values?.conditionalTextStyles,
    ),
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
    visibilityConditionDialog: {
      open: false,
      key: 0,
      selectedVariableType: undefined,
    },
    saveLoadPaginationDialog: {
      open: false,
      key: 0,
    },
    childInteractionDialog: {
      open: false,
      key: 0,
    },
    conditionalTextStylesDialog: {
      open: false,
      key: 0,
      mode: "list",
      editingIndex: undefined,
      selectedVariableType: undefined,
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

export const openVisibilityConditionDialog = ({ state }, _payload = {}) => {
  state.visibilityConditionDialog = {
    open: true,
    key: state.visibilityConditionDialog.key + 1,
    selectedVariableType: state.visibilityConditionDialog.selectedVariableType,
  };
};

export const openSaveLoadPaginationDialog = ({ state }, _payload = {}) => {
  state.saveLoadPaginationDialog = {
    open: true,
    key: state.saveLoadPaginationDialog.key + 1,
  };
};

export const openChildInteractionDialog = ({ state }, _payload = {}) => {
  state.childInteractionDialog = {
    open: true,
    key: state.childInteractionDialog.key + 1,
  };
};

export const closeSaveLoadPaginationDialog = ({ state }, _payload = {}) => {
  state.saveLoadPaginationDialog = {
    ...state.saveLoadPaginationDialog,
    open: false,
  };
};

export const closeChildInteractionDialog = ({ state }, _payload = {}) => {
  state.childInteractionDialog = {
    ...state.childInteractionDialog,
    open: false,
  };
};

export const openConditionalTextStylesDialog = ({ state }, _payload = {}) => {
  state.conditionalTextStylesDialog = {
    ...state.conditionalTextStylesDialog,
    open: true,
    mode: "list",
    editingIndex: undefined,
  };
};

export const closeConditionalTextStylesDialog = ({ state }, _payload = {}) => {
  state.conditionalTextStylesDialog = {
    ...state.conditionalTextStylesDialog,
    open: false,
    mode: "list",
    editingIndex: undefined,
  };
};

export const openConditionalTextStyleRuleEditor = (
  { state },
  { editingIndex, selectedVariableType } = {},
) => {
  state.conditionalTextStylesDialog = {
    ...state.conditionalTextStylesDialog,
    open: true,
    mode: "edit",
    key: state.conditionalTextStylesDialog.key + 1,
    editingIndex,
    selectedVariableType,
  };
};

export const showConditionalTextStylesDialogList = (
  { state },
  _payload = {},
) => {
  state.conditionalTextStylesDialog = {
    ...state.conditionalTextStylesDialog,
    mode: "list",
    editingIndex: undefined,
  };
};

export const closeVisibilityConditionDialog = ({ state }, _payload = {}) => {
  state.visibilityConditionDialog = {
    ...state.visibilityConditionDialog,
    open: false,
  };
};

export const setVisibilityConditionDialogSelectedVariableType = (
  { state },
  { selectedVariableType } = {},
) => {
  state.visibilityConditionDialog = {
    ...state.visibilityConditionDialog,
    selectedVariableType: selectedVariableType ?? "string",
  };
};

export const setConditionalTextStylesDialogSelectedVariableType = (
  { state },
  { selectedVariableType } = {},
) => {
  state.conditionalTextStylesDialog = {
    ...state.conditionalTextStylesDialog,
    selectedVariableType: selectedVariableType ?? "string",
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

export const selectVisibilityConditionDialog = ({ state }) => {
  return state.visibilityConditionDialog;
};

export const selectSaveLoadPaginationDialog = ({ state }) => {
  return state.saveLoadPaginationDialog;
};

export const selectChildInteractionDialog = ({ state }) => {
  return state.childInteractionDialog;
};

export const selectConditionalTextStylesDialog = ({ state }) => {
  return state.conditionalTextStylesDialog;
};

export const selectVisibilityConditionVariableTypeById = ({ state, props }) => {
  return toVisibilityConditionVariableTypeById(state.variablesData, {
    includeSaveDataAvailable: props.isInsideSaveLoadSlot === true,
  });
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
    includeSystem: true,
  });
  const fragmentLayoutOptions = getFragmentLayoutOptions(props.layoutsData);
  const visibilityConditionOptions = {
    includeSaveDataAvailable: props.isInsideSaveLoadSlot === true,
  };
  const visibilityConditionVariableOptions =
    toVisibilityConditionVariableOptions(
      state.variablesData,
      visibilityConditionOptions,
    );
  const visibilityConditionVariableTypeById =
    toVisibilityConditionVariableTypeById(
      state.variablesData,
      visibilityConditionOptions,
    );
  const variableOptionsWithNone = [
    { label: "None", value: "" },
    ...variableOptions,
  ];
  const values = toInspectorValues({
    values: state.values,
    firstTextStyleId,
  });
  const currentVisibilityCondition = splitVisibilityConditionFromWhen(
    values["$when"],
  ).visibilityCondition;
  const conditionalTextStyleRules = normalizeConditionalTextStyleRules(
    values.conditionalTextStyles,
  );
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
      variableOptions,
      variableOptionsWithNone,
      fragmentLayoutOptions,
      values,
      paginationSummary: getSaveLoadPaginationSummary({
        values,
        variablesData: state.variablesData,
      }),
      childInteractionSummary: getChildInteractionSummary(values),
      conditionalTextStylesSummary: getConditionalTextStylesSummary(
        conditionalTextStyleRules,
      ),
      visibilityConditionSummary: getVisibilityConditionSummary(
        currentVisibilityCondition,
        state.variablesData,
        visibilityConditionOptions,
      ),
      canAddSpriteImageVariant:
        !values.imageId || !values.hoverImageId || !values.clickImageId,
      showsGapField:
        capabilities.supportsDirection &&
        (values.direction === "vertical" || values.direction === "horizontal"),
      ...capabilities,
    },
  );
  const visibilityConditionDialogDefaults =
    createVisibilityConditionDialogDefaults(
      currentVisibilityCondition,
      visibilityConditionVariableTypeById,
    );
  const editingConditionalTextStyleRule =
    Number.isInteger(state.conditionalTextStylesDialog.editingIndex) &&
    state.conditionalTextStylesDialog.editingIndex >= 0
      ? conditionalTextStyleRules[
          state.conditionalTextStylesDialog.editingIndex
        ]
      : undefined;
  const conditionalTextStyleRuleDefaults =
    createConditionalTextStyleRuleDefaults(
      editingConditionalTextStyleRule,
      visibilityConditionVariableTypeById,
    );
  const selectedVisibilityConditionVariableType =
    state.visibilityConditionDialog.selectedVariableType ??
    visibilityConditionDialogDefaults.selectedVariableType;
  const selectedConditionalTextStyleVariableType =
    state.conditionalTextStylesDialog.selectedVariableType ??
    conditionalTextStyleRuleDefaults.selectedVariableType;

  return {
    values: state.values,
    actionsData: getLayoutInteractionActions(
      state.values,
      state.activeInteractionType,
    ),
    hiddenSystemActionModes: [...HIDDEN_LAYOUT_ACTION_MODES],
    config: {
      sections,
    },
    revealEffectOptions: REVEAL_EFFECT_OPTIONS,
    revealEffectValue: values.revealEffect,
    popover: state.popover,
    visibilityConditionDialog: state.visibilityConditionDialog,
    visibilityConditionDialogDefaults,
    visibilityConditionDialogForm: createVisibilityConditionForm({
      hasCondition: !!currentVisibilityCondition?.variableId,
      variableOptions: visibilityConditionVariableOptions,
    }),
    visibilityConditionDialogContext: {
      selectedVariableType: selectedVisibilityConditionVariableType,
    },
    saveLoadPaginationDialog: state.saveLoadPaginationDialog,
    saveLoadPaginationDialogDefaults:
      createSaveLoadPaginationDialogDefaults(values),
    saveLoadPaginationDialogForm: createSaveLoadPaginationForm({
      variableOptions,
    }),
    childInteractionDialog: state.childInteractionDialog,
    childInteractionDialogDefaults:
      createChildInteractionDialogDefaults(values),
    childInteractionDialogForm: createChildInteractionForm(),
    conditionalTextStylesDialog: state.conditionalTextStylesDialog,
    conditionalTextStyleItems: conditionalTextStyleRules.map((rule, index) => ({
      index,
      summary: getConditionalTextStyleRuleSummary(
        rule,
        state.textStylesData,
        state.variablesData,
        visibilityConditionOptions,
      ),
      canMoveUp: index > 0,
      canMoveDown: index < conditionalTextStyleRules.length - 1,
    })),
    conditionalTextStyleRuleDefaults,
    conditionalTextStyleRuleForm: createConditionalTextStyleRuleForm({
      variableOptions: visibilityConditionVariableOptions,
      textStyleOptions: textStyleItems,
    }),
    conditionalTextStyleRuleDialogContext: {
      selectedVariableType: selectedConditionalTextStyleVariableType,
    },
    imageSelectorDialog: state.imageSelectorDialog,
    tempSelectedImageId: state.tempSelectedImageId,
  };
};
