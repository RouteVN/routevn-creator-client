import { toFlatGroups } from "../../../internal/project/tree.js";
import { getInteractionActions } from "../../../internal/project/interactionPayload.js";
import { RUNTIME_ACTION_LABELS } from "../../../internal/runtimeActions.js";
import { parseRuntimeTemplateValue } from "../../../internal/runtimeFields.js";
import { getLayoutEditorElementDefinition } from "../../../internal/layoutEditorElementRegistry.js";
import { normalizeConditionalOverrideRules } from "./layoutEditPanelFeatures.js";

const ACTION_INTERACTION_LABELS = {
  click: "Click",
  rightClick: "Right Click",
  change: "Change",
};
const SETTINGS_ACTION_MODES = new Set([
  "nextLine",
  "resetStoryAtSection",
  "rollbackByOffset",
  "toggleSkipMode",
  "toggleDialogueUI",
  "showConfirmDialog",
  "hideConfirmDialog",
  "saveSlot",
  "loadSlot",
  "setDialogueTextSpeed",
  "setSaveLoadPagination",
  "incrementSaveLoadPagination",
  "decrementSaveLoadPagination",
  "setMenuPage",
  "setMenuEntryPoint",
]);

const ACTION_LABELS = {
  nextLine: "Next Line",
  sectionTransition: "Section Transition",
  resetStoryAtSection: "Reset Story At Section",
  toggleAutoMode: "Toggle Auto Mode",
  toggleSkipMode: "Toggle Skip Mode",
  toggleDialogueUI: "Toggle Dialogue Box Visibility",
  pushOverlay: "Push Overlay",
  popOverlay: "Pop Overlay",
  rollbackByOffset: "Rollback",
  updateVariable: "Update Variable",
  showConfirmDialog: "Show Confirm Dialog",
  hideConfirmDialog: "Hide Confirm Dialog",
  saveSlot: "Save Slot",
  loadSlot: "Load Slot",
  ...RUNTIME_ACTION_LABELS,
};

export const ACTION_INTERACTION_TYPES = ["click", "rightClick", "change"];

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
        svg: SETTINGS_ACTION_MODES.has(key) ? "settings" : `action-${key}`,
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

export const toImageOptions = (imagesData = {}) => {
  const imageGroups = toFlatGroups(imagesData);
  return imageGroups.flatMap((group) =>
    group.children
      .filter((item) => item.type === "image")
      .map((item) => ({
        label: item.name,
        value: item.id,
      })),
  );
};

export const toInspectorValues = ({
  values,
  firstTextStyleId,
  hiddenActionModes,
}) => {
  const capabilities =
    getLayoutEditorElementDefinition(values?.type)?.capabilities ?? {};
  const rawInitialValue = values?.initialValue;
  const parsedInitialValue = Number(rawInitialValue);
  const sliderRuntimeValueId =
    typeof values?.sliderRuntimeValueId === "string"
      ? values.sliderRuntimeValueId
      : (parseRuntimeTemplateValue(rawInitialValue) ?? "");
  const sliderManualInitialValue =
    typeof values?.sliderManualInitialValue === "number"
      ? values.sliderManualInitialValue
      : Number.isFinite(parsedInitialValue)
        ? parsedInitialValue
        : 0;
  const derivedAspectRatioLock =
    Number.isFinite(values?.aspectRatioLock) && values.aspectRatioLock > 0
      ? values.aspectRatioLock
      : undefined;
  const revealEffect =
    values?.type === "text-revealing" ||
    values?.type === "text-revealing-ref-dialogue-content"
      ? (values?.revealEffect ?? "typewriter")
      : values?.revealEffect;
  const direction =
    capabilities.supportsDirection === true &&
    values?.direction !== "horizontal" &&
    values?.direction !== "vertical"
      ? "absolute"
      : values?.direction;

  return {
    ...values,
    opacity: values?.opacity ?? 1,
    aspectRatioMode: derivedAspectRatioLock !== undefined ? "fixed" : "free",
    aspectRatioLock: derivedAspectRatioLock,
    revealEffect,
    fragmentLayoutId: values?.fragmentLayoutId ?? "",
    paginationMode: values?.paginationMode ?? "continuous",
    paginationSize: values?.paginationSize ?? 3,
    scroll: values?.scroll ?? false,
    direction,
    gapX: values?.gapX ?? 0,
    gapY: values?.gapY ?? 0,
    sliderRuntimeValueId,
    sliderManualInitialValue,
    particleId: values?.particleId ?? "",
    textStyleId: values?.textStyleId || firstTextStyleId || "",
    hoverTextStyleId: values?.hoverTextStyleId ?? "",
    clickTextStyleId: values?.clickTextStyleId ?? "",
    conditionalOverrides: normalizeConditionalOverrideRules(
      values?.conditionalOverrides,
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
