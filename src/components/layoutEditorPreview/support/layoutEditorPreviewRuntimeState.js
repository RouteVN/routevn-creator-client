import {
  AUTO_MODE_CONDITION_TARGET,
  LINE_COMPLETED_CONDITION_TARGET,
  SKIP_MODE_CONDITION_TARGET,
  getRuntimeLayoutConditionItems,
} from "../../../internal/layoutConditions.js";

export const createPreviewFixedStateValues = (
  previewVariableValues = {},
  dialogueDefaultValues = {},
) => {
  const fixedStateItems = getRuntimeLayoutConditionItems();

  return {
    isLineCompleted:
      previewVariableValues[LINE_COMPLETED_CONDITION_TARGET] ??
      dialogueDefaultValues?.["dialogue-is-line-completed"] ??
      fixedStateItems[LINE_COMPLETED_CONDITION_TARGET]?.value ??
      fixedStateItems[LINE_COMPLETED_CONDITION_TARGET]?.default ??
      false,
    autoMode:
      previewVariableValues[AUTO_MODE_CONDITION_TARGET] ??
      dialogueDefaultValues?.["dialogue-auto-mode"] ??
      fixedStateItems[AUTO_MODE_CONDITION_TARGET]?.value ??
      fixedStateItems[AUTO_MODE_CONDITION_TARGET]?.default ??
      false,
    skipMode:
      previewVariableValues[SKIP_MODE_CONDITION_TARGET] ??
      dialogueDefaultValues?.["dialogue-skip-mode"] ??
      fixedStateItems[SKIP_MODE_CONDITION_TARGET]?.value ??
      fixedStateItems[SKIP_MODE_CONDITION_TARGET]?.default ??
      false,
  };
};
