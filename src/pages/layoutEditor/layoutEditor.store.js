import { toFlatItems, toFlatGroups } from "../../deps/repository";

// TODO: get global screen size from store
const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;

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
    // TODO: think this can be done with $for choice, i in choices: ...
    {
      name: "choices[0]",
      inputType: "inputText",
      description: "Choice Content 1 Text",
      placeholder: "Enter choice text",
    },
    {
      "$if choicesNum > 1": {
        name: "choices[1]",
        inputType: "inputText",
        description: "Choice Content 2 Text",
        placeholder: "Enter choice text",
      },
    },
    {
      "$if choicesNum > 2": {
        name: "choices[2]",
        inputType: "inputText",
        description: "Choice Content 3 Text",
        placeholder: "Enter choice text",
      },
    },
    {
      "$if choicesNum > 3": {
        name: "choices[3]",
        inputType: "inputText",
        description: "Choice Content 4 Text",
        placeholder: "Enter choice text",
      },
    },
    {
      "$if choicesNum > 4": {
        name: "choices[4]",
        inputType: "inputText",
        description: "Choice Content 5 Text",
        placeholder: "Enter choice text",
      },
    },
    {
      "$if choicesNum > 5": {
        name: "choices[5]",
        inputType: "inputText",
        description: "Choice Content 6 Text",
        placeholder: "Enter choice text",
      },
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
  layoutId: null,
  layoutType: null,
  images: { tree: [], items: {} },
  typographyData: { tree: [], items: {} },
  colorsData: { tree: [], items: {} },
  fontsData: { tree: [], items: {} },
  fieldResources: {},
  dialogueDefaultValues: {
    "dialogue-character-name": "Character R",
    "dialogue-content": "This is a sample dialogue content.",
  },
  choiceDefaultValues: {
    choicesNum: 2,
    choices: ["ChoiceA", "ChoiceB"],
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

export const setLayoutId = (state, layoutId) => {
  state.layoutId = layoutId;
};

export const setLayoutType = (state, layoutType) => {
  state.layoutType = layoutType;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const updateSelectedItem = (state, updatedItem) => {
  // Update the selected item in the layoutData
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
  }
};

export const selectDragging = ({ state }) => {
  return {
    isDragging: state.isDragging,
    dragOffset: state.dragOffset,
  };
};

export const selectLayoutId = ({ state }) => {
  return state.layoutId;
};

export const selectCurrentLayoutType = ({ state }) => {
  return state.layoutType;
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
  { fieldIndex, groups, currentValue },
) => {
  state.imageSelectorDialog.isOpen = true;
  state.imageSelectorDialog.fieldIndex = fieldIndex;
  state.imageSelectorDialog.groups = groups || [];
  state.imageSelectorDialog.selectedImageId = currentValue || null;
};

export const hideImageSelectorDialog = (state) => {
  state.imageSelectorDialog.isOpen = false;
  state.imageSelectorDialog.fieldIndex = -1;
  state.imageSelectorDialog.groups = [];
  state.imageSelectorDialog.selectedImageId = null;
};

export const setTempSelectedImageId = (state, { imageId }) => {
  state.imageSelectorDialog.selectedImageId = imageId;
};

export const selectDetailFieldNameByIndex = ({ state }, fieldIndex) => {
  const selectedItem = selectSelectedItem({ state });
  if (!selectedItem) return "imageId";

  // For sprite type, we have 3 image selector fields
  if (selectedItem.type === "sprite") {
    // All the standard fields (name, type, x, y, width, height, etc.)
    const baseFieldsCount = 11;

    // The image selectors start after the base fields
    const imageSelectorStartIndex = baseFieldsCount;

    if (fieldIndex === imageSelectorStartIndex) return "imageId";
    if (fieldIndex === imageSelectorStartIndex + 1) return "hoverImageId";
    if (fieldIndex === imageSelectorStartIndex + 2) return "clickImageId";
  }

  return "imageId"; // default fallback
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
          { name: "name", inputType: "popover-input", description: "Name" },
          { name: "type", inputType: "read-only-text", description: "Type" },
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
          {
            name: "x",
            inputType: "slider-input",
            description: "X Position",
            max: SCREEN_WIDTH,
          },
          {
            name: "y",
            inputType: "slider-input",
            description: "Y Position",
            max: SCREEN_HEIGHT,
          },
          {
            name: "width",
            inputType: "slider-input",
            description: "Width",
            max: SCREEN_WIDTH,
          },
          {
            name: "height",
            inputType: "slider-input",
            description: "Height",
            max: SCREEN_HEIGHT,
          },
          {
            name: "scaleX",
            inputType: "slider-input",
            description: "Scale X",
            min: 0.1,
            max: 4,
            step: 0.1,
          },
          {
            name: "scaleY",
            inputType: "slider-input",
            description: "Scale Y",
            min: 0.1,
            max: 4,
            step: 0.1,
          },
          {
            name: "rotation",
            inputType: "slider-input",
            description: "Rotation",
            min: -360,
            max: 360,
            step: 1,
          },
          {
            name: "anchor",
            inputType: "select",
            description: "Anchor Point",
            options: [
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
          },
          {
            name: "eventPayload",
            inputType: "slot",
            slotName: "eventPayload",
            description: "Event Payload",
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
          ...(selectedItem.type === "sprite"
            ? [
                {
                  name: "imageId",
                  inputType: "image",
                  description: "Image",
                  src: state.fieldResources.imageId?.src,
                },
                {
                  name: "hoverImageId",
                  inputType: "image",
                  description: "Hover Image",
                  src: state.fieldResources.hoverImageId?.src,
                },
                {
                  name: "clickImageId",
                  inputType: "image",
                  description: "Click Image",
                  src: state.fieldResources.clickImageId?.src,
                },
              ]
            : []),
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
        eventPayload: selectedItem.eventPayload,
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
    layoutType: state.layoutType,
    ...defaultValues,
  };

  const choicesContext = {
    ...state.choiceDefaultValues,
  };

  return {
    flatItems,
    flatGroups,
    selectedItemId: state.selectedItemId,
    repositoryTarget: `layouts.items.${state.layoutId}.elements`,
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
    layoutType: state.layoutType,
    imageSelectorDialog: {
      isOpen: state.imageSelectorDialog.isOpen,
      groups: state.imageSelectorDialog.groups,
      selectedImageId: state.imageSelectorDialog.selectedImageId,
    },
    dropdownMenu: state.dropdownMenu,
    formKey: `${state.selectedItemId}-${state.formKeyCheckpoint}`,
  };
};
