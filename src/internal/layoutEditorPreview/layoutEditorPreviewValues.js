import { createLayoutEditorPreviewData } from "./layoutEditorPreviewData.js";
import { createPersistedPreviewState } from "./layoutEditorPreviewPersistence.js";
import { createSaveLoadPreviewViewData } from "./layoutEditorPreviewSupport.js";

// The values a layout's Preview is set with, and the preview data a layout
// draws with them. The layout editor's Preview edits them, and a layout's
// thumbnail is drawn from the saved ones the same way.

const EMPTY_LAYOUT_DATA = {
  items: {},
  tree: [],
};

const createDialogueDefaultValues = () => ({
  "dialogue-character-id": undefined,
  "dialogue-custom-character-name": false,
  "dialogue-character-name": "Character",
  "dialogue-character-sprite-id": undefined,
  "dialogue-character-sprite-transform-id": undefined,
  "dialogue-content": "This is a sample dialogue content.",
  "dialogue-auto-mode": false,
  "dialogue-skip-mode": false,
  "dialogue-is-line-completed": false,
});

const createNvlDefaultValues = () => ({
  linesNum: 3,
  characterNames: ["Character", "", "Narrator"],
  lines: [
    "This is the first sample NVL line.",
    "This is the second sample NVL line.",
    "This is the third sample NVL line.",
  ],
});

const createChoiceDefaultValues = () => ({
  choicesNum: 2,
  choices: ["Choice 1", "Choice 2"],
});

const createHistoryDefaultValues = () => ({
  linesNum: 3,
  characterNames: ["Aki", "Mina", ""],
  texts: [
    "The first history line.",
    "The second history line.",
    "The third history line.",
  ],
});

const createSaveLoadDefaultValues = () => ({
  slotsNum: 3,
  saveImageIds: [undefined, undefined, undefined],
  saveDates: ["2026-03-10 18:00", "", ""],
});

// The Preview's values before anything is set.
export const createDefaultPreviewValues = () => ({
  dialogueDefaultValues: createDialogueDefaultValues(),
  nvlDefaultValues: createNvlDefaultValues(),
  previewRevealingSpeed: 50,
  choiceDefaultValues: createChoiceDefaultValues(),
  historyDefaultValues: createHistoryDefaultValues(),
  saveLoadDefaultValues: createSaveLoadDefaultValues(),
  previewVariableValues: {},
  previewInputFieldValues: {},
  previewBackgroundImageId: undefined,
});

const SAVED_VALUE_KEYS = [
  "dialogueDefaultValues",
  "nvlDefaultValues",
  "previewRevealingSpeed",
  "choiceDefaultValues",
  "historyDefaultValues",
  "saveLoadDefaultValues",
];

// The Preview's values for saved preview data: what it saved, and the
// defaults for the rest.
export const createSavedPreviewValues = (previewData) => {
  const values = createDefaultPreviewValues();
  const persistedPreviewState = createPersistedPreviewState(previewData);
  for (const key of SAVED_VALUE_KEYS) {
    if (persistedPreviewState[key] !== undefined) {
      values[key] = persistedPreviewState[key];
    }
  }
  values.previewVariableValues =
    persistedPreviewState.previewVariableValues ?? {};
  values.previewInputFieldValues =
    persistedPreviewState.previewInputFieldValues ?? {};
  values.previewBackgroundImageId =
    persistedPreviewState.previewBackgroundImageId;
  return values;
};

const toLayoutState = (layoutState) =>
  layoutState ?? {
    elements: EMPTY_LAYOUT_DATA,
    id: undefined,
    layoutType: undefined,
  };

export const createPreviewChoicesData = (values) => {
  const items = [];
  for (
    let index = 0;
    index < values.choiceDefaultValues.choicesNum;
    index += 1
  ) {
    items.push({
      content: values.choiceDefaultValues.choices[index],
    });
  }

  return { items };
};

export const createPreviewSaveLoadViewData = ({
  layoutState,
  repositoryState,
  values,
}) => {
  const layout = toLayoutState(layoutState);
  return createSaveLoadPreviewViewData({
    currentLayoutId: layout.id,
    currentLayoutData: layout.elements,
    currentLayoutType: layout.layoutType,
    layoutsData: repositoryState.layouts,
    saveLoadDefaultValues: values.saveLoadDefaultValues,
    previewVariableValues: values.previewVariableValues,
    variablesData: repositoryState.variables,
    images: repositoryState.images,
  });
};

// The preview data a layout draws with the Preview's values.
export const createLayoutPreviewData = ({
  layoutState,
  repositoryState,
  values,
}) => {
  const layout = toLayoutState(layoutState);
  const saveLoadPreviewViewData = createPreviewSaveLoadViewData({
    layoutState: layout,
    repositoryState,
    values,
  });

  return createLayoutEditorPreviewData({
    layoutType: layout.layoutType,
    currentLayoutId: layout.id,
    currentLayoutData: layout.elements,
    layoutsData: repositoryState.layouts,
    variablesData: repositoryState.variables,
    previewVariableValues: values.previewVariableValues,
    previewInputFieldValues: values.previewInputFieldValues,
    dialogueDefaultValues: values.dialogueDefaultValues,
    nvlDefaultValues: values.nvlDefaultValues,
    historyDefaultValues: values.historyDefaultValues,
    previewRevealingSpeed: values.previewRevealingSpeed,
    choicesData: createPreviewChoicesData(values),
    saveLoadData: {
      slots: saveLoadPreviewViewData.visibleSaveLoadSlots,
    },
    hasSaveLoadPreview: saveLoadPreviewViewData.hasSaveLoadPreview,
    backgroundImageId: values.previewBackgroundImageId,
  });
};

// The preview data a layout draws with its saved preview data, as the layout
// editor's Preview shows it when it opens.
export const createSavedLayoutPreviewData = ({
  layoutState,
  repositoryState,
  previewData,
}) =>
  createLayoutPreviewData({
    layoutState,
    repositoryState,
    values: createSavedPreviewValues(previewData),
  });
