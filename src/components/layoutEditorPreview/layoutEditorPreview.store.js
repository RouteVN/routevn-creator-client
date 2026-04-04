import { createLayoutEditorPreviewData } from "./support/layoutEditorPreviewData.js";
import {
  createChoiceFormDefaultValues,
  createHistoryFormDefaultValues,
  createNvlFormDefaultValues,
  createPreviewVariablesViewData,
  createSaveLoadPreviewViewData,
  findSaveLoadPreviewSettings,
  getSaveLoadPreviewWindow,
} from "./support/layoutEditorPreviewSupport.js";

const EMPTY_LAYOUT_DATA = {
  items: {},
  tree: [],
};

const createDialogueDefaultValues = () => ({
  "dialogue-character-name": "Character",
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

const resetPreviewStateValues = (state) => {
  state.dialogueDefaultValues = createDialogueDefaultValues();
  state.nvlDefaultValues = createNvlDefaultValues();
  state.previewRevealingSpeed = 50;
  state.choiceDefaultValues = createChoiceDefaultValues();
  state.historyDefaultValues = createHistoryDefaultValues();
  state.saveLoadDefaultValues = createSaveLoadDefaultValues();
  state.previewVariableValues = {};
};

const getLayoutState = (state) => {
  return (
    state.layoutState ?? {
      elements: EMPTY_LAYOUT_DATA,
      id: undefined,
      layoutType: undefined,
    }
  );
};

export const createInitialState = () => ({
  layoutState: undefined,
  repositoryState: {},
  dialogueDefaultValues: createDialogueDefaultValues(),
  nvlDefaultValues: createNvlDefaultValues(),
  previewRevealingSpeed: 50,
  choiceDefaultValues: createChoiceDefaultValues(),
  historyDefaultValues: createHistoryDefaultValues(),
  saveLoadDefaultValues: createSaveLoadDefaultValues(),
  previewVariableValues: {},
});

export const setLayoutState = ({ state }, { layoutState } = {}) => {
  state.layoutState = layoutState;
};

export const setRepositoryState = ({ state }, { repositoryState } = {}) => {
  state.repositoryState = repositoryState ?? {};
};

export const resetPreviewState = ({ state }, _payload = {}) => {
  resetPreviewStateValues(state);
};

export const setDialogueDefaultValue = (
  { state },
  { name, fieldValue } = {},
) => {
  state.dialogueDefaultValues[name] = fieldValue;
};

export const setNvlDefaultValue = ({ state }, { name, fieldValue } = {}) => {
  if (/^characterName\d+$/.test(name)) {
    const index = Number.parseInt(name.slice("characterName".length), 10);
    state.nvlDefaultValues.characterNames[index] = fieldValue;
    return;
  }

  if (/^line\d+$/.test(name)) {
    const index = Number.parseInt(name.slice("line".length), 10);
    state.nvlDefaultValues.lines[index] = fieldValue;
    return;
  }

  state.nvlDefaultValues[name] = fieldValue;

  if (name !== "linesNum") {
    return;
  }

  const lines = [];
  const characterNames = [];

  for (let index = 0; index < fieldValue; index += 1) {
    characterNames.push(state.nvlDefaultValues.characterNames[index] ?? "");
    lines.push(
      state.nvlDefaultValues.lines[index] ||
        `This is sample NVL line ${index + 1}.`,
    );
  }

  state.nvlDefaultValues.characterNames = characterNames;
  state.nvlDefaultValues.lines = lines;
};

export const setPreviewRevealingSpeed = ({ state }, { value } = {}) => {
  state.previewRevealingSpeed = value;
};

export const setChoiceDefaultValue = ({ state }, { name, fieldValue } = {}) => {
  if (/^choice\d+$/.test(name)) {
    const index = Number.parseInt(name.slice("choice".length), 10);
    state.choiceDefaultValues.choices[index] = fieldValue;
    return;
  }

  state.choiceDefaultValues[name] = fieldValue;

  if (name !== "choicesNum") {
    return;
  }

  const choices = [];
  for (let index = 0; index < fieldValue; index += 1) {
    choices.push(
      state.choiceDefaultValues.choices[index] || `Choice ${index + 1}`,
    );
  }
  state.choiceDefaultValues.choices = choices;
};

export const setHistoryDefaultValue = ({ state }, { name, fieldValue } = {}) => {
  if (/^characterName\d+$/.test(name)) {
    const index = Number.parseInt(name.slice("characterName".length), 10);
    state.historyDefaultValues.characterNames[index] = fieldValue;
    return;
  }

  if (/^text\d+$/.test(name)) {
    const index = Number.parseInt(name.slice("text".length), 10);
    state.historyDefaultValues.texts[index] = fieldValue;
    return;
  }

  state.historyDefaultValues[name] = fieldValue;

  if (name !== "linesNum") {
    return;
  }

  const texts = [];
  const characterNames = [];

  for (let index = 0; index < fieldValue; index += 1) {
    characterNames.push(state.historyDefaultValues.characterNames[index] ?? "");
    texts.push(
      state.historyDefaultValues.texts[index] ?? `History line ${index + 1}`,
    );
  }

  state.historyDefaultValues.characterNames = characterNames;
  state.historyDefaultValues.texts = texts;
};

export const setSaveLoadDefaultValue = (
  { state },
  { name, fieldValue } = {},
) => {
  const layoutState = getLayoutState(state);
  const saveLoadPreviewSettings = findSaveLoadPreviewSettings({
    currentLayoutId: layoutState.id,
    currentLayoutData: layoutState.elements,
    currentLayoutType: layoutState.layoutType,
    layoutsData: state.repositoryState.layouts,
    layoutId: layoutState.id,
  });
  const { startIndex } = getSaveLoadPreviewWindow({
    saveLoadDefaultValues: state.saveLoadDefaultValues,
    saveLoadPreviewSettings,
    previewVariableValues: state.previewVariableValues,
    variablesData: state.repositoryState.variables,
  });

  if (/^saveImageId\d+$/.test(name)) {
    const index =
      startIndex + Number.parseInt(name.slice("saveImageId".length), 10);
    state.saveLoadDefaultValues.saveImageIds[index] = fieldValue;
    return;
  }

  if (/^saveDate\d+$/.test(name)) {
    const index =
      startIndex + Number.parseInt(name.slice("saveDate".length), 10);
    state.saveLoadDefaultValues.saveDates[index] = fieldValue;
    return;
  }

  state.saveLoadDefaultValues[name] = fieldValue;

  if (name !== "slotsNum") {
    return;
  }

  const saveImageIds = [];
  const saveDates = [];

  for (let index = 0; index < fieldValue; index += 1) {
    saveImageIds.push(state.saveLoadDefaultValues.saveImageIds[index]);
    saveDates.push(state.saveLoadDefaultValues.saveDates[index] ?? "");
  }

  state.saveLoadDefaultValues.saveImageIds = saveImageIds;
  state.saveLoadDefaultValues.saveDates = saveDates;
};

export const setPreviewVariableValue = (
  { state },
  { name, fieldValue } = {},
) => {
  if (!name) {
    return;
  }

  state.previewVariableValues[name] = fieldValue;
};

export const selectPreviewVariableValues = ({ state }) => {
  return state.previewVariableValues;
};

export const selectChoicesData = ({ state }) => {
  const choices = [];

  for (
    let index = 0;
    index < state.choiceDefaultValues.choicesNum;
    index += 1
  ) {
    choices.push({
      content: state.choiceDefaultValues.choices[index],
    });
  }

  return {
    items: choices,
  };
};

export const selectSaveLoadData = ({ state }) => {
  const layoutState = getLayoutState(state);
  const saveLoadPreviewViewData = createSaveLoadPreviewViewData({
    currentLayoutId: layoutState.id,
    currentLayoutData: layoutState.elements,
    currentLayoutType: layoutState.layoutType,
    layoutsData: state.repositoryState.layouts,
    saveLoadDefaultValues: state.saveLoadDefaultValues,
    previewVariableValues: state.previewVariableValues,
    variablesData: state.repositoryState.variables,
    images: state.repositoryState.images,
  });

  return {
    slots: saveLoadPreviewViewData.visibleSaveLoadSlots,
  };
};

export const selectHasSaveLoadPreview = ({ state }) => {
  const layoutState = getLayoutState(state);

  return createSaveLoadPreviewViewData({
    currentLayoutId: layoutState.id,
    currentLayoutData: layoutState.elements,
    currentLayoutType: layoutState.layoutType,
    layoutsData: state.repositoryState.layouts,
    saveLoadDefaultValues: state.saveLoadDefaultValues,
    previewVariableValues: state.previewVariableValues,
    variablesData: state.repositoryState.variables,
    images: state.repositoryState.images,
  }).hasSaveLoadPreview;
};

export const selectPreviewData = ({ state }) => {
  const layoutType = getLayoutState(state).layoutType;

  return createLayoutEditorPreviewData({
    layoutType,
    variablesData: state.repositoryState.variables,
    previewVariableValues: state.previewVariableValues,
    dialogueDefaultValues: state.dialogueDefaultValues,
    nvlDefaultValues: state.nvlDefaultValues,
    historyDefaultValues: state.historyDefaultValues,
    previewRevealingSpeed: state.previewRevealingSpeed,
    choicesData: selectChoicesData({ state }),
    saveLoadData: selectSaveLoadData({ state }),
    hasSaveLoadPreview: selectHasSaveLoadPreview({ state }),
  });
};

export const selectViewData = ({ state, constants }) => {
  const layoutState = getLayoutState(state);
  const layoutType = layoutState.layoutType;
  const previewVariablesViewData = createPreviewVariablesViewData({
    layoutType,
    currentLayoutId: layoutState.id,
    currentLayoutData: layoutState.elements,
    layoutsData: state.repositoryState.layouts,
    variablesData: state.repositoryState.variables,
    previewVariableValues: state.previewVariableValues,
  });
  const saveLoadPreviewViewData = createSaveLoadPreviewViewData({
    currentLayoutId: layoutState.id,
    currentLayoutData: layoutState.elements,
    currentLayoutType: layoutType,
    layoutsData: state.repositoryState.layouts,
    saveLoadDefaultValues: state.saveLoadDefaultValues,
    previewVariableValues: state.previewVariableValues,
    variablesData: state.repositoryState.variables,
    images: state.repositoryState.images,
    saveLoadForm: constants.saveLoadForm,
  });
  const identityKey = `${layoutState.id ?? "none"}:${layoutType ?? "none"}`;

  return {
    layoutType,
    dialogueForm: constants.dialogueForm,
    dialogueDefaultValues: state.dialogueDefaultValues,
    dialogueFormKey: `${identityKey}:dialogue`,
    nvlForm: constants.nvlForm,
    nvlDefaultValues: createNvlFormDefaultValues(state.nvlDefaultValues),
    nvlContext: {
      characterNames: state.nvlDefaultValues.characterNames,
      lines: state.nvlDefaultValues.lines,
      linesNum: state.nvlDefaultValues.linesNum,
    },
    nvlFormKey: `${identityKey}:nvl`,
    previewRevealingSpeed: state.previewRevealingSpeed,
    choiceForm: constants.choiceForm,
    choiceDefaultValues: createChoiceFormDefaultValues(
      state.choiceDefaultValues,
    ),
    choicesContext: {
      choices: state.choiceDefaultValues.choices,
      choicesNum: state.choiceDefaultValues.choicesNum,
    },
    choiceFormKey: `${identityKey}:choice`,
    historyForm: constants.historyForm,
    historyDefaultValues: createHistoryFormDefaultValues(
      state.historyDefaultValues,
    ),
    historyContext: {
      characterNames: state.historyDefaultValues.characterNames,
      texts: state.historyDefaultValues.texts,
      linesNum: state.historyDefaultValues.linesNum,
    },
    historyFormKey: `${identityKey}:history`,
    saveLoadForm: saveLoadPreviewViewData.saveLoadForm,
    saveLoadDefaultValues: saveLoadPreviewViewData.saveLoadDefaultValues,
    saveLoadContext: saveLoadPreviewViewData.saveLoadContext,
    saveLoadFormKey: saveLoadPreviewViewData.saveLoadFormKey,
    hasSaveLoadPreview: saveLoadPreviewViewData.hasSaveLoadPreview,
    previewVariablesForm: previewVariablesViewData.previewVariablesForm,
    previewVariablesDefaultValues:
      previewVariablesViewData.previewVariablesDefaultValues,
    previewVariablesFormKey: previewVariablesViewData.previewVariablesFormKey,
    hasPreviewVariables: previewVariablesViewData.hasPreviewVariables,
  };
};
