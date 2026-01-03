import { toFlatItems, toFlatGroups } from "insieme";
import { parseAndRender } from "jempl";

const contextMenuItems = [
  {
    label: "Container",
    type: "item",
    value: {
      action: "new-child-item",
      type: "container",
      name: "Container",
      x: 0,
      y: 0,
      gap: 0,
      width: 100,
      height: 100,
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  {
    label: "Sprite",
    type: "item",
    value: {
      action: "new-child-item",
      type: "sprite",
      name: "Sprite",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  {
    label: "Text",
    type: "item",
    value: {
      action: "new-child-item",
      type: "text",
      name: "Text",
      x: 0,
      y: 0,
      text: "text",
      style: {
        align: "left",
      },
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  {
    $when: 'layoutType == "dialogue"',
    label: "Text (Dialogue Content)",
    type: "item",
    value: {
      action: "new-child-item",
      type: "text-revealing-ref-dialogue-content",
      name: "Text (Dialogue Content)",
      x: 0,
      y: 0,
      text: "text",
      style: {
        wordWrapWidth: 300,
        align: "left",
      },
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  {
    $when: 'layoutType == "dialogue"',
    label: "Text (Character Name)",
    type: "item",
    value: {
      action: "new-child-item",
      type: "text-ref-character-name",
      name: "Text (Character Name)",
      x: 0,
      y: 0,
      text: "text",
      style: {
        wordWrapWidth: 300,
        align: "left",
      },
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  {
    $when: 'layoutType == "choice"',
    label: "Container (Choice Item)",
    type: "item",
    value: {
      action: "new-child-item",
      type: "container-ref-choice-item",
      name: "Container (Choice Item)",
      x: 0,
      y: 0,
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  {
    $when: 'layoutType == "choice"',
    label: "Text (Choice Item)",
    type: "item",
    value: {
      action: "new-child-item",
      type: "text-ref-choice-item-content",
      name: "Text (Choice Item Content)",
      x: 0,
      y: 0,
      text: "text",
      style: {
        wordWrapWidth: 300,
        align: "left",
      },
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
]

const emptyContextMenuItems = [
  {
    label: "Container",
    type: "item",
    value: {
      action: "new-child-item",
      type: "container",
      name: "Container",
      x: 0,
      y: 0,
      gap: 0,
      width: 100,
      height: 100,
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  {
    label: "Sprite",
    type: "item",
    value: {
      action: "new-child-item",
      type: "sprite",
      name: "Sprite",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  {
    label: "Text",
    type: "item",
    value: {
      action: "new-child-item",
      type: "text",
      name: "Text",
      x: 0,
      y: 0,
      text: "text",
      style: {
        wordWrapWidth: 300,
        align: "left",
      },
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  {
    $when: 'layoutType == "dialogue"',
    label: "Text (Dialogue Content)",
    type: "item",
    value: {
      action: "new-child-item",
      type: "text-revealing-ref-dialogue-content",
      name: "Text (Dialogue Content)",
      x: 0,
      y: 0,
      text: "text",
      style: {
        wordWrapWidth: 300,
        align: "left",
      },
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  {
    $when: 'layoutType == "dialogue"',
    label: "Text (Character Name)",
    type: "item",
    value: {
      action: "new-child-item",
      type: "text-ref-character-name",
      name: "Text (Character Name)",
      x: 0,
      y: 0,
      text: "text",
      style: {
        wordWrapWidth: 300,
        align: "left",
      },
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
]


const dialogueForm = {
  title: "Preview",
  description: "Edit to see how the layout will look like with different data",
  fields: [
    {
      name: "dialogue-character-name",
      description: "Character Name",
      inputType: "inputText",
    },
    {
      name: "dialogue-content",
      description: "Dialogue Content",
      inputType: "inputText",
    },
  ],
};

const choiceForm = {
  title: "Preview",
  description: "Edit to see how the layout will look like with different data",
  fields: [
    {
      name: "choicesNum",
      inputType: "select",
      description: "Number of Choices",
      options: [
        { label: "1", value: 1 },
        { label: "2", value: 2 },
        { label: "3", value: 3 },
        { label: "4", value: 4 },
        { label: "5", value: 5 },
        { label: "6", value: 6 },
      ],
      placeholder: "Select number of choices",
      required: true,
    },
    {
      $each: "choice, i in choices",
      name: "choices[${i}]",
      inputType: "inputText",
      description: "Choice content ${i} text",
      placeholder: "Enter choice text",
    },
  ],
};

export const createInitialState = () => ({
  lastUpdateDate: undefined,
  isDragging: false,
  dragStartPosition: undefined,
  layoutData: { tree: [], items: {} },
  selectedItemId: null,
  layout: null,
  images: { tree: [], items: {} },
  typographyData: { tree: [], items: {} },
  colorsData: { tree: [], items: {} },
  fontsData: { tree: [], items: {} },
  dialogueDefaultValues: {
    "dialogue-character-name": "Character",
    "dialogue-content": "This is a sample dialogue content.",
  },
  choiceDefaultValues: {
    choicesNum: 2,
    choices: ["Choice 1", "Choice 2"],
  },
});

export const setItems = (state, layoutData) => {
  state.layoutData = layoutData;
};

export const setLayout = (state, payload) => {
  const { id, layout } = payload;
  state.layout = {
    ...layout,
    id,
  };
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const updateSelectedItem = (state, updatedItem) => {
  if (state.selectedItemId && state.layoutData && state.layoutData.items) {
    state.layoutData.items[state.selectedItemId] = updatedItem;
  }
  state.lastUpdateDate = Date.now();
};

export const setImages = (state, images) => {
  state.images = images;
};

export const setTypographyData = (state, typographyData) => {
  state.typographyData = typographyData;
};

export const startDragging = (state) => {
  state.isDragging = true;
};

export const setDragStartPosition = (state, payload) => {
  const { x, y, itemStartX, itemStartY } = payload;
  state.dragStartPosition = {
    x,
    y,
    itemStartX,
    itemStartY,
  };
};

export const stopDragging = (state, isDragging) => {
  state.isDragging = isDragging;
  state.dragStartPosition = undefined;
};

export const setColorsData = (state, colorsData) => {
  state.colorsData = colorsData;
};

export const setFontsData = (state, fontsData) => {
  state.fontsData = fontsData;
};

export const setDialogueDefaultValue = (state, { name, fieldValue }) => {
  state.dialogueDefaultValues[name] = fieldValue;
};

export const setChoiceDefaultValue = (state, { name, fieldValue }) => {
  if (name.startsWith("choices[")) {
    const index = parseInt(name.match(/\d+/)[0]);
    state.choiceDefaultValues.choices[index] = fieldValue;
  } else {
    state.choiceDefaultValues[name] = fieldValue;
    if (name === "choicesNum") {
      const choices = [];
      for (let i = 0; i < fieldValue; i++) {
        choices.push(state.choiceDefaultValues.choices[i] || `Choice ${i + 1}`);
      }
      state.choiceDefaultValues.choices = choices;
    }
  }
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
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.layoutData);
  const item = flatItems.find((item) => item.id === state.selectedItemId);

  if (!item) {
    return null;
  }

  return {
    ...item,
    anchor: {
      x: item.anchorX,
      y: item.anchorY,
    },
  };
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectChoicesData = ({ state }) => {
  const choices = [];

  for (let i = 0; i < state.choiceDefaultValues.choicesNum; i++) {
    choices.push({
      content: state.choiceDefaultValues.choices[i],
    });
  }

  return {
    items: choices,
  };
};

export const selectItems = ({ state }) => {
  return state.layoutData;
};

export const selectTypographyData = ({ state }) => {
  return state.typographyData;
};

export const selectFontsData = ({ state }) => {
  return state.fontsData;
};

export const selectViewData = ({ state }) => {
  const item = selectSelectedItem({ state });
  const flatItems = toFlatItems(state.layoutData);
  const flatGroups = toFlatGroups(state.layoutData);

  const choicesContext = {
    ...state.choiceDefaultValues,
  };

  return {
    item,
    canvasCursor: state.isDragging ? "all-scroll" : "default",
    layoutEditPanelKey: `${item?.id}-${state.lastUpdateDate}`,
    flatItems,
    flatGroups,
    selectedItemId: state.selectedItemId,
    repositoryTarget: `layouts.items.${state.layout?.id}.elements`,
    resourceCategory: "userInterface",
    selectedResourceId: "layout-editor",
    contextMenuItems: parseAndRender(contextMenuItems, {
      layoutType: state.layout?.layoutType,
    }),
    emptyContextMenuItems: parseAndRender(emptyContextMenuItems, {
      layoutType: state.layout?.layoutType,
    }),
    dialogueForm,
    dialogueDefaultValues: state.dialogueDefaultValues,
    choiceForm,
    choiceDefaultValues: state.choiceDefaultValues,
    choicesContext,
    layout: state.layout,
    presentationState: {},
  };
};
