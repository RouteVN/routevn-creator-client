import { toFlatGroups } from "../../project/tree.js";
import {
  getInteractionActions,
  getInteractionPayload,
} from "../../project/interactionPayload.js";
import { normalizeConditionalTextStyleRules } from "./features/index.js";

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

export const ACTION_INTERACTION_TYPES = ["click", "rightClick"];

export const REVEAL_EFFECT_OPTIONS = [
  { label: "Typewriter", value: "typewriter" },
  { label: "Soft Wipe", value: "softWipe" },
  { label: "None", value: "none" },
];

export const getLayoutInteractionActions = (values, interactionType) => {
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

export const getLayoutEditPanelSections = ({ constants, resourceType }) => {
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

export const toTextStyleOptions = (textStylesData = {}) => {
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

export const toInspectorValues = ({
  values,
  firstTextStyleId,
  hiddenActionModes,
}) => {
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
