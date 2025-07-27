import { toFlatItems, toFlatGroups } from "../../deps/repository";

// TODO: get global screen size from store
const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;

export const INITIAL_STATE = Object.freeze({
  layoutData: { tree: [], items: {} },
  selectedItemId: null,
  layoutId: null,
  images: { tree: [], items: {} },
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

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const setImages = (state, images) => {
  state.images = images;
};

export const setFieldResources = (state, resources) => {
  state.fieldResources = resources;
};

export const selectLayoutId = ({ state }) => {
  return state.layoutId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.layoutData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

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

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.layoutData);
  const flatGroups = toFlatGroups(state.layoutData);

  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Helper to transform images data into groups
  const imageGroups = toFlatGroups(state.images);
  const imageItems = state.images.items;

  // Create form configuration based on selected item type
  const form = selectedItem ? {
    fields: [
      { name: "name", inputType: "popover-input", label: "Name" },
      { name: "type", inputType: "read-only-text", label: "Type" },
      { name: "x", inputType: "number-input", label: "X Position", min: 0, max: SCREEN_WIDTH, step: 1 },
      { name: "y", inputType: "number-input", label: "Y Position", min: 0, max: SCREEN_HEIGHT, step: 1 },
      { name: "width", inputType: "number-input", label: "Width", min: 1, max: SCREEN_WIDTH, step: 1 },
      { name: "height", inputType: "number-input", label: "Height", min: 1, max: SCREEN_HEIGHT, step: 1 },
      { name: "anchorX", inputType: "number-input", label: "Anchor X (0-1)", min: 0, max: 1, step: 0.1 },
      { name: "anchorY", inputType: "number-input", label: "Anchor Y (0-1)", min: 0, max: 1, step: 0.1 },
      { name: "scaleX", inputType: "number-input", label: "Scale X", min: 0.1, max: 4, step: 0.1 },
      { name: "scaleY", inputType: "number-input", label: "Scale Y", min: 0.1, max: 4, step: 0.1 },
      { name: "rotation", inputType: "number-input", label: "Rotation", min: -360, max: 360, step: 1 },
      ...(selectedItem.type === "text" ? [
        { name: "text", inputType: "popover-input", label: "Text Content" },
      ] : []),
      ...(selectedItem.type === "sprite" ? [
        { name: "imageId", inputType: "image-selector", label: "Image" },
        { name: "hoverImageId", inputType: "image-selector", label: "Hover Image" },
        { name: "clickImageId", inputType: "image-selector", label: "Click Image" },
      ] : []),
    ],
  } : null;

  // Create default values for the form
  const defaultValues = selectedItem ? {
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
    ...(selectedItem.type === "text" ? {
      text: selectedItem.text,
    } : {}),
    ...(selectedItem.type === "sprite" ? {
      imageId: selectedItem.imageId ?? "",
      hoverImageId: selectedItem.hoverImageId ?? "",
      clickImageId: selectedItem.clickImageId ?? "",
    } : {}),
  } : {};

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
    form,
    defaultValues,
    fieldResources: state.fieldResources,
  };
};
