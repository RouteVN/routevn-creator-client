import {
  DEFAULT_PROJECT_RESOLUTION,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import { normalizeLayoutType } from "../../internal/project/layout.js";
import {
  findSaveLoadPreviewSettings,
  getSaveLoadPreviewWindow,
} from "../../internal/ui/layoutEditor/preview/index.js";
import {
  selectLayoutEditorHasSaveLoadPreview,
  selectLayoutEditorSaveLoadData,
  selectLayoutEditorSelectedItem,
  selectLayoutEditorViewData,
} from "../../internal/ui/layoutEditor/layoutEditorViewData.js";

export const createInitialState = () => ({
  lastUpdateDate: undefined,
  isDragging: false,
  dragStartPosition: undefined,
  keyboardNavigationTimeoutId: undefined,
  fileContentCacheById: {},
  layoutData: { tree: [], items: {} },
  selectedItemId: undefined,
  layout: undefined,
  images: { tree: [], items: {} },
  layoutsData: { tree: [], items: {} },
  textStylesData: { tree: [], items: {} },
  colorsData: { tree: [], items: {} },
  fontsData: { tree: [], items: {} },
  variablesData: { tree: [], items: {} },
  dialogueDefaultValues: {
    "dialogue-character-name": "Character",
    "dialogue-content": "This is a sample dialogue content.",
    "dialogue-auto-mode": false,
    "dialogue-skip-mode": false,
    "dialogue-is-line-completed": false,
  },
  nvlDefaultValues: {
    linesNum: 3,
    characterNames: ["Character", "", "Narrator"],
    lines: [
      "This is the first sample NVL line.",
      "This is the second sample NVL line.",
      "This is the third sample NVL line.",
    ],
  },
  previewRevealingSpeed: 50,
  choiceDefaultValues: {
    choicesNum: 2,
    choices: ["Choice 1", "Choice 2"],
  },
  saveLoadDefaultValues: {
    slotsNum: 3,
    saveImageIds: [undefined, undefined, undefined],
    saveDates: ["2026-03-10 18:00", "", ""],
  },
  previewVariableValues: {},
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  sliderCreateDialog: {
    open: false,
    parentId: undefined,
    defaultValues: {
      name: "Slider",
      direction: "horizontal",
    },
    images: {
      barImageId: undefined,
      thumbImageId: undefined,
      hoverBarImageId: undefined,
      hoverThumbImageId: undefined,
    },
  },
  sliderCreateImageSelectorDialog: {
    open: false,
    fieldName: undefined,
    selectedImageId: undefined,
  },
  fragmentCreateDialog: {
    open: false,
    parentId: undefined,
    key: 0,
    defaultValues: {
      fragmentLayoutId: undefined,
    },
  },
});

export const setItems = ({ state }, { layoutData } = {}) => {
  state.layoutData = layoutData;
};

export const setLayout = ({ state }, payload = {}) => {
  const { id, layout, resourceType } = payload || {};
  const nextResourceType = resourceType || layout?.resourceType || "layouts";

  if (!layout && !id) {
    state.layout = undefined;
    return;
  }

  state.layout = {
    ...layout,
    id: id || layout?.id || undefined,
    resourceType: nextResourceType,
    layoutType:
      nextResourceType === "controls"
        ? normalizeLayoutType(layout?.layoutType)
        : normalizeLayoutType(layout?.layoutType ?? "normal"),
  };
};

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const updateSelectedItem = ({ state }, { updatedItem } = {}) => {
  if (state.selectedItemId && state.layoutData && state.layoutData.items) {
    state.layoutData.items[state.selectedItemId] = updatedItem;
  }
  state.lastUpdateDate = Date.now();
};

export const setImages = ({ state }, { images } = {}) => {
  state.images = images;
};

export const setLayoutsData = ({ state }, { layoutsData } = {}) => {
  state.layoutsData = layoutsData;
};

export const setTextStylesData = ({ state }, { textStylesData } = {}) => {
  state.textStylesData = textStylesData;
};

export const startDragging = ({ state }, _payload = {}) => {
  state.isDragging = true;
};

export const setDragStartPosition = (
  { state },
  { x, y, itemStartX, itemStartY } = {},
) => {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof itemStartX !== "number" ||
    typeof itemStartY !== "number"
  ) {
    return;
  }

  state.dragStartPosition = {
    x,
    y,
    itemStartX,
    itemStartY,
  };
};

export const stopDragging = ({ state }, { isDragging = false } = {}) => {
  state.isDragging = isDragging;
  state.dragStartPosition = undefined;
};

export const setColorsData = ({ state }, { colorsData } = {}) => {
  state.colorsData = colorsData;
};

export const setFontsData = ({ state }, { fontsData } = {}) => {
  state.fontsData = fontsData;
};

export const setVariablesData = ({ state }, { variablesData } = {}) => {
  state.variablesData = variablesData;
};

export const syncRepositoryState = ({ state }, payload = {}) => {
  const {
    projectResolution,
    layoutId,
    layout,
    resourceType = "layouts",
    layoutData,
    images,
    layoutsData,
    textStylesData,
    colorsData,
    fontsData,
    variablesData,
  } = payload;
  const nextResourceType = resourceType || layout?.resourceType || "layouts";

  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
  state.layout =
    !layout && !layoutId
      ? undefined
      : {
          ...layout,
          id: layoutId || layout?.id || undefined,
          resourceType: nextResourceType,
          layoutType:
            nextResourceType === "controls"
              ? normalizeLayoutType(layout?.layoutType)
              : normalizeLayoutType(layout?.layoutType ?? "normal"),
        };
  state.layoutData = layoutData ?? { items: {}, tree: [] };
  state.images = images ?? { items: {}, tree: [] };
  state.layoutsData = layoutsData ?? { items: {}, tree: [] };
  state.textStylesData = textStylesData ?? { items: {}, tree: [] };
  state.colorsData = colorsData ?? { items: {}, tree: [] };
  state.fontsData = fontsData ?? { items: {}, tree: [] };
  state.variablesData = variablesData ?? { items: {}, tree: [] };
};

export const setKeyboardNavigationTimeoutId = (
  { state },
  { timeoutId } = {},
) => {
  state.keyboardNavigationTimeoutId = timeoutId;
};

export const clearKeyboardNavigationTimeout = ({ state }, _payload = {}) => {
  state.keyboardNavigationTimeoutId = undefined;
};

export const selectKeyboardNavigationTimeoutId = ({ state }) => {
  return state.keyboardNavigationTimeoutId;
};

export const cacheFileContent = ({ state }, { fileId, url } = {}) => {
  if (!fileId || !url) {
    return;
  }

  state.fileContentCacheById[fileId] = url;
};

export const clearCachedFileContent = ({ state }, { fileId } = {}) => {
  if (!fileId) {
    return;
  }

  delete state.fileContentCacheById[fileId];
};

export const clearFileContentCache = ({ state }, _payload = {}) => {
  state.fileContentCacheById = {};
};

export const selectCachedFileContent = ({ state }, { fileId } = {}) => {
  if (!fileId) {
    return undefined;
  }

  return state.fileContentCacheById[fileId];
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

export const openSliderCreateDialog = (
  { state },
  { parentId, direction, defaultValues } = {},
) => {
  state.sliderCreateDialog = {
    open: true,
    parentId,
    defaultValues: {
      name: defaultValues?.name ?? "Slider",
      direction: direction === "vertical" ? "vertical" : "horizontal",
    },
    images: {
      barImageId: undefined,
      thumbImageId: undefined,
      hoverBarImageId: undefined,
      hoverThumbImageId: undefined,
    },
  };
};

export const closeSliderCreateDialog = ({ state }, _payload = {}) => {
  state.sliderCreateDialog = {
    open: false,
    parentId: undefined,
    defaultValues: {
      name: "Slider",
      direction: "horizontal",
    },
    images: {
      barImageId: undefined,
      thumbImageId: undefined,
      hoverBarImageId: undefined,
      hoverThumbImageId: undefined,
    },
  };
};

export const setSliderCreateImage = (
  { state },
  { fieldName, imageId } = {},
) => {
  if (!fieldName) {
    return;
  }

  state.sliderCreateDialog.images[fieldName] = imageId;
};

export const openSliderCreateImageSelectorDialog = (
  { state },
  { fieldName } = {},
) => {
  if (!fieldName) {
    return;
  }

  state.sliderCreateImageSelectorDialog = {
    open: true,
    fieldName,
    selectedImageId: state.sliderCreateDialog.images[fieldName],
  };
};

export const closeSliderCreateImageSelectorDialog = (
  { state },
  _payload = {},
) => {
  state.sliderCreateImageSelectorDialog = {
    open: false,
    fieldName: undefined,
    selectedImageId: undefined,
  };
};

export const openFragmentCreateDialog = (
  { state },
  { parentId, defaultValues } = {},
) => {
  state.fragmentCreateDialog = {
    open: true,
    parentId,
    key: state.fragmentCreateDialog.key + 1,
    defaultValues: {
      fragmentLayoutId: defaultValues?.fragmentLayoutId,
    },
  };
};

export const closeFragmentCreateDialog = ({ state }, _payload = {}) => {
  state.fragmentCreateDialog = {
    open: false,
    parentId: undefined,
    key: state.fragmentCreateDialog.key,
    defaultValues: {
      fragmentLayoutId: undefined,
    },
  };
};

export const setSliderCreateImageSelectorSelectedImageId = (
  { state },
  { imageId } = {},
) => {
  state.sliderCreateImageSelectorDialog.selectedImageId = imageId;
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

export const setSaveLoadDefaultValue = (
  { state },
  { name, fieldValue } = {},
) => {
  const saveLoadPreviewSettings = findSaveLoadPreviewSettings({
    currentLayoutId: state.layout?.id,
    currentLayoutData: state.layoutData,
    currentLayoutType: normalizeLayoutType(state.layout?.layoutType),
    layoutsData: state.layoutsData,
    layoutId: state.layout?.id,
  });
  const { startIndex } = getSaveLoadPreviewWindow({
    saveLoadDefaultValues: state.saveLoadDefaultValues,
    saveLoadPreviewSettings,
    previewVariableValues: state.previewVariableValues,
    variablesData: state.variablesData,
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

export const selectDragging = ({ state }) => {
  return {
    isDragging: state.isDragging,
    dragStartPosition: state.dragStartPosition,
  };
};

export const selectLayoutId = ({ state }) => {
  return state.layout?.id;
};

export const selectLayoutResourceType = ({ state }) => {
  return state.layout?.resourceType || "layouts";
};

export const selectCurrentLayoutType = ({ state }) => {
  return normalizeLayoutType(state.layout?.layoutType);
};

export const selectDialogueDefaultValues = ({ state }) => {
  return state.dialogueDefaultValues;
};

export const selectNvlDefaultValues = ({ state }) => {
  return state.nvlDefaultValues;
};

export const selectChoiceDefaultValues = ({ state }) => {
  return state.choiceDefaultValues;
};

export const selectSaveLoadDefaultValues = ({ state }) => {
  return state.saveLoadDefaultValues;
};

export const selectPreviewRevealingSpeed = ({ state }) => {
  return state.previewRevealingSpeed;
};

export const selectProjectResolution = ({ state }) => {
  return state.projectResolution;
};

export const selectSliderCreateDialog = ({ state }) => {
  return state.sliderCreateDialog;
};

export const selectSliderCreateImageSelectorDialog = ({ state }) => {
  return state.sliderCreateImageSelectorDialog;
};

export const selectFragmentCreateDialog = ({ state }) => {
  return state.fragmentCreateDialog;
};

export const selectImages = ({ state }) => state.images;
export const selectLayoutsData = ({ state }) => state.layoutsData;

export const selectSelectedItem = ({ state }) => {
  return selectLayoutEditorSelectedItem({ state });
};

export const selectSelectedItemData = ({ state }) => {
  if (!state.selectedItemId) {
    return undefined;
  }

  const item = state.layoutData?.items?.[state.selectedItemId];
  if (!item) {
    return undefined;
  }

  return {
    id: state.selectedItemId,
    ...item,
  };
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

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
  return selectLayoutEditorSaveLoadData({ state });
};

export const selectPreviewVariableValues = ({ state }) => {
  return state.previewVariableValues;
};

export const selectHasSaveLoadPreview = ({ state }) => {
  return selectLayoutEditorHasSaveLoadPreview({ state });
};

export const selectItems = ({ state }) => {
  return state.layoutData;
};

export const selectTextStylesData = ({ state }) => {
  return state.textStylesData;
};

export const selectFontsData = ({ state }) => {
  return state.fontsData;
};

export const selectVariablesData = ({ state }) => {
  return state.variablesData;
};

export const selectViewData = ({ state, constants }) => {
  return selectLayoutEditorViewData({ state, constants });
};
