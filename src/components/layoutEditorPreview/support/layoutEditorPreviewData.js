import {
  applyPreviewVariableOverrides,
  createChoicePreviewItems,
  createConfirmDialogPreviewData,
  createDialoguePreviewData,
  createHistoryLines,
  createPreviewRuntimeValues,
  createPreviewVariables,
  createRuntimeSaveSlots,
  getLayoutPreviewVariableItems,
  usesSaveLoadPreviewInLayout,
  visitLayoutItemsWithFragments,
} from "./layoutEditorPreviewSupport.js";

const DIALOGUE_LAYOUT_TYPES = new Set([
  "dialogue",
  "dialogue-adv",
  "nvl",
  "dialogue-nvl",
]);
const DIALOGUE_ITEM_TYPES = new Set([
  "text-ref-character-name",
  "text-revealing-ref-dialogue-content",
  "container-ref-dialogue-line",
  "text-ref-dialogue-line-character-name",
  "text-ref-dialogue-line-content",
]);
const CHOICE_ITEM_TYPES = new Set([
  "container-ref-choice-item",
  "text-ref-choice-item-content",
]);
const HISTORY_ITEM_TYPES = new Set([
  "container-ref-history-line",
  "text-ref-history-line-character-name",
  "text-ref-history-line-content",
]);
const CONFIRM_DIALOG_ITEM_TYPES = new Set([
  "container-ref-confirm-dialog-ok",
  "container-ref-confirm-dialog-cancel",
]);

const hasLayoutTraversalContext = ({
  layoutType,
  currentLayoutId,
  currentLayoutData,
  hasSaveLoadPreview,
} = {}) => {
  if (
    layoutType !== undefined ||
    currentLayoutId ||
    hasSaveLoadPreview === true
  ) {
    return true;
  }

  return Object.keys(currentLayoutData?.items ?? {}).length > 0;
};

const collectLayoutPreviewSections = ({
  layoutType,
  currentLayoutId,
  currentLayoutData,
  layoutsData,
  variablesData,
  hasSaveLoadPreview,
} = {}) => {
  const previewVariableItems = getLayoutPreviewVariableItems({
    currentLayoutId,
    currentLayoutData,
    currentLayoutType: layoutType,
    layoutsData,
    variablesData,
  });
  const includePreviewVariables = previewVariableItems.some(
    (item) => item?.source !== "runtime",
  );
  const includePreviewRuntimeOverrides = previewVariableItems.some(
    (item) => item?.source === "runtime",
  );
  const includeSaveLoad =
    hasSaveLoadPreview === true ||
    usesSaveLoadPreviewInLayout({
      currentLayoutId,
      currentLayoutData,
      currentLayoutType: layoutType,
      layoutsData,
      layoutId: currentLayoutId,
    });
  const sections = {
    includePreviewVariables,
    includeRuntime: false,
    includeDialogue: DIALOGUE_LAYOUT_TYPES.has(layoutType),
    includeChoice: layoutType === "choice",
    includeHistory: layoutType === "history",
    includeConfirmDialog: layoutType === "confirmDialog",
    includeSaveLoad: includeSaveLoad || layoutType === "save-load",
  };

  visitLayoutItemsWithFragments(
    {
      currentLayoutId,
      currentLayoutData,
      currentLayoutType: layoutType,
      layoutsData,
      layoutId: currentLayoutId,
    },
    ({ item, layoutType: visitedLayoutType }) => {
      if (DIALOGUE_LAYOUT_TYPES.has(visitedLayoutType)) {
        sections.includeDialogue = true;
      }

      if (visitedLayoutType === "choice") {
        sections.includeChoice = true;
      }

      if (visitedLayoutType === "history") {
        sections.includeHistory = true;
      }

      if (visitedLayoutType === "confirmDialog") {
        sections.includeConfirmDialog = true;
      }

      if (DIALOGUE_ITEM_TYPES.has(item?.type)) {
        sections.includeDialogue = true;
      }

      if (CHOICE_ITEM_TYPES.has(item?.type)) {
        sections.includeChoice = true;
      }

      if (HISTORY_ITEM_TYPES.has(item?.type)) {
        sections.includeHistory = true;
      }

      if (CONFIRM_DIALOG_ITEM_TYPES.has(item?.type)) {
        sections.includeConfirmDialog = true;
      }

      return (
        sections.includeDialogue &&
        sections.includeChoice &&
        sections.includeHistory &&
        sections.includeConfirmDialog
      );
    },
  );

  sections.includeRuntime =
    sections.includeDialogue ||
    sections.includeSaveLoad ||
    includePreviewRuntimeOverrides ||
    sections.includePreviewVariables;

  return sections;
};

export const createLayoutEditorPreviewData = ({
  layoutType,
  currentLayoutId,
  currentLayoutData,
  layoutsData,
  hasSaveLoadPreview,
  variablesData,
  previewVariableValues,
  dialogueDefaultValues,
  nvlDefaultValues,
  historyDefaultValues,
  previewRevealingSpeed,
  choicesData,
  saveLoadData,
  backgroundImageId,
} = {}) => {
  const { dialogue, dialogueRevealingSpeed } = createDialoguePreviewData({
    layoutType,
    dialogueDefaultValues,
    nvlDefaultValues,
    previewRevealingSpeed,
  });
  const backgroundPreviewImageId =
    typeof backgroundImageId === "string" && backgroundImageId.length > 0
      ? backgroundImageId
      : undefined;
  const previewVariables = {
    ...applyPreviewVariableOverrides(
      createPreviewVariables(variablesData),
      variablesData,
      previewVariableValues,
    ),
  };
  const runtime = {
    ...createPreviewRuntimeValues(previewVariableValues, dialogueDefaultValues),
    dialogueTextSpeed: dialogueRevealingSpeed,
  };
  const historyDialogue =
    layoutType === "history" ? createHistoryLines(historyDefaultValues) : [];
  const choice = {
    items: createChoicePreviewItems(choicesData),
  };
  const confirmDialog = createConfirmDialogPreviewData();
  const saveSlots =
    hasSaveLoadPreview === true || layoutType === "save-load"
      ? createRuntimeSaveSlots(saveLoadData)
      : [];

  if (
    !hasLayoutTraversalContext({
      layoutType,
      currentLayoutId,
      currentLayoutData,
      hasSaveLoadPreview,
    })
  ) {
    return {
      backgroundImageId: backgroundPreviewImageId,
      variables: previewVariables,
      runtime,
      dialogue,
      historyDialogue,
      choice,
      confirmDialog,
      saveSlots,
    };
  }

  const sections = collectLayoutPreviewSections({
    layoutType,
    currentLayoutId,
    currentLayoutData,
    layoutsData,
    variablesData,
    hasSaveLoadPreview,
  });
  const previewData = {};

  if (backgroundPreviewImageId) {
    previewData.backgroundImageId = backgroundPreviewImageId;
  }

  if (sections.includePreviewVariables) {
    previewData.variables = previewVariables;
  }

  if (sections.includeRuntime) {
    previewData.runtime = runtime;
  }

  if (sections.includeDialogue) {
    previewData.dialogue = dialogue;
  }

  if (sections.includeHistory) {
    previewData.historyDialogue = createHistoryLines(historyDefaultValues);
  }

  if (sections.includeChoice) {
    previewData.choice = choice;
  }

  if (sections.includeConfirmDialog) {
    previewData.confirmDialog = confirmDialog;
  }

  if (sections.includeSaveLoad) {
    previewData.saveSlots = createRuntimeSaveSlots(saveLoadData);
  }

  return previewData;
};
