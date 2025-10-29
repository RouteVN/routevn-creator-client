import { toFlatItems, toFlatGroups } from "../../deps/repository";

// TODO: get global screen size from store
// const SCREEN_WIDTH = 1920;
// const SCREEN_HEIGHT = 1080;

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
  formKeyCheckpoint: 0,
  isDragging: false,
  dragOffset: { x: 0, y: 0 },
  imageSelectorDialog: {
    isOpen: false,
    fieldIndex: -1,
    groups: [],
    selectedImageId: null,
  },
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    fieldName: null,
  },
  layoutData: { tree: [], items: {} },
  selectedItemId: null,
  layout: null,
  images: { tree: [], items: {} },
  typographyData: { tree: [], items: {} },
  colorsData: { tree: [], items: {} },
  fontsData: { tree: [], items: {} },
  fieldResources: {},
  dialogueDefaultValues: {
    "dialogue-character-name": "Character",
    "dialogue-content": "This is a sample dialogue content.",
  },
  choiceDefaultValues: {
    choicesNum: 2,
    choices: ["Choice 1", "Choice 2"],
  },
  contextMenuItems: [
    {
      label: "Container",
      type: "item",
      value: {
        action: "new-child-item",
        type: "container",
        name: "New Container",
        x: 0,
        y: 0,
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
        name: "New Sprite",
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
        name: "New Text",
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
  ],
  emptyContextMenuItems: [
    {
      label: "Container",
      type: "item",
      value: {
        action: "new-child-item",
        type: "container",
        name: "New Container",
        x: 0,
        y: 0,
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
        name: "New Sprite",
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
        name: "New Text",
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
  ],
});

export const incrementFormKeyCheckpoint = (state) => {
  state.formKeyCheckpoint = state.formKeyCheckpoint + 1;
};

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
};

export const setImages = (state, images) => {
  state.images = images;
};

export const setTypographyData = (state, typographyData) => {
  state.typographyData = typographyData;
};

export const startDragging = (state, payload) => {
  state.isDragging = true;
  state.dragOffset = {
    x: payload.x,
    y: payload.y,
  };
};

export const stopDragging = (state, isDragging) => {
  state.isDragging = isDragging;
  state.dragOffset = { x: 0, y: 0 };
};

export const setColorsData = (state, colorsData) => {
  state.colorsData = colorsData;
};

export const setFontsData = (state, fontsData) => {
  state.fontsData = fontsData;
};

export const setFieldResources = (state, resources) => {
  state.fieldResources = resources;
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
    dragOffset: state.dragOffset,
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

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.layoutData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const showImageSelectorDialog = (
  state,
  { fieldName, groups, currentValue },
) => {
  state.imageSelectorDialog.isOpen = true;
  state.imageSelectorDialog.fieldName = fieldName;
  state.imageSelectorDialog.groups = groups || [];
  state.imageSelectorDialog.selectedImageId = currentValue || null;
};

export const hideImageSelectorDialog = (state) => {
  state.imageSelectorDialog.isOpen = false;
  state.imageSelectorDialog.groups = [];
  state.imageSelectorDialog.selectedImageId = null;
};

export const setTempSelectedImageId = (state, { imageId }) => {
  state.imageSelectorDialog.selectedImageId = imageId;
};

export const selectImageSelectorDialog = ({ state }) => {
  return state.imageSelectorDialog;
};

export const showDropdownMenuForImageField = (
  state,
  { position, fieldName },
) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    items: [{ label: "Delete", type: "item", value: "delete-image" }],
    fieldName,
  };
};

export const hideDropdownMenu = (state) => {
  state.dropdownMenu = {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    fieldName: null,
  };
};

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

export const selectDropdownMenuFieldName = ({ state }) => {
  return state.dropdownMenu.fieldName;
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

  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Helper to transform images data into groups
  const imageGroups = toFlatGroups(state.images);

  // Helper to transform typography data into groups
  const typographyGroups = toFlatGroups(state.typographyData);
  const typographyItems = typographyGroups.flatMap((group) =>
    group.children.map((item) => ({
      label: item.name,
      value: item.id,
    })),
  );

  // Create form configuration based on selected item type
  const form = selectedItem
    ? {
        fields: [
          {
            name: "$when",
            inputType: "inputText",
            description: "$when",
          },
          {
            name: "$each",
            inputType: "inputText",
            description: "$each",
          },
          ...(selectedItem.type === "text" ||
          selectedItem.type === "text-revealing"
            ? [
                {
                  name: "text",
                  inputType: "popover-input",
                  description: "Text Content",
                },
                {
                  name: "typographyId",
                  inputType: "select",
                  description: "Typography Style",
                  options: [...typographyItems],
                },
                {
                  name: "style_wordWrapWidth",
                  inputType: "popover-input",
                  description: "Word Wrap Width",
                },
                {
                  name: "style_align",
                  inputType: "select",
                  description: "Text Alignment",
                  options: [
                    { label: "Left", value: "left" },
                    { label: "Center", value: "center" },
                    { label: "Right", value: "right" },
                  ],
                },
                {
                  name: "hoverTypographyId",
                  inputType: "select",
                  description: "Hover Style",
                  options: [{ label: "None", value: "" }, ...typographyItems],
                },
                {
                  name: "clickedTypographyId",
                  inputType: "select",
                  description: "Clicked Style",
                  options: [{ label: "None", value: "" }, ...typographyItems],
                },
              ]
            : []),
          ...(selectedItem.type === "sprite" ? [] : []),
          ...(selectedItem.type === "container"
            ? [
                {
                  name: "direction",
                  inputType: "select",
                  description: "Direction",
                  options: [
                    { label: "None", value: undefined },
                    { label: "Horizontal", value: "horizontal" },
                    { label: "Vertical", value: "vertical" },
                  ],
                  required: true,
                },
              ]
            : []),
        ],
      }
    : null;

  // Create default values for the form
  const defaultValues = selectedItem
    ? {
        actions: selectedItem?.eventPayload?.actions || {},
        $when: selectedItem.$when,
        $each: selectedItem.$each,
        name: selectedItem.name,
        type: selectedItem.type,
        x: selectedItem.x,
        y: selectedItem.y,
        width: selectedItem.width,
        height: selectedItem.height,
        anchor: { x: selectedItem.anchorX, y: selectedItem.anchorY },
        scaleX: selectedItem.scaleX,
        scaleY: selectedItem.scaleY,
        rotation: selectedItem.rotation,
        ...(selectedItem.type === "text"
          ? {
              contentType: selectedItem.contentType,
              text: selectedItem.text,
              typographyId: selectedItem.typographyId ?? "",
              hoverTypographyId: selectedItem.hoverTypographyId ?? "",
              clickedTypographyId: selectedItem.clickedTypographyId ?? "",
              style_align: selectedItem.style?.align ?? "left",
              style_wordWrapWidth: parseInt(
                selectedItem.style?.wordWrapWidth ?? 300,
              ),
            }
          : {}),
        ...(selectedItem.type === "sprite"
          ? {
              imageId: selectedItem.imageId ?? "",
              hoverImageId: selectedItem.hoverImageId ?? "",
              clickImageId: selectedItem.clickImageId ?? "",
            }
          : {}),
        ...(selectedItem.type === "container"
          ? {
              direction: selectedItem.direction,
              containerType: selectedItem.containerType,
            }
          : {}),
      }
    : {};

  const context = {
    layoutType: state.layout?.layoutType,
    ...defaultValues,
  };

  const choicesContext = {
    ...state.choiceDefaultValues,
  };

  // Create mock repository state for systemActions component
  const repositoryStateForActions = {
    images: state.images,
    audio: { items: {} }, // No audio data in layoutEditor
    layouts: { items: {}, tree: [] }, // No layouts data needed in layoutEditor context
    characters: { items: {} }, // No characters data in layoutEditor
    scenes: { items: {}, tree: [] }, // No scenes data in layoutEditor
  };

  return {
    item,
    flatItems,
    flatGroups,
    selectedItemId: state.selectedItemId,
    repositoryTarget: `layouts.items.${state.layout?.id}.elements`,
    repositoryStateForActions,
    resourceCategory: "userInterface",
    selectedResourceId: "layout-editor",
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
    images: state.images,
    imageGroups,
    typographyData: state.typographyData,
    typographyGroups,
    colorsData: state.colorsData,
    fontsData: state.fontsData,
    form,
    context,
    defaultValues,
    dialogueForm,
    dialogueDefaultValues: state.dialogueDefaultValues,
    choiceForm,
    choiceDefaultValues: state.choiceDefaultValues,
    choicesContext,
    layout: state.layout,
    imageSelectorDialog: {
      isOpen: state.imageSelectorDialog.isOpen,
      groups: state.imageSelectorDialog.groups,
      selectedImageId: state.imageSelectorDialog.selectedImageId,
    },
    dropdownMenu: state.dropdownMenu,
    formKey: `${state.selectedItemId}-${state.formKeyCheckpoint}`,
    presentationState: {},
    anchorOptions: [
      { label: "Top Left", value: { x: 0, y: 0 } },
      { label: "Top Center", value: { x: 0.5, y: 0 } },
      { label: "Top Right", value: { x: 1, y: 0 } },
      { label: "Center Left", value: { x: 0, y: 0.5 } },
      { label: "Center", value: { x: 0.5, y: 0.5 } },
      { label: "Center Right", value: { x: 1, y: 0.5 } },
      { label: "Bottom Left", value: { x: 0, y: 1 } },
      { label: "Bottom Center", value: { x: 0.5, y: 1 } },
      { label: "Bottom Right", value: { x: 1, y: 1 } },
    ],
    directionOption: [
      [
        { label: "None", value: undefined },
        { label: "Horizontal", value: "horizontal" },
        { label: "Vertical", value: "vertical" },
      ],
    ],
  };
};
