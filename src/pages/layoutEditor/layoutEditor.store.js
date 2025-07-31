import { toFlatItems, toFlatGroups } from "../../deps/repository";

const flattenObject = (obj, prefix = "") => {
  const result = {};

  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}_${key}` : key;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  });

  return result;
};

// TODO: get global screen size from store
const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;

export const INITIAL_STATE = Object.freeze({
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
        anchorX: 0.5,
        anchorY: 0.5,
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
        width: 100,
        height: 100,
        anchorX: 0.5,
        anchorY: 0.5,
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
        anchorX: 0.5,
        anchorY: 0.5,
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
        x: SCREEN_WIDTH / 2,
        y: SCREEN_HEIGHT / 2,
        width: 100,
        height: 100,
        anchorX: 0.5,
        anchorY: 0.5,
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
        x: SCREEN_WIDTH / 2,
        y: SCREEN_HEIGHT / 2,
        width: 100,
        height: 100,
        anchorX: 0.5,
        anchorY: 0.5,
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
        x: SCREEN_WIDTH / 2,
        y: SCREEN_HEIGHT / 2,
        text: "text",
        style: {
          wordWrapWidth: 300,
          align: "left",
        },
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      },
    },
  ],
});

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

export const setImages = (state, images) => {
  state.images = images;
};

export const setTypographyData = (state, typographyData) => {
  state.typographyData = typographyData;
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

export const selectLayoutId = ({ state }) => {
  return state.layoutId;
};

export const selectCurrentLayoutType = ({ state }) => {
  return state.layoutType;
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

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.layoutData);
  const flatGroups = toFlatGroups(state.layoutData);

  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Helper to transform images data into groups
  const imageGroups = toFlatGroups(state.images);
  const imageItems = state.images.items;

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
            name: "x",
            inputType: "popover-input",
            description: "X Position",
            min: 0,
            max: SCREEN_WIDTH,
            step: 1,
          },
          {
            name: "y",
            inputType: "popover-input",
            description: "Y Position",
            min: 0,
            max: SCREEN_HEIGHT,
            step: 1,
          },
          {
            name: "width",
            inputType: "popover-input",
            description: "Width",
            min: 1,
            max: SCREEN_WIDTH,
            step: 1,
          },
          {
            name: "height",
            inputType: "popover-input",
            description: "Height",
            min: 1,
            max: SCREEN_HEIGHT,
            step: 1,
          },
          {
            name: "anchorX",
            inputType: "popover-input",
            description: "Anchor X (0-1)",
            min: 0,
            max: 1,
            step: 0.1,
          },
          {
            name: "anchorY",
            inputType: "popover-input",
            description: "Anchor Y (0-1)",
            min: 0,
            max: 1,
            step: 0.1,
          },
          {
            name: "scaleX",
            inputType: "popover-input",
            description: "Scale X",
            min: 0.1,
            max: 4,
            step: 0.1,
          },
          {
            name: "scaleY",
            inputType: "popover-input",
            description: "Scale Y",
            min: 0.1,
            max: 4,
            step: 0.1,
          },
          {
            name: "rotation",
            inputType: "popover-input",
            description: "Rotation",
            min: -360,
            max: 360,
            step: 1,
          },
          ...(selectedItem.type === "text"
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
        ],
      }
    : null;

  // Create default values for the form
  const defaultValues = selectedItem
    ? flattenObject({
        name: selectedItem.name,
        type: selectedItem.type,
        x: selectedItem.x,
        y: selectedItem.y,
        width: selectedItem.width,
        height: selectedItem.height,
        anchorX: selectedItem.anchorX,
        anchorY: selectedItem.anchorY,
        scaleX: selectedItem.scaleX,
        scaleY: selectedItem.scaleY,
        rotation: selectedItem.rotation,
        ...(selectedItem.type === "text"
          ? {
              text: selectedItem.text,
              typographyId: selectedItem.typographyId ?? "",
              hoverTypographyId: selectedItem.hoverTypographyId ?? "",
              clickedTypographyId: selectedItem.clickedTypographyId ?? "",
              style: {
                align: selectedItem.style?.align ?? "left",
                wordWrapWidth: parseInt(
                  selectedItem.style?.wordWrapWidth ?? 300,
                ),
              },
            }
          : {}),
        ...(selectedItem.type === "sprite"
          ? {
              imageId: selectedItem.imageId ?? "",
              hoverImageId: selectedItem.hoverImageId ?? "",
              clickImageId: selectedItem.clickImageId ?? "",
            }
          : {}),
      })
    : {};

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
    defaultValues,
    imageSelectorDialog: {
      isOpen: state.imageSelectorDialog.isOpen,
      groups: state.imageSelectorDialog.groups,
      selectedImageId: state.imageSelectorDialog.selectedImageId,
    },
    dropdownMenu: state.dropdownMenu,
  };
};
