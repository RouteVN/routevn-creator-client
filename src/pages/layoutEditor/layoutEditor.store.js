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
        textContent: "text",
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
        textContent: "text",
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
  return flatItems.find(item => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.layoutData);
  const flatGroups = toFlatGroups(state.layoutData);
  
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Helper to transform images data into groups
  const imageGroups = toFlatGroups(state.images);
  
  const detailTitle = selectedItem ? 'Layout Item Details' : '';
  const detailFields = selectedItem ? [
    { type: 'text', label: 'Name', value: selectedItem.name, id: 'name', editable: true },
    { type: 'text', label: 'Type', value: selectedItem.type },
    { type: 'text', label: 'X Position', value: selectedItem.x, id: 'x', editable: true },
    { type: 'text', label: 'Y Position', value: selectedItem.y, id: 'y', editable: true },
    ...(selectedItem.type === 'text' ? [
      { type: 'text', label: 'Text Content', value: selectedItem.textContent, id: 'textContent', editable: true }
    ] : []),
    ...(selectedItem.type === 'sprite' ? [
      { 
        type: 'image-selector', 
        label: 'Image', 
        value: selectedItem.imageId || '', 
        id: 'imageId', 
        editable: true
      }
    ] : [])
  ] : [];
  const detailEmptyMessage = 'Select a layout item to view details';
  
  return {
    flatItems,
    flatGroups,
    selectedItemId: state.selectedItemId,
    repositoryTarget: `layouts.items.${state.layoutId}.layout`,
    detailTitle,
    detailFields,
    detailEmptyMessage,
    resourceCategory: 'userInterface',
    selectedResourceId: 'layout-editor',
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
    images: state.images,
    imageGroups,
  };
};