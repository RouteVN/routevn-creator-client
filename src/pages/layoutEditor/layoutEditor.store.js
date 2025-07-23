import { toFlatItems, toFlatGroups } from "../../deps/repository";

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
        zIndex: 0,
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
        zIndex: 0,
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
        zIndex: 0,
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
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: 1,
        scaleY: 1,
        zIndex: 0,
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
        zIndex: 0,
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
        zIndex: 0,
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
          type: "text",
          label: "X Position",
          value: selectedItem.x || 0,
          name: "x",
          editable: true,
        },
        {
          type: "text",
          label: "Y Position",
          value: selectedItem.y || 0,
          name: "y",
          editable: true,
        },
        {
          type: "text",
          label: "Width",
          value: selectedItem.width || "",
          name: "width",
          editable: true,
        },
        {
          type: "text",
          label: "Height",
          value: selectedItem.height || "",
          name: "height",
          editable: true,
        },
        {
          type: "text",
          label: "Anchor X (0-1)",
          value: selectedItem.anchorX || 0.5,
          name: "anchorX",
          editable: true,
        },
        {
          type: "text",
          label: "Anchor Y (0-1)",
          value: selectedItem.anchorY || 0.5,
          name: "anchorY",
          editable: true,
        },
        {
          type: "text",
          label: "Scale X",
          value: selectedItem.scaleX || 1,
          name: "scaleX",
          editable: true,
        },
        {
          type: "text",
          label: "Scale Y",
          value: selectedItem.scaleY || 1,
          name: "scaleY",
          editable: true,
        },
        {
          type: "text",
          label: "Z-Index",
          value: selectedItem.zIndex || 0,
          name: "zIndex",
          editable: true,
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
