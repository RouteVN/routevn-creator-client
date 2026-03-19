import { toFlatItems } from "../../internal/project/tree.js";
import { parseAndRender } from "jempl";
import { createLayoutEditorItemTemplate } from "../../internal/layoutEditorTypes.js";

const toLayoutEditorContextMenuItems = (items = []) => {
  return items.map((item) => {
    if (!item?.createType) {
      return item;
    }

    const { createType, ...nextItem } = item;

    return {
      ...nextItem,
      value: {
        action: "new-child-item",
        ...createLayoutEditorItemTemplate(createType),
      },
    };
  });
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
  choiceDefaultValues: {
    choicesNum: 2,
    choices: ["Choice 1", "Choice 2"],
  },
});

export const setItems = ({ state }, { layoutData } = {}) => {
  state.layoutData = layoutData;
};

export const setLayout = ({ state }, payload = {}) => {
  const { id, layout, resourceType } = payload || {};

  if (!layout && !id) {
    state.layout = undefined;
    return;
  }

  state.layout = {
    ...layout,
    id: id || layout?.id || undefined,
    resourceType: resourceType || layout?.resourceType || "layouts",
  };
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

export const setChoiceDefaultValue = ({ state }, { name, fieldValue } = {}) => {
  if (name.startsWith("choices[")) {
    const index = Number.parseInt(name.match(/\d+/)[0], 10);
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

export const selectChoiceDefaultValues = ({ state }) => {
  return state.choiceDefaultValues;
};

export const selectImages = ({ state }) => state.images;

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) {
    return undefined;
  }

  const flatItems = toFlatItems(state.layoutData);
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
  const flatItems = toFlatItems(state.layoutData);
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

  return {
    item,
    canvasCursor: state.isDragging ? "all-scroll" : "default",
    layoutEditPanelKey: `${item?.id}-${state.lastUpdateDate}`,
    flatItems,
    selectedItemId: state.selectedItemId,
    resourceCategory: isControlResource ? "systemConfig" : "userInterface",
    selectedResourceId: isControlResource ? "controls" : "layout-editor",
    contextMenuItems: toLayoutEditorContextMenuItems(parsedContextMenuItems),
    emptyContextMenuItems: toLayoutEditorContextMenuItems(
      parsedEmptyContextMenuItems,
    ),
    dialogueForm: constants.dialogueForm,
    dialogueDefaultValues: state.dialogueDefaultValues,
    choiceForm: constants.choiceForm,
    choiceDefaultValues: state.choiceDefaultValues,
    choicesContext: {
      ...state.choiceDefaultValues,
    },
    layout: state.layout,
    textStylesData: state.textStylesData,
    variablesData: state.variablesData,
  };
};
