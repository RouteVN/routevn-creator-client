import { selectI18nCopy } from "../i18nCopy.js";

const SCENE_EDITOR_LABEL_KEYS = Object.freeze({
  Actions: "actionsLabel",
  Auto: "autoLabel",
  Cancel: "cancelButton",
  Create: "createButton",
  "Create Section": "createSectionTitle",
  "Don't Inherit": "dontInheritOption",
  "Edit Section": "editSectionTitle",
  Hide: "hideOption",
  Inherit: "inheritOption",
  "Inherit state from selected line": "inheritStateFromSelectedLineLabel",
  Move: "moveButton",
  "Move Section": "moveSectionTitle",
  Muted: "mutedOption",
  On: "onOption",
  Rename: "renameButton",
  Save: "saveButton",
  Scene: "sceneLabel",
  "Section Name": "sectionNameLabel",
  Settings: "settingsTitle",
  Show: "showOption",
  "Show line numbers": "showLineNumbersLabel",
  "Text size": "textSizeLabel",
  "Preview audio": "previewAudioLabel",
});

export const selectSceneEditorCopy = (i18n = {}) => {
  return selectI18nCopy(i18n, [
    "resourcePages",
    "scenesPage",
    "sceneEditorPage",
  ]);
};

export const localizeSceneEditorForm = (form = {}, copy = {}) => {
  const localizeValue = (value) => {
    if (!value) {
      return value;
    }

    const copyKey = SCENE_EDITOR_LABEL_KEYS[value];
    return copyKey ? (copy[copyKey] ?? value) : value;
  };

  const localizedForm = { ...form };

  if (localizedForm.title) {
    localizedForm.title = localizeValue(localizedForm.title);
  }
  if (Array.isArray(localizedForm.fields)) {
    localizedForm.fields = localizedForm.fields.map((field) => {
      const localizedField = { ...field };

      if (localizedField.label) {
        localizedField.label = localizeValue(localizedField.label);
      }
      if (localizedField.placeholder) {
        localizedField.placeholder = localizeValue(localizedField.placeholder);
      }
      if (Array.isArray(localizedField.options)) {
        localizedField.options = localizedField.options.map((option) => ({
          ...option,
          label: localizeValue(option.label),
        }));
      }

      return localizedField;
    });
  }
  if (localizedForm.actions?.buttons) {
    localizedForm.actions = {
      ...localizedForm.actions,
      buttons: localizedForm.actions.buttons.map((button) => ({
        ...button,
        label: localizeValue(button.label),
      })),
    };
  }

  return localizedForm;
};
