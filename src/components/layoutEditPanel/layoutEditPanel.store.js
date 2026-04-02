import { parseAndRender } from "jempl";
import { getFirstTextStyleId } from "../../constants/textStyles.js";
import { getVariableOptions } from "../../internal/project/projection.js";
import { getFragmentLayoutOptions } from "../../pages/layoutEditor/support/layoutFragments.js";
import { getLayoutEditorElementDefinition } from "../../internal/layoutEditorElementRegistry.js";
import { splitLayoutConditionFromWhen } from "../../internal/layoutConditions.js";
import { toVisibilityConditionTargetTypeByTarget } from "./support/layoutEditPanelFeatures.js";
import {
  createChildInteractionDialogDefaults,
  createChildInteractionForm,
  createConditionalTextStyleRuleDefaults,
  createConditionalTextStyleRuleForm,
  createSaveLoadPaginationDialogDefaults,
  createSaveLoadPaginationForm,
  createVisibilityConditionDialogDefaults,
  createVisibilityConditionForm,
  getChildInteractionSummary,
  getConditionalTextStyleRuleSummary,
  getConditionalTextStylesSummary,
  getSaveLoadPaginationSummary,
  getVisibilityConditionSummary,
  normalizeConditionalTextStyleRules,
  toVisibilityConditionTargetOptions,
} from "./support/layoutEditPanelFeatures.js";
import {
  ACTION_INTERACTION_TYPES,
  REVEAL_EFFECT_OPTIONS,
  getLayoutEditPanelSections,
  getLayoutInteractionActions,
  selectLayoutEditPanelFieldPopoverForm,
  toInspectorValues,
  toTextStyleOptions,
} from "./support/layoutEditPanelViewData.js";

const HIDDEN_LAYOUT_ACTION_MODES = new Set();

const createDefaultValues = () => ({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  opacity: 1,
  rotation: 0,
  anchor: {
    x: 0,
    y: 0,
  },
  direction: undefined,
  gap: 0,
  actions: {},
});

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
  state.visibilityConditionDialog.open = true;
  state.visibilityConditionDialog.key += 1;
};

export const openSaveLoadPaginationDialog = ({ state }, _payload = {}) => {
  state.saveLoadPaginationDialog.open = true;
  state.saveLoadPaginationDialog.key += 1;
};

export const openChildInteractionDialog = ({ state }, _payload = {}) => {
  state.childInteractionDialog.open = true;
  state.childInteractionDialog.key += 1;
};

export const closeSaveLoadPaginationDialog = ({ state }, _payload = {}) => {
  state.saveLoadPaginationDialog.open = false;
};

export const closeChildInteractionDialog = ({ state }, _payload = {}) => {
  state.childInteractionDialog.open = false;
};

export const openConditionalTextStylesDialog = ({ state }, _payload = {}) => {
  state.conditionalTextStylesDialog.open = true;
  state.conditionalTextStylesDialog.mode = "list";
  state.conditionalTextStylesDialog.editingIndex = undefined;
};

export const closeConditionalTextStylesDialog = ({ state }, _payload = {}) => {
  state.conditionalTextStylesDialog.open = false;
  state.conditionalTextStylesDialog.mode = "list";
  state.conditionalTextStylesDialog.editingIndex = undefined;
};

export const openConditionalTextStyleRuleEditor = (
  { state },
  { editingIndex, selectedVariableType } = {},
) => {
  state.conditionalTextStylesDialog.open = true;
  state.conditionalTextStylesDialog.mode = "edit";
  state.conditionalTextStylesDialog.key += 1;
  state.conditionalTextStylesDialog.editingIndex = editingIndex;
  state.conditionalTextStylesDialog.selectedVariableType = selectedVariableType;
};

export const showConditionalTextStylesDialogList = (
  { state },
  _payload = {},
) => {
  state.conditionalTextStylesDialog.mode = "list";
  state.conditionalTextStylesDialog.editingIndex = undefined;
};

export const closeVisibilityConditionDialog = ({ state }, _payload = {}) => {
  state.visibilityConditionDialog.open = false;
};

export const setVisibilityConditionDialogSelectedVariableType = (
  { state },
  { selectedVariableType } = {},
) => {
  state.visibilityConditionDialog.selectedVariableType =
    selectedVariableType ?? "string";
};

export const setConditionalTextStylesDialogSelectedVariableType = (
  { state },
  { selectedVariableType } = {},
) => {
  state.conditionalTextStylesDialog.selectedVariableType =
    selectedVariableType ?? "string";
};

export const selectFieldPopoverForm = ({ constants, props }, { name } = {}) => {
  return selectLayoutEditPanelFieldPopoverForm({ constants, props }, { name });
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

export const selectVisibilityConditionTargetTypeByTarget = ({
  state,
  props,
}) => {
  return toVisibilityConditionTargetTypeByTarget(state.variablesData, {
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
  const visibilityConditionTargetOptions = toVisibilityConditionTargetOptions(
    state.variablesData,
    visibilityConditionOptions,
  );
  const visibilityConditionTargetTypeByTarget =
    toVisibilityConditionTargetTypeByTarget(
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
    hiddenActionModes: HIDDEN_LAYOUT_ACTION_MODES,
  });
  const currentVisibilityCondition = splitLayoutConditionFromWhen(
    values["$when"],
  ).visibilityCondition;
  const conditionalTextStyleRules = normalizeConditionalTextStyleRules(
    values.conditionalTextStyles,
  );
  const capabilities =
    getLayoutEditorElementDefinition(props.itemType)?.capabilities ?? {};
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
      visibilityConditionTargetTypeByTarget,
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
      visibilityConditionTargetTypeByTarget,
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
      hasCondition: !!currentVisibilityCondition?.target,
      targetOptions: visibilityConditionTargetOptions,
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
        getVisibilityConditionSummary,
      ),
      canMoveUp: index > 0,
      canMoveDown: index < conditionalTextStyleRules.length - 1,
    })),
    conditionalTextStyleRuleDefaults,
    conditionalTextStyleRuleForm: createConditionalTextStyleRuleForm({
      targetOptions: visibilityConditionTargetOptions,
      textStyleOptions: textStyleItems,
    }),
    conditionalTextStyleRuleDialogContext: {
      selectedVariableType: selectedConditionalTextStyleVariableType,
    },
    imageSelectorDialog: state.imageSelectorDialog,
    tempSelectedImageId: state.tempSelectedImageId,
  };
};
