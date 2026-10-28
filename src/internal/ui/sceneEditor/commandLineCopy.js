import {
  formatI18nCopy,
  selectI18nCopy,
  selectPluralCopy,
} from "../i18nCopy.js";

const COMMAND_LINE_COPY_KEYS = Object.freeze({
  "A resource is required.": "resourceRequiredMessage",
  "Add Value": "addValueButton",
  "Choose a control...": "chooseControlPlaceholder",
  "Choose a layout...": "chooseLayoutPlaceholder",
  "Choose a character...": "chooseCharacterPlaceholder",
  "Choose a string variable for this input field.":
    "chooseStringVariableFieldWarning",
  "Choose a string variable...": "chooseStringVariablePlaceholder",
  "Choose a value...": "chooseValuePlaceholder",
  "Choose a variable...": "chooseVariablePlaceholder",
  "Channel name must be unique.": "channelNameUnique",
  "Condition comparison value is invalid.": "conditionComparisonValueInvalid",
  "Condition enum value is invalid.": "conditionEnumValueInvalid",
  "Condition is unsupported.": "conditionUnsupported",
  "Condition operator is unsupported.": "conditionOperatorUnsupported",
  "Condition type is unsupported.": "conditionTypeUnsupported",
  "Enter number...": "enterNumberPlaceholder",
  "Enter text...": "enterTextPlaceholder",
  "Failed to create voice.": "failedCreateVoice",
  "Failed to load audio waveform.": "failedLoadAudioWaveform",
  "Failed to upload voice.": "failedUploadVoice",
  "Invalid file format. Please upload an audio file (.mp3, .wav, or .ogg).":
    "invalidVoiceFileFormat",
  "Map every input field to a string variable.":
    "mapEveryInputFieldToStringVariable",
  "No input fields found.": "noInputFieldsFound",
  "Please add at least one branch.": "addBranchRequired",
  "Please add at least one valid variable operation.":
    "validVariableOperationRequired",
  "Please select an input layout.": "selectInputLayoutRequired",
  "Search...": "searchPlaceholder",
  "Select an option": "selectOptionPlaceholder",
  "Select a scene before adding voice audio.": "selectSceneBeforeVoiceAudio",
  "Select a voice audio file first.": "selectVoiceAudioFirst",
  "Speaker's face that appears on top of the dialogue box. For body sprites use the Character Sprites action":
    "speakerSpriteTooltip",
  "Show this sprite on following dialogue lines.": "persistSpriteDescription",
  Spritesheet: "spritesheetLabel",
  Spritesheets: "spritesheetsLabel",
  "The default branch must be the last branch.": "defaultBranchMustBeLast",
  "The selected input layout does not contain input fields.":
    "inputLayoutHasNoFields",
  "Variable operation value is invalid.": "variableOperationValueInvalid",
  "Choose an operation...": "chooseOperationPlaceholder",
  "Decrement the current save/load pagination page.":
    "decrementSaveLoadPageDescription",
  "Increment the current save/load pagination page.":
    "incrementSaveLoadPageDescription",
  "Leave empty for auto, or use a fixed value like 1, ${slot.slotId}, or _event.slotId":
    "slotIdDescription",
  "Auto only works inside a Save/Load Slot container. Enter a slot id.":
    "autoSlotOutsideSlotContainer",
  "Pop the current overlay and return to the previous view.":
    "popOverlayDescription",
  "Single Line applies only to the next line. Persistent keeps this config active until changed":
    "nextLineConfigModeTooltip",
  "Specific Value lets you enter a value. Current Value uses the value from the triggering control.":
    "runtimeValueSourceTooltip",
  "When the auto-advance timer starts counting. 'Text Complete' waits for the text animation to finish first. 'Line Start' starts the timer immediately when the line begins":
    "autoAdvanceTimerStartTooltip",
  // The runtime field descriptions in runtimeFields.js.
  "Controls the default dialogue text reveal speed.":
    "dialogueTextSpeedDescription",
  "Controls the default auto mode delay in milliseconds.":
    "autoForwardDelayDescription",
  "When enabled, skip mode can continue through lines the player has not viewed yet.":
    "skipUnseenTextDescription",
  "When enabled, transitions and animations are skipped during presentation.":
    "skipTransitionsAndAnimationsDescription",
  "Controls the effective sound effects volume.": "soundVolumeDescription",
  "Controls the effective music volume.": "musicVolumeDescription",
  "Controls whether all audio output is muted.": "muteAllDescription",
  "Tracks the current save/load pagination page for the active context.":
    "saveLoadPaginationDescription",
  "Tracks the current menu page id for the active UI flow.":
    "menuPageDescription",
  "Tracks how the current menu flow was opened for the active context.":
    "menuEntryPointDescription",
  "Reflects whether auto mode is currently active.": "autoModeDescription",
  "Reflects whether skip mode is currently active.": "skipModeDescription",
  "Reflects whether the dialogue UI is currently hidden.":
    "dialogueUIHiddenDescription",
  "Reflects whether the current line has completed its presentation.":
    "isLineCompletedDescription",
});

export const selectCommandLineCopy = (i18n = {}) => {
  return selectI18nCopy(i18n, [
    "resourcePages",
    "sceneEditorPage",
    "commandLinePage",
  ]);
};

export const localizeCommandLineText = (value, copy = {}) => {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }

  const copyKey = COMMAND_LINE_COPY_KEYS[value] ?? value;
  return copy[copyKey] ?? copy[value] ?? value;
};

export const formatCommandLineCopy = (template, replacements = {}, copy = {}) =>
  formatI18nCopy(localizeCommandLineText(template, copy), replacements);

// English text for the count messages, used when a caller passes no catalog.
const DEFAULT_COMMAND_LINE_PLURAL_COPY = Object.freeze({
  actionCount_one: "{count} action",
  actionCount_other: "{count} actions",
  nestedActionCount_one: "{count} nested action",
  nestedActionCount_other: "{count} nested actions",
  rollbackLineCount_one: "Rollback by {count} line",
  rollbackLineCount_other: "Rollback by {count} lines",
  branchCount_one: "{count} branch",
  branchCount_other: "{count} branches",
});

// Formats a count message such as `actionCount`, so that each language can
// place the count and pick its plural form. `dateTime` is the active
// locale's catalog, which sets the plural rules.
export const formatCommandLinePluralCopy = (key, count, copy = {}, dateTime) =>
  formatI18nCopy(
    selectPluralCopy(copy, key, count, dateTime) ??
      selectPluralCopy(DEFAULT_COMMAND_LINE_PLURAL_COPY, key, count, dateTime),
    { count },
  );

export const formatCommandLineActionCount = (count, copy = {}, dateTime) =>
  formatCommandLinePluralCopy("actionCount", count, copy, dateTime);

export const localizeCommandLineOptions = (options = [], copy = {}) => {
  return options.map((option) => ({
    ...option,
    label: localizeCommandLineText(option.label, copy),
  }));
};

export const localizeCommandLineItems = (items = [], copy = {}) => {
  return items.map((item) => {
    const localizedItem = {
      ...item,
      label: localizeCommandLineText(item.label, copy),
      description: localizeCommandLineText(item.description, copy),
    };

    if (Array.isArray(localizedItem.items)) {
      localizedItem.items = localizeCommandLineItems(localizedItem.items, copy);
    }

    return localizedItem;
  });
};

export const localizeCommandLineBreadcrumb = (breadcrumb = [], copy = {}) => {
  return breadcrumb.map((item) => ({
    ...item,
    label: localizeCommandLineText(item.label, copy),
  }));
};

export const localizeCommandLineDropdownMenu = (
  dropdownMenu = {},
  copy = {},
) => {
  return {
    ...dropdownMenu,
    items: localizeCommandLineItems(dropdownMenu.items ?? [], copy),
  };
};

export const localizeCommandLineFormField = (field = {}, copy = {}) => {
  const localizedField = {
    ...field,
    label: localizeCommandLineText(field.label, copy),
    description: localizeCommandLineText(field.description, copy),
    placeholder: localizeCommandLineText(field.placeholder, copy),
  };

  if (localizedField.action) {
    localizedField.action = {
      ...localizedField.action,
      label: localizeCommandLineText(localizedField.action.label, copy),
    };
  }

  if (Array.isArray(localizedField.options)) {
    localizedField.options = localizeCommandLineOptions(
      localizedField.options,
      copy,
    );
  }

  if (Array.isArray(localizedField.fields)) {
    localizedField.fields = localizedField.fields.map((nestedField) =>
      localizeCommandLineFormField(nestedField, copy),
    );
  }

  if (localizedField.tooltip?.content) {
    localizedField.tooltip = {
      ...localizedField.tooltip,
      content: localizeCommandLineText(localizedField.tooltip.content, copy),
    };
  }

  return localizedField;
};

export const localizeCommandLineForm = (form = {}, copy = {}) => {
  const localizedForm = {
    ...form,
    rowStackAt: "lg",
    title: localizeCommandLineText(form.title, copy),
    description: localizeCommandLineText(form.description, copy),
  };

  if (Array.isArray(localizedForm.fields)) {
    localizedForm.fields = localizedForm.fields.map((field) =>
      localizeCommandLineFormField(field, copy),
    );
  }

  if (localizedForm.actions?.buttons) {
    localizedForm.actions = {
      ...localizedForm.actions,
      buttons: localizedForm.actions.buttons.map((button) => ({
        ...button,
        label: localizeCommandLineText(button.label, copy),
      })),
    };
  }

  return localizedForm;
};
