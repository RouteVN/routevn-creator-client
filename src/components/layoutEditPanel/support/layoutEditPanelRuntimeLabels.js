import {
  DIALOGUE_CHARACTER_ID_CONDITION_TARGET,
  SAVE_DATA_AVAILABLE_CONDITION_TARGET,
} from "../../../internal/layoutConditions.js";
import { parseRuntimeConditionTarget } from "../../../internal/runtimeFields.js";
import { RUNTIME_FIELD_LABEL_KEYS } from "../../../internal/ui/runtimeFieldCopy.js";

// Copy keys for the special condition targets. Their names in
// layoutConditions.js are English.
const SPECIAL_CONDITION_TARGET_LABEL_KEYS = Object.freeze({
  [SAVE_DATA_AVAILABLE_CONDITION_TARGET]: "saveDataAvailableTargetLabel",
  [DIALOGUE_CHARACTER_ID_CONDITION_TARGET]: "dialogueCharacterTargetLabel",
});

export const getRuntimeFieldLabel = (runtimeId, fallback, copy = {}) =>
  copy[RUNTIME_FIELD_LABEL_KEYS[runtimeId]] ?? fallback;

// Variables keep their own names; runtime fields and special targets use the
// copy for the active locale.
export const getConditionTargetLabel = (target, fallback, copy = {}) => {
  const runtimeId = parseRuntimeConditionTarget(target);
  if (runtimeId) {
    return getRuntimeFieldLabel(runtimeId, fallback, copy);
  }

  return copy[SPECIAL_CONDITION_TARGET_LABEL_KEYS[target]] ?? fallback;
};
