import {
  applyPreviewVariableOverrides,
  createChoicePreviewItems,
  createConfirmDialogPreviewData,
  createDialoguePreviewData,
  createHistoryLines,
  createPreviewRuntimeValues,
  createPreviewVariables,
  createRuntimeSaveSlots,
} from "./layoutEditorPreviewSupport.js";

export const createLayoutEditorPreviewData = ({
  layoutType,
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

  return {
    backgroundImageId:
      typeof backgroundImageId === "string" && backgroundImageId.length > 0
        ? backgroundImageId
        : undefined,
    variables: {
      ...applyPreviewVariableOverrides(
        createPreviewVariables(variablesData),
        variablesData,
        previewVariableValues,
      ),
    },
    runtime: {
      ...createPreviewRuntimeValues(
        previewVariableValues,
        dialogueDefaultValues,
      ),
      dialogueTextSpeed: dialogueRevealingSpeed,
    },
    dialogue,
    historyDialogue:
      layoutType === "history" ? createHistoryLines(historyDefaultValues) : [],
    choice: {
      items: createChoicePreviewItems(choicesData),
    },
    confirmDialog: createConfirmDialogPreviewData(),
    saveSlots:
      hasSaveLoadPreview === true || layoutType === "save-load"
        ? createRuntimeSaveSlots(saveLoadData)
        : [],
  };
};
