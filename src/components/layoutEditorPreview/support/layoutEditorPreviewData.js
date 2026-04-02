import {
  applyPreviewVariableOverrides,
  createChoicePreviewItems,
  createConfirmDialogPreviewData,
  createDialoguePreviewData,
  createPreviewFixedStateValues,
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
  previewRevealingSpeed,
  choicesData,
  saveLoadData,
} = {}) => {
  const { dialogue, dialogueRevealingSpeed } = createDialoguePreviewData({
    layoutType,
    dialogueDefaultValues,
    nvlDefaultValues,
    previewRevealingSpeed,
  });

  return {
    variables: {
      ...applyPreviewVariableOverrides(
        createPreviewVariables(variablesData),
        variablesData,
        previewVariableValues,
      ),
      _dialogueTextSpeed: dialogueRevealingSpeed,
    },
    ...createPreviewFixedStateValues(
      previewVariableValues,
      dialogueDefaultValues,
    ),
    dialogue,
    choice: {
      items: createChoicePreviewItems(choicesData),
    },
    confirmDialog: createConfirmDialogPreviewData(),
    saveSlots:
      hasSaveLoadPreview === true ||
      layoutType === "save" ||
      layoutType === "load"
        ? createRuntimeSaveSlots(saveLoadData)
        : [],
  };
};
