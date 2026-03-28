import { toFlatItems } from "../../internal/project/tree.js";
import { parseAndRender } from "jempl";
import {
  createLayoutEditorItemTemplate,
  isLayoutEditorContainerItemType,
} from "../../internal/layoutEditorTypes.js";
import { getSystemVariableItems } from "../../internal/systemVariables.js";
import { splitVisibilityConditionFromWhen } from "../../internal/layoutVisibilityCondition.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";

const PREVIEW_VARIABLE_TYPES = new Set(["boolean", "number", "string"]);
const NORMAL_LIKE_LAYOUT_TYPES = new Set(["normal", "save-load"]);

const PREVIEW_BOOLEAN_OPTIONS = [
  { label: "True", value: true },
  { label: "False", value: false },
];

const toPreviewVariableValue = ({ type, value } = {}) => {
  if (type === "number") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }

  if (type === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      return value === "true";
    }

    return Boolean(value);
  }

  return value ?? "";
};

const getLayoutPreviewVariableItems = (layoutData = {}, variablesData = {}) => {
  const availableVariables = {
    ...variablesData.items,
    ...getSystemVariableItems(),
  };
  const previewVariables = [];
  const addedVariableIds = new Set();

  for (const item of Object.values(layoutData?.items ?? {})) {
    const visibilityCondition = splitVisibilityConditionFromWhen(
      item?.["$when"],
    ).visibilityCondition;
    const variableId = visibilityCondition?.variableId;

    if (!variableId || addedVariableIds.has(variableId)) {
      continue;
    }

    const variable = availableVariables[variableId];
    const type = String(variable?.type ?? "string").toLowerCase();

    if (!PREVIEW_VARIABLE_TYPES.has(type)) {
      continue;
    }

    addedVariableIds.add(variableId);
    previewVariables.push({
      id: variableId,
      name: variable?.name ?? variableId,
      type,
      source: variable?.source,
      description: variable?.description,
      defaultValue: toPreviewVariableValue({
        type,
        value: variable?.value ?? variable?.default,
      }),
    });
  }

  return previewVariables.sort((left, right) =>
    left.name.localeCompare(right.name),
  );
};

const createPreviewVariablesForm = (previewVariableItems = []) => ({
  title: "Preview",
  description: "Edit visibility variables to preview conditional elements",
  fields: previewVariableItems.map((variable) => {
    const sourceLabel =
      variable.source === "system" ? "System variable" : "Variable";
    const descriptionParts = [
      `${sourceLabel} (${variable.type})`,
      variable.description,
    ].filter(Boolean);

    if (variable.type === "boolean") {
      return {
        name: variable.id,
        type: "select",
        label: variable.name,
        clearable: false,
        options: PREVIEW_BOOLEAN_OPTIONS,
        description: descriptionParts.join(" • "),
      };
    }

    return {
      name: variable.id,
      type: variable.type === "number" ? "input-number" : "input-text",
      label: variable.name,
      description: descriptionParts.join(" • "),
    };
  }),
});

const createPreviewVariableDefaultValues = (
  previewVariableItems = [],
  previewVariableValues = {},
) => {
  return Object.fromEntries(
    previewVariableItems.map((variable) => [
      variable.id,
      Object.hasOwn(previewVariableValues, variable.id)
        ? previewVariableValues[variable.id]
        : variable.defaultValue,
    ]),
  );
};

const createChoiceFormDefaultValues = (choiceDefaultValues = {}) => {
  const choicesNum = Number(choiceDefaultValues.choicesNum);
  const choiceCount =
    Number.isFinite(choicesNum) && choicesNum > 0 ? choicesNum : 0;
  const defaultValues = {
    choicesNum: choiceCount,
  };

  for (let index = 0; index < choiceCount; index += 1) {
    defaultValues[`choice${index}`] =
      choiceDefaultValues.choices?.[index] ?? `Choice ${index + 1}`;
  }

  return defaultValues;
};

const createNvlFormDefaultValues = (nvlDefaultValues = {}) => {
  const linesNum = Number(nvlDefaultValues.linesNum);
  const lineCount = Number.isFinite(linesNum) && linesNum > 0 ? linesNum : 0;
  const defaultValues = {
    linesNum: lineCount,
  };

  for (let index = 0; index < lineCount; index += 1) {
    defaultValues[`characterName${index}`] =
      nvlDefaultValues.characterNames?.[index] ?? "";
    defaultValues[`line${index}`] =
      nvlDefaultValues.lines?.[index] ??
      `This is sample NVL line ${index + 1}.`;
  }

  return defaultValues;
};

const toLayoutEditorContextMenuItems = (
  items = [],
  projectResolution = DEFAULT_PROJECT_RESOLUTION,
) => {
  return items.map((item) => {
    if (!item?.createType) {
      return item;
    }

    const { createType, ...nextItem } = item;

    return {
      ...nextItem,
      value: {
        action: "new-child-item",
        ...createLayoutEditorItemTemplate(createType, {
          projectResolution,
        }),
      },
    };
  });
};

const toLayoutEditorExplorerItems = (items = []) => {
  return (items ?? []).map((item) => ({
    ...item,
    dragOptions: {
      ...item.dragOptions,
      canReceiveChildren: isLayoutEditorContainerItemType(item.type),
    },
  }));
};

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
  textStylesData: { tree: [], items: {} },
  colorsData: { tree: [], items: {} },
  fontsData: { tree: [], items: {} },
  variablesData: { tree: [], items: {} },
  dialogueDefaultValues: {
    "dialogue-character-name": "Character",
    "dialogue-content": "This is a sample dialogue content.",
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
        ? layout?.layoutType
        : (layout?.layoutType ?? "normal"),
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
  return state.layout?.layoutType;
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

export const selectImages = ({ state }) => state.images;

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) {
    return undefined;
  }

  const flatItems = toLayoutEditorExplorerItems(toFlatItems(state.layoutData));
  const item = flatItems.find((entry) => entry.id === state.selectedItemId);
  if (!item) {
    return undefined;
  }

  return {
    ...item,
    anchor: {
      x: item.anchorX,
      y: item.anchorY,
    },
  };
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

export const selectPreviewVariableValues = ({ state }) => {
  return state.previewVariableValues;
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
  const item = selectSelectedItem({ state });
  const flatItems = toLayoutEditorExplorerItems(toFlatItems(state.layoutData));
  const isControlResource = state.layout?.resourceType === "controls";
  const layoutType = state.layout?.layoutType;

  const parsedContextMenuItems = parseAndRender(
    isControlResource
      ? constants.controlContextMenuItems
      : constants.contextMenuItems,
    { layoutType },
  );
  const parsedEmptyContextMenuItems = parseAndRender(
    isControlResource
      ? constants.controlEmptyContextMenuItems
      : constants.emptyContextMenuItems,
    { layoutType },
  );
  const previewVariableItems = NORMAL_LIKE_LAYOUT_TYPES.has(layoutType)
    ? getLayoutPreviewVariableItems(state.layoutData, state.variablesData)
    : [];
  const previewVariablesDefaultValues = createPreviewVariableDefaultValues(
    previewVariableItems,
    state.previewVariableValues,
  );
  const previewVariablesFormKey =
    previewVariableItems.length > 0
      ? previewVariableItems.map((item) => item.id).join("|")
      : "empty";

  return {
    item,
    canvasCursor: state.isDragging ? "all-scroll" : "default",
    layoutEditPanelKey: `${item?.id}-${state.lastUpdateDate}`,
    flatItems,
    selectedItemId: state.selectedItemId,
    resourceCategory: isControlResource ? "systemConfig" : "userInterface",
    selectedResourceId: isControlResource ? "controls" : "layout-editor",
    contextMenuItems: toLayoutEditorContextMenuItems(
      parsedContextMenuItems,
      state.projectResolution,
    ),
    emptyContextMenuItems: toLayoutEditorContextMenuItems(
      parsedEmptyContextMenuItems,
      state.projectResolution,
    ),
    dialogueForm: constants.dialogueForm,
    dialogueDefaultValues: state.dialogueDefaultValues,
    nvlForm: constants.nvlForm,
    nvlDefaultValues: createNvlFormDefaultValues(state.nvlDefaultValues),
    nvlContext: {
      ...state.nvlDefaultValues,
    },
    previewRevealingSpeed: state.previewRevealingSpeed,
    choiceForm: constants.choiceForm,
    choiceDefaultValues: createChoiceFormDefaultValues(
      state.choiceDefaultValues,
    ),
    choicesContext: {
      ...state.choiceDefaultValues,
    },
    previewVariablesForm: createPreviewVariablesForm(previewVariableItems),
    previewVariablesDefaultValues,
    previewVariablesFormKey,
    hasPreviewVariables: previewVariableItems.length > 0,
    sliderCreateForm: constants.sliderCreateForm,
    sliderCreateDialog: state.sliderCreateDialog,
    sliderCreateImageSelectorDialog: state.sliderCreateImageSelectorDialog,
    canvasAspectRatio: formatProjectResolutionAspectRatio(
      state.projectResolution,
    ),
    layout: state.layout,
    textStylesData: state.textStylesData,
    variablesData: state.variablesData,
    images: state.images,
  };
};
