import { getRuntimeFieldItems } from "../runtimeFields.js";
import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "./sceneEditor/commandLineCopy.js";

// Copy keys in layoutEditPanel for the runtime fields' names, which are
// English in runtimeFields.js. Their descriptions are in commandLinePage; see
// COMMAND_LINE_COPY_KEYS.
export const RUNTIME_FIELD_LABEL_KEYS = Object.freeze({
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

// The runtime fields' names and descriptions in the active locale, by id.
export const selectRuntimeFieldTexts = (i18n) => {
  const labelCopy = i18n.layoutEditPanel;
  const descriptionCopy = selectCommandLineCopy(i18n);

  return Object.fromEntries(
    Object.values(getRuntimeFieldItems()).map((field) => [
      field.id,
      {
        name: labelCopy[RUNTIME_FIELD_LABEL_KEYS[field.id]] ?? field.name,
        description: localizeCommandLineText(
          field.description,
          descriptionCopy,
        ),
      },
    ]),
  );
};
