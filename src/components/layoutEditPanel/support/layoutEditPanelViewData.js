import { toFlatGroups, toFlatItems } from "../../../internal/project/tree.js";
import { getInteractionActions } from "../../../internal/project/interactionPayload.js";
import { RUNTIME_ACTION_LABELS } from "../../../internal/runtimeActions.js";
import { parseRuntimeTemplateValue } from "../../../internal/runtimeFields.js";
import { getLayoutEditorElementDefinition } from "../../../internal/layoutEditorElementRegistry.js";
import {
  getLayoutTextSummary,
  normalizeLayoutTextContent,
} from "../../../internal/layoutTextContent.js";
import { normalizeConditionalOverrideRules } from "./layoutEditPanelFeatures.js";
import {
  createTextRevealIndicatorAddItems,
  createTextRevealIndicatorListItems,
  toTextRevealIndicatorValues,
} from "./layoutEditPanelTextRevealIndicator.js";

const ACTION_INTERACTION_LABELS = {
  click: "Click",
  rightClick: "Right Click",
  scrollUp: "Scroll Up",
  scrollDown: "Scroll Down",
  change: "Change",
};
const SETTINGS_ACTION_MODES = new Set([
  "nextLine",
  "resetStoryAtSection",
  "rollbackByOffset",
  "toggleSkipMode",
  "startSkipMode",
  "stopSkipMode",
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
  startSkipMode: "Start Skip Mode",
  stopSkipMode: "Stop Skip Mode",
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

export const ACTION_INTERACTION_TYPES = [
  "click",
  "rightClick",
  "scrollUp",
  "scrollDown",
  "change",
];

export const REVEAL_EFFECT_OPTIONS = [
  { label: "Typewriter", value: "typewriter" },
  { label: "Soft Wipe", value: "softWipe" },
  { label: "None", value: "none" },
];

export const createTextContentDialogForm = () => ({
  title: "Text",
  fields: [
    {
      name: "content",
      type: "slot",
      slot: "text-content-editor",
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
});

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

export const toSoundOptions = (soundsData = {}) => {
  return toFlatItems(soundsData)
    .filter((item) => item.type === "sound")
    .map((item) => ({
      label: item.name,
      value: item.id,
    }));
};

export const toInspectorValues = ({
  values,
  firstTextStyleId,
  hiddenActionModes,
  variablesData,
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
  const indicator =
    capabilities.supportsTextRevealIndicator === true
      ? toTextRevealIndicatorValues(values?.indicator)
      : values?.indicator;
  const direction =
    capabilities.supportsDirection === true &&
    values?.direction !== "horizontal" &&
    values?.direction !== "vertical"
      ? "absolute"
      : values?.direction;
  const textContent =
    capabilities.supportsTextEditing === true
      ? normalizeLayoutTextContent(values?.content, {
          fallbackText: values?.text,
        })
      : values?.content;
  const textContentSummary =
    capabilities.supportsTextEditing === true
      ? getLayoutTextSummary(values?.content, {
          fallbackText: values?.text,
          variablesData,
        })
      : "";

  return {
    ...values,
    content: textContent,
    textContentSummary,
    opacity: values?.opacity ?? 1,
    aspectRatioMode: derivedAspectRatioLock !== undefined ? "fixed" : "free",
    aspectRatioLock: derivedAspectRatioLock,
    revealEffect,
    indicator,
    fragmentLayoutId: values?.fragmentLayoutId ?? "",
    paginationMode: values?.paginationMode ?? "continuous",
    paginationSize: values?.paginationSize ?? 3,
    scroll: values?.scroll ?? false,
    choiceItemIndex: values?.choiceItemIndex ?? 0,
    direction,
    gapX: values?.gapX ?? 0,
    gapY: values?.gapY ?? 0,
    field: values?.field ?? "",
    sliderRuntimeValueId,
    sliderManualInitialValue,
    particleId: values?.particleId ?? "",
    textStyleId: values?.textStyleId || firstTextStyleId || "",
    hoverTextStyleId: values?.hoverTextStyleId ?? "",
    clickTextStyleId: values?.clickTextStyleId ?? "",
    hoverSoundId: values?.hoverSoundId ?? "",
    clickSoundId: values?.clickSoundId ?? "",
    conditionalOverrides: normalizeConditionalOverrideRules(
      values?.conditionalOverrides,
    ),
    textRevealIndicatorAddItems: createTextRevealIndicatorAddItems(indicator),
    textRevealIndicatorItems: createTextRevealIndicatorListItems(indicator),
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
