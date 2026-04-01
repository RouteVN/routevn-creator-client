import {
  AUTO_MODE_CONDITION_ID,
  LINE_COMPLETED_CONDITION_ID,
  SKIP_MODE_CONDITION_ID,
  getRuntimeLayoutConditionItems,
} from "../../../layoutConditions.js";

export const createPreviewFixedStateValues = (
  previewVariableValues = {},
  dialogueDefaultValues = {},
) => {
  const fixedStateItems = getRuntimeLayoutConditionItems();

  return {
    isLineCompleted:
      previewVariableValues[LINE_COMPLETED_CONDITION_ID] ??
      dialogueDefaultValues?.["dialogue-is-line-completed"] ??
      fixedStateItems[LINE_COMPLETED_CONDITION_ID]?.value ??
      fixedStateItems[LINE_COMPLETED_CONDITION_ID]?.default ??
      false,
    autoMode:
      previewVariableValues[AUTO_MODE_CONDITION_ID] ??
      dialogueDefaultValues?.["dialogue-auto-mode"] ??
      fixedStateItems[AUTO_MODE_CONDITION_ID]?.value ??
      fixedStateItems[AUTO_MODE_CONDITION_ID]?.default ??
      false,
    skipMode:
      previewVariableValues[SKIP_MODE_CONDITION_ID] ??
      dialogueDefaultValues?.["dialogue-skip-mode"] ??
      fixedStateItems[SKIP_MODE_CONDITION_ID]?.value ??
      fixedStateItems[SKIP_MODE_CONDITION_ID]?.default ??
      false,
  };
};
