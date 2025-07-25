import { toFlatItems, toFlatGroups } from "../../deps/repository";

// TODO: get global screen size from store
const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;

export const INITIAL_STATE = Object.freeze({
  layoutData: { tree: [], items: {} },
  selectedItemId: null,
  layoutId: null,
  images: { tree: [], items: {} },
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

export const selectLayoutId = ({ state }) => {
  return state.layoutId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.layoutData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.layoutData);
  const flatGroups = toFlatGroups(state.layoutData);

  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Helper to transform images data into groups
  const imageGroups = toFlatGroups(state.images);

  const detailTitle = selectedItem ? "Layout Item Details" : "";
  const detailFields = selectedItem
    ? [
        {
          type: "text",
          label: "Name",
          value: selectedItem.name,
          name: "name",
          editable: true,
        },
        { type: "text", label: "Type", value: selectedItem.type },
        {
          type: "number",
          label: "X Position",
          value: selectedItem.x,
          name: "x",
          editable: true,
          min: 0,
          max: SCREEN_WIDTH,
          step: 1,
        },
        {
          type: "number",
          label: "Y Position",
          value: selectedItem.y,
          name: "y",
          editable: true,
          min: 0,
          max: SCREEN_HEIGHT,
          step: 1,
        },
        {
          type: "number",
          label: "Width",
          value: selectedItem.width,
          name: "width",
          editable: true,
          min: 1,
          max: SCREEN_WIDTH,
          step: 1,
        },
        {
          type: "number",
          label: "Height",
          value: selectedItem.height,
          name: "height",
          editable: true,
          min: 1,
          max: SCREEN_HEIGHT,
          step: 1,
        },
        {
          type: "number",
          label: "Anchor X (0-1)",
          value: selectedItem.anchorX,
          name: "anchorX",
          editable: true,
          min: 0,
          max: 1,
          step: 0.1,
        },
        {
          type: "number",
          label: "Anchor Y (0-1)",
          value: selectedItem.anchorY,
          name: "anchorY",
          editable: true,
          min: 0,
          max: 1,
          step: 0.1,
        },
        {
          type: "number",
          label: "Scale X",
          value: selectedItem.scaleX,
          name: "scaleX",
          editable: true,
          min: 0.1,
          max: 4,
          step: 0.1,
        },
        {
          type: "number",
          label: "Scale Y",
          value: selectedItem.scaleY,
          name: "scaleY",
          editable: true,
          min: 0.1,
          max: 4,
          step: 0.1,
        },
        {
          type: "number",
          label: "Rotation",
          value: selectedItem.rotation,
          name: "rotation",
          editable: true,
          min: -360,
          max: 360,
          step: 1,
        },
        ...(selectedItem.type === "text"
          ? [
              {
                type: "text",
                label: "Text Content",
                value: selectedItem.text,
                name: "text",
                editable: true,
              },
            ]
          : []),
        ...(selectedItem.type === "sprite"
          ? [
              {
                type: "image-selector",
                label: "Image",
                value: selectedItem.imageId || "",
                name: "imageId",
                editable: true,
              },
            ]
          : []),
      ]
    : [];
  const detailEmptyMessage = "Select a layout item to view details";

  return {
    flatItems,
    flatGroups,
    selectedItemId: state.selectedItemId,
    repositoryTarget: `layouts.items.${state.layoutId}.elements`,
    detailTitle,
    detailFields,
    detailEmptyMessage,
    resourceCategory: "userInterface",
    selectedResourceId: "layout-editor",
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
    images: state.images,
    imageGroups,
  };
};
