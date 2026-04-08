import { parseAndRender } from "jempl";
import { getFirstTextStyleId } from "../../constants/textStyles.js";
import { getVariableOptions } from "../../internal/project/projection.js";
import { toFlatItems } from "../../internal/project/tree.js";
import { getFragmentLayoutOptions } from "../../pages/layoutEditor/support/layoutFragments.js";
import { getLayoutEditorElementDefinition } from "../../internal/layoutEditorElementRegistry.js";
import { splitLayoutConditionFromWhen } from "../../internal/layoutConditions.js";
import { toVisibilityConditionTargetTypeByTarget } from "./support/layoutEditPanelFeatures.js";
import {
  createChildInteractionDialogDefaults,
  createChildInteractionForm,
  createConditionalOverrideAttributeDefaults,
  createConditionalOverrideAttributeForm,
  createConditionalOverrideConditionDefaults,
  createConditionalOverrideConditionForm,
  createSaveLoadPaginationDialogDefaults,
  createSaveLoadPaginationForm,
  createVisibilityConditionDialogDefaults,
  createVisibilityConditionForm,
  getChildInteractionSummary,
  getAvailableChildInteractionItems,
  getChildInteractionItems,
  hasChildInteractionInheritance,
  getConditionalOverrideAttributeOptions,
  getConditionalOverrideSummary,
  getSaveLoadPaginationSummary,
  getVisibilityConditionSummary,
  normalizeConditionalOverrideRules,
  toConditionalOverrideAttributeItems,
  toVisibilityConditionTargetOptions,
} from "./support/layoutEditPanelFeatures.js";
import {
  ACTION_INTERACTION_TYPES,
  REVEAL_EFFECT_OPTIONS,
  getLayoutEditPanelSections,
  getLayoutInteractionActions,
  selectLayoutEditPanelFieldPopoverForm,
  toImageOptions,
  toInspectorValues,
  toTextStyleOptions,
} from "./support/layoutEditPanelViewData.js";

const HIDDEN_LAYOUT_ACTION_MODES = new Set();
const POSITION_POPOVER_PRESET_PERCENTAGES = [
  0, 20, 25, 33.33, 50, 66.66, 70, 75,
];

const POSITION_POPOVER_AXIS_CONFIG = {
  x: {
    resolutionKey: "width",
    axisLabel: "Width",
    roundValue: true,
  },
  y: {
    resolutionKey: "height",
    axisLabel: "Height",
    roundValue: true,
  },
};

const roundPositionPopoverNumber = (value) => {
  return Number((value + Number.EPSILON).toFixed(2));
};

const clonePopoverForm = (form) => {
  if (!form || typeof form !== "object") {
    return form;
  }

  const nextForm = {
    ...form,
  };

  if (Array.isArray(form.fields)) {
    nextForm.fields = form.fields.map((field) => ({
      ...field,
    }));
  }

  if (form.actions && typeof form.actions === "object") {
    nextForm.actions = {
      ...form.actions,
    };

    if (Array.isArray(form.actions.buttons)) {
      nextForm.actions.buttons = form.actions.buttons.map((button) => ({
        ...button,
      }));
    }
  }

  return nextForm;
};

const buildPopoverForm = ({ form, name, projectResolution, value }) => {
  const axisConfig = POSITION_POPOVER_AXIS_CONFIG[name];
  if (!axisConfig) {
    return form;
  }

  const resolutionDimension = Number(
    projectResolution?.[axisConfig.resolutionKey],
  );
  if (!Number.isFinite(resolutionDimension) || resolutionDimension <= 0) {
    return form;
  }

  const nextForm = clonePopoverForm(form);
  const firstField = nextForm?.fields?.[0];
  if (!firstField) {
    return nextForm;
  }

  const currentValue = Number(value);
  let min = 0;
  let max = resolutionDimension;

  if (Number.isFinite(currentValue)) {
    if (currentValue < min) {
      min = Math.floor(currentValue);
    }
    if (currentValue > max) {
      max = Math.ceil(currentValue);
    }
  }

  firstField.type = "slider-with-input";
  firstField.min = min;
  firstField.max = max;
  firstField.step = 1;

  return nextForm;
};

const buildPositionPopoverContext = ({ name, projectResolution, value }) => {
  const axisConfig = POSITION_POPOVER_AXIS_CONFIG[name];
  if (!axisConfig) {
    return {};
  }

  const resolutionDimension = Number(
    projectResolution?.[axisConfig.resolutionKey],
  );
  if (!Number.isFinite(resolutionDimension) || resolutionDimension <= 0) {
    return {};
  }

  const numericValue = Number(value ?? 0);
  const percentage = Number.isFinite(numericValue)
    ? roundPositionPopoverNumber((numericValue / resolutionDimension) * 100)
    : 0;

  return {
    isPositionPopover: true,
    positionAxisLabel: axisConfig.axisLabel,
    positionResolutionDimension: resolutionDimension,
    positionPercentageLabel: `${percentage}%`,
    positionPresetItems: POSITION_POPOVER_PRESET_PERCENTAGES.map((preset) => ({
      label: `${preset}%`,
      percentage: preset,
      value: axisConfig.roundValue
        ? Math.round((resolutionDimension * preset) / 100)
        : roundPositionPopoverNumber((resolutionDimension * preset) / 100),
    })),
  };
};

const formatPositionPercentageLabel = ({ name, projectResolution, value }) => {
  const axisConfig = POSITION_POPOVER_AXIS_CONFIG[name];
  if (!axisConfig) {
    return undefined;
  }

  const resolutionDimension = Number(
    projectResolution?.[axisConfig.resolutionKey],
  );
  const numericValue = Number(value);
  if (
    !Number.isFinite(resolutionDimension) ||
    resolutionDimension <= 0 ||
    !Number.isFinite(numericValue)
  ) {
    return undefined;
  }

  return `${roundPositionPopoverNumber((numericValue / resolutionDimension) * 100)}%`;
};

const createDefaultValues = () => ({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  opacity: 1,
  aspectRatioLock: undefined,
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
    fullImagePreviewVisible: false,
    fullImagePreviewImageId: undefined,
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
    dropdownMenu: {
      isOpen: false,
      x: 0,
      y: 0,
      targetName: undefined,
      items: [],
    },
    saveLoadPaginationDialog: {
      open: false,
      key: 0,
    },
    childInteractionDialog: {
      open: false,
      key: 0,
    },
    conditionalOverrideConditionDialog: {
      open: false,
      key: 0,
      editingIndex: undefined,
      selectedVariableType: undefined,
    },
    conditionalOverrideAttributeDialog: {
      open: false,
      key: 0,
      editingIndex: undefined,
      fieldName: undefined,
    },
    imagesData: { tree: [], items: {} },
    textStylesData: { tree: [], items: {} },
    variablesData: { tree: [], items: {} },
    values: createDefaultValues(),
    activeInteractionType: "click",
    actionsEditorActions: {},
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

export const openPopoverForm = (
  { state },
  { x, y, name, form, projectResolution } = {},
) => {
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
    form: buildPopoverForm({
      form,
      name,
      projectResolution,
      value,
    }),
    context: {
      popoverFormValues,
      ...buildPositionPopoverContext({
        name,
        projectResolution,
        value,
      }),
    },
  };
};

export const updatePopoverFormContext = (
  { state },
  { values = {}, name, projectResolution } = {},
) => {
  const nextName = name ?? state.popover.name;

  state.popover.context = {
    popoverFormValues: values,
    ...buildPositionPopoverContext({
      name: nextName,
      projectResolution,
      value: values.value,
    }),
  };
  state.popover.defaultValues = values;
  state.popover.form = buildPopoverForm({
    form: state.popover.form,
    name: nextName,
    projectResolution,
    value: values.value,
  });
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
    context: {},
  };
};

export const openVisibilityConditionDialog = ({ state }, _payload = {}) => {
  state.visibilityConditionDialog.open = true;
  state.visibilityConditionDialog.key += 1;
};

export const showContextMenu = (
  { state },
  { targetName, x, y, items } = {},
) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetName = targetName;
  state.dropdownMenu.items = items ?? [
    { label: "Delete", type: "item", value: "delete" },
  ];
};

export const hideContextMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.x = 0;
  state.dropdownMenu.y = 0;
  state.dropdownMenu.targetName = undefined;
  state.dropdownMenu.items = [];
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

export const openConditionalOverrideConditionDialog = (
  { state },
  { editingIndex, selectedVariableType } = {},
) => {
  state.conditionalOverrideConditionDialog.open = true;
  state.conditionalOverrideConditionDialog.key += 1;
  state.conditionalOverrideConditionDialog.editingIndex = editingIndex;
  state.conditionalOverrideConditionDialog.selectedVariableType =
    selectedVariableType;
};

export const closeConditionalOverrideConditionDialog = (
  { state },
  _payload = {},
) => {
  state.conditionalOverrideConditionDialog.open = false;
  state.conditionalOverrideConditionDialog.editingIndex = undefined;
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

export const setConditionalOverrideConditionDialogSelectedVariableType = (
  { state },
  { selectedVariableType } = {},
) => {
  state.conditionalOverrideConditionDialog.selectedVariableType =
    selectedVariableType ?? "string";
};

export const openConditionalOverrideAttributeDialog = (
  { state },
  { editingIndex, fieldName } = {},
) => {
  state.conditionalOverrideAttributeDialog.open = true;
  state.conditionalOverrideAttributeDialog.key += 1;
  state.conditionalOverrideAttributeDialog.editingIndex = editingIndex;
  state.conditionalOverrideAttributeDialog.fieldName = fieldName;
};

export const closeConditionalOverrideAttributeDialog = (
  { state },
  _payload = {},
) => {
  state.conditionalOverrideAttributeDialog.open = false;
  state.conditionalOverrideAttributeDialog.editingIndex = undefined;
  state.conditionalOverrideAttributeDialog.fieldName = undefined;
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
  state.tempSelectedImageId =
    typeof name === "string" ? state.values?.[name] : undefined;
};

export const closeImageSelectorDialog = ({ state }, _payload = {}) => {
  state.imageSelectorDialog = {
    open: false,
    name: undefined,
  };
  state.tempSelectedImageId = undefined;
};

export const showFullImagePreview = ({ state }, { imageId } = {}) => {
  state.fullImagePreviewVisible = true;
  state.fullImagePreviewImageId = imageId;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
};

export const setValues = ({ state }, { values } = {}) => {
  state.values = values ?? {};
  state.actionsEditorActions = getLayoutInteractionActions(
    state.values,
    state.activeInteractionType,
  );
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

export const syncActionsEditorActions = (
  { state },
  { interactionType } = {},
) => {
  const nextInteractionType = ACTION_INTERACTION_TYPES.includes(interactionType)
    ? interactionType
    : state.activeInteractionType;

  state.actionsEditorActions = getLayoutInteractionActions(
    state.values,
    nextInteractionType,
  );
};

export const setActionsEditorActions = ({ state }, { actions } = {}) => {
  state.actionsEditorActions =
    actions && typeof actions === "object" && !Array.isArray(actions)
      ? actions
      : {};
};

export const selectActiveInteractionType = ({ state }) => {
  return state.activeInteractionType ?? "click";
};

export const setTextStylesData = ({ state }, { textStylesData } = {}) => {
  state.textStylesData = textStylesData;
};

export const setImagesData = ({ state }, { imagesData } = {}) => {
  state.imagesData = imagesData;
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

export const selectDropdownMenu = ({ state }) => {
  return state.dropdownMenu;
};

export const selectSaveLoadPaginationDialog = ({ state }) => {
  return state.saveLoadPaginationDialog;
};

export const selectChildInteractionDialog = ({ state }) => {
  return state.childInteractionDialog;
};

export const selectConditionalOverrideConditionDialog = ({ state }) => {
  return state.conditionalOverrideConditionDialog;
};

export const selectConditionalOverrideAttributeDialog = ({ state }) => {
  return state.conditionalOverrideAttributeDialog;
};

export const selectVisibilityConditionTargetTypeByTarget = ({
  state,
  props,
}) => {
  return toVisibilityConditionTargetTypeByTarget(state.variablesData, {
    includeSaveDataAvailable: props.isInsideSaveLoadSlot === true,
  });
};

export const selectTextStyleOptions = ({ state }) => {
  return toTextStyleOptions(state.textStylesData);
};

export const selectViewData = ({ state, props, constants }) => {
  const textStyleItems = toTextStyleOptions(state.textStylesData);
  const imageItems = toImageOptions(state.imagesData);
  const imageFolderItems = toFlatItems(state.imagesData).filter(
    (item) => item.type === "folder",
  );
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
  const supportsWidthMode = props.itemType?.startsWith("text") === true;
  const widthMode =
    supportsWidthMode && values.width === undefined ? "auto" : "fixed";
  const currentVisibilityCondition = splitLayoutConditionFromWhen(
    values["$when"],
  ).visibilityCondition;
  const conditionalOverrideRules = normalizeConditionalOverrideRules(
    values.conditionalOverrides,
  );
  const conditionalOverrideItems = conditionalOverrideRules.map(
    (rule, index) => ({
      index,
      summary: getConditionalOverrideSummary(
        rule,
        state.variablesData,
        visibilityConditionOptions,
        getVisibilityConditionSummary,
      ),
      attributeItems: toConditionalOverrideAttributeItems(
        rule,
        state.textStylesData,
        state.imagesData,
      ),
    }),
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
      isInsideDirectedContainer: props.isInsideDirectedContainer === true,
      textStyleItems,
      textStyleItemsWithNone,
      variableOptions,
      variableOptionsWithNone,
      fragmentLayoutOptions,
      values,
      xPercentageLabel: formatPositionPercentageLabel({
        name: "x",
        projectResolution: props.projectResolution,
        value: values.x,
      }),
      yPercentageLabel: formatPositionPercentageLabel({
        name: "y",
        projectResolution: props.projectResolution,
        value: values.y,
      }),
      widthPercentageLabel: formatPositionPercentageLabel({
        name: "x",
        projectResolution: props.projectResolution,
        value: values.width,
      }),
      supportsWidthMode,
      widthMode,
      heightPercentageLabel: formatPositionPercentageLabel({
        name: "y",
        projectResolution: props.projectResolution,
        value: values.height,
      }),
      paginationSummary: getSaveLoadPaginationSummary({
        values,
        variablesData: state.variablesData,
      }),
      childInteractionSummary: getChildInteractionSummary(values),
      childInteractionItems: getChildInteractionItems(values),
      hasChildInteractionInheritance: hasChildInteractionInheritance(values),
      canAddChildInteractionInheritance:
        getAvailableChildInteractionItems(values).length > 0,
      canAddTextStyleVariant:
        !values.hoverTextStyleId || !values.clickTextStyleId,
      conditionalOverrideItems,
      visibilityConditionSummary: getVisibilityConditionSummary(
        currentVisibilityCondition,
        state.variablesData,
        visibilityConditionOptions,
      ),
      hasVisibilityCondition: !!currentVisibilityCondition?.target,
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
  const editingConditionalOverrideRule =
    Number.isInteger(state.conditionalOverrideConditionDialog.editingIndex) &&
    state.conditionalOverrideConditionDialog.editingIndex >= 0
      ? conditionalOverrideRules[
          state.conditionalOverrideConditionDialog.editingIndex
        ]
      : undefined;
  const conditionalOverrideConditionDefaults =
    createConditionalOverrideConditionDefaults(
      editingConditionalOverrideRule,
      visibilityConditionTargetTypeByTarget,
    );
  const editingConditionalOverrideAttributeRule =
    Number.isInteger(state.conditionalOverrideAttributeDialog.editingIndex) &&
    state.conditionalOverrideAttributeDialog.editingIndex >= 0
      ? conditionalOverrideRules[
          state.conditionalOverrideAttributeDialog.editingIndex
        ]
      : undefined;
  const conditionalOverrideAttributeOptions =
    getConditionalOverrideAttributeOptions({
      rule: editingConditionalOverrideAttributeRule,
      includeFieldName: state.conditionalOverrideAttributeDialog.fieldName,
      capabilities,
    });
  const conditionalOverrideAttributeDefaults =
    createConditionalOverrideAttributeDefaults(
      editingConditionalOverrideAttributeRule,
      state.conditionalOverrideAttributeDialog.fieldName,
      conditionalOverrideAttributeOptions,
    );
  const selectedVisibilityConditionVariableType =
    state.visibilityConditionDialog.selectedVariableType ??
    visibilityConditionDialogDefaults.selectedVariableType;
  const selectedConditionalOverrideVariableType =
    state.conditionalOverrideConditionDialog.selectedVariableType ??
    conditionalOverrideConditionDefaults.selectedVariableType;

  return {
    values: state.values,
    actionsData: state.actionsEditorActions,
    hiddenSystemActionModes: [...HIDDEN_LAYOUT_ACTION_MODES],
    config: {
      sections,
    },
    revealEffectOptions: REVEAL_EFFECT_OPTIONS,
    revealEffectValue: values.revealEffect,
    popover: state.popover,
    visibilityConditionDialog: state.visibilityConditionDialog,
    dropdownMenu: state.dropdownMenu,
    visibilityConditionDialogDefaults,
    visibilityConditionDialogForm: createVisibilityConditionForm({
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
    conditionalOverrideConditionDialog:
      state.conditionalOverrideConditionDialog,
    conditionalOverrideItems,
    conditionalOverrideConditionDefaults,
    conditionalOverrideConditionForm: createConditionalOverrideConditionForm({
      targetOptions: visibilityConditionTargetOptions,
      submitLabel: editingConditionalOverrideRule ? "Save" : "Create",
    }),
    conditionalOverrideConditionDialogContext: {
      selectedVariableType: selectedConditionalOverrideVariableType,
    },
    conditionalOverrideAttributeDialog:
      state.conditionalOverrideAttributeDialog,
    conditionalOverrideAttributeDefaults,
    conditionalOverrideAttributeForm: createConditionalOverrideAttributeForm({
      attributeOptions: conditionalOverrideAttributeOptions,
      textStyleOptions: textStyleItems,
      imageOptions: imageItems,
      submitLabel: state.conditionalOverrideAttributeDialog.fieldName
        ? "Save"
        : "Add",
    }),
    conditionalOverrideAttributeDialogContext: {
      hasAttributeOptions: conditionalOverrideAttributeOptions.length > 0,
    },
    imageSelectorDialog: state.imageSelectorDialog,
    tempSelectedImageId: state.tempSelectedImageId,
    imageFolderItems,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewImageId: state.fullImagePreviewImageId,
  };
};
