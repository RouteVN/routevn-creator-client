import { formatI18nCopy, selectI18nCopy } from "../i18nCopy.js";

const COMMAND_LINE_COPY_KEYS = Object.freeze({
  "A resource is required.": "resourceRequiredMessage",
  "Add Value": "addValueButton",
  "Choose a control...": "chooseControlPlaceholder",
  "Choose a layout...": "chooseLayoutPlaceholder",
  "Choose a speaker...": "chooseSpeakerPlaceholder",
  "Choose a string variable for this input field.":
    "chooseStringVariableFieldWarning",
  "Choose a string variable...": "chooseStringVariablePlaceholder",
  "Choose a value...": "chooseValuePlaceholder",
  "Choose a variable...": "chooseVariablePlaceholder",
  "Condition comparison value is invalid.": "conditionComparisonValueInvalid",
  "Condition enum value is invalid.": "conditionEnumValueInvalid",
  "Condition is unsupported.": "conditionUnsupported",
  "Condition operator is unsupported.": "conditionOperatorUnsupported",
  "Condition type is unsupported.": "conditionTypeUnsupported",
  "Enter number...": "enterNumberPlaceholder",
  "Enter text...": "enterTextPlaceholder",
  "Failed to create voice.": "failedCreateVoice",
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
  "Remove a sprite kept by an earlier dialogue line.":
    "removePersistedSpriteDescription",
  "Search...": "searchPlaceholder",
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
  "Voice preview audio is unavailable.": "voicePreviewUnavailable",
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

  if (Array.isArray(localizedField.options)) {
    localizedField.options = localizeCommandLineOptions(
      localizedField.options,
      copy,
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
