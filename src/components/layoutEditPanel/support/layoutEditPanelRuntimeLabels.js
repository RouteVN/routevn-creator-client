import {
  DIALOGUE_CHARACTER_ID_CONDITION_TARGET,
  SAVE_DATA_AVAILABLE_CONDITION_TARGET,
} from "../../../internal/layoutConditions.js";
import { parseRuntimeConditionTarget } from "../../../internal/runtimeFields.js";

// Copy keys for the runtime fields and the special condition targets. Their
// names in runtimeFields.js and layoutConditions.js are English.
const RUNTIME_FIELD_LABEL_KEYS = Object.freeze({
  dialogueTextSpeed: "runtimeDialogueTextSpeedLabel",
  autoForwardDelay: "runtimeAutoForwardDelayLabel",
  skipUnseenText: "runtimeSkipUnseenTextLabel",
  skipTransitionsAndAnimations: "runtimeSkipTransitionsAndAnimationsLabel",
  soundVolume: "runtimeSoundVolumeLabel",
  musicVolume: "runtimeMusicVolumeLabel",
  muteAll: "runtimeMuteAllLabel",
  saveLoadPagination: "runtimeSaveLoadPaginationLabel",
  menuPage: "runtimeMenuPageLabel",
  menuEntryPoint: "runtimeMenuEntryPointLabel",
  autoMode: "runtimeAutoModeLabel",
  skipMode: "runtimeSkipModeLabel",
  dialogueUIHidden: "runtimeDialogueUIHiddenLabel",
  isLineCompleted: "runtimeIsLineCompletedLabel",
});

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
