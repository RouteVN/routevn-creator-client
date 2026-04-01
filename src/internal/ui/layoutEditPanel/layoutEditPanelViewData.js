import { parseAndRender } from "jempl";
import { toFlatGroups } from "../../project/tree.js";
import { getFirstTextStyleId } from "../../../constants/textStyles.js";
import { getVariableOptions } from "../../project/projection.js";
import { getFragmentLayoutOptions } from "../../layoutFragments.js";
import {
  getInteractionActions,
  getInteractionPayload,
} from "../../project/interactionPayload.js";
import { getLayoutEditorElementDefinition } from "../../layoutEditorElementRegistry.js";
import { splitLayoutConditionFromWhen } from "../../layoutConditions.js";
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
  toVisibilityConditionVariableOptions,
  toVisibilityConditionVariableTypeById,
} from "./features/index.js";

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
  rollbackByOffset: "Rollback",
  updateVariable: "Update Variable",
  showConfirmDialog: "Show Confirm Dialog",
  hideConfirmDialog: "Hide Confirm Dialog",
  saveSlot: "Save Slot",
  loadSlot: "Load Slot",
};

const ACTION_INTERACTION_TYPES = ["click", "rightClick"];

const REVEAL_EFFECT_OPTIONS = [
  { label: "Typewriter", value: "typewriter" },
  { label: "Soft Wipe", value: "softWipe" },
  { label: "None", value: "none" },
];

const getLayoutInteractionActions = (values, interactionType) => {
  return getInteractionActions(values?.[interactionType]);
};

const toLayoutActionItems = (values, hiddenActionModes) => {
  return ACTION_INTERACTION_TYPES.flatMap((interactionType) =>
    Object.entries(getLayoutInteractionActions(values, interactionType))
      .filter(([key]) => !hiddenActionModes.has(key))
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

const toInspectorValues = ({ values, firstTextStyleId, hiddenActionModes }) => {
  const revealEffect =
    values?.type === "text-revealing-ref-dialogue-content"
      ? (values?.revealEffect ?? "typewriter")
      : values?.revealEffect;
  const variableId = getSliderBoundVariableId(values);

  return {
    ...values,
    opacity: values?.opacity ?? 1,
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
    actions: toLayoutActionItems(values, hiddenActionModes),
  };
};

export const selectLayoutEditPanelFieldPopoverForm = (
  { constants, props },
  { name } = {},
) => {
  if (!name) {
    return undefined;
  }

  const sections = getLayoutEditPanelSections({
    constants,
    resourceType: props.resourceType,
  });

  return findFieldPopoverFormInSections(sections, name);
};

export const selectLayoutEditPanelViewData = ({
  state,
  props,
  constants,
  hiddenActionModes,
}) => {
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
    hiddenActionModes,
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
    hiddenSystemActionModes: [...hiddenActionModes],
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
        getVisibilityConditionSummary,
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
