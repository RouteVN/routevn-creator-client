import { toFlatItems, toFlatGroups } from "../../deps/repository";

export const createInitialState = () => ({
  layoutData: { tree: [], items: {} },
  selectedItemId: null,
  componentId: null,
  images: { tree: [], items: {} },
  contextMenuItems: [
    {
      label: "Container AAA",
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
        text: "text",
      },
    },
    { label: "Rename", type: "item", value: "rename-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  emptyContextMenuItems: [
    {
      label: "Container AAA",
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
        text: "text",
      },
    },
  ],
});

export const setItems = (state, layoutData) => {
  state.layoutData = layoutData;
};

export const setComponentId = (state, componentId) => {
  state.componentId = componentId;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const setImages = (state, { images }) => {
  state.images = images;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const selectSelectedItem = ({ state }) => {
  const flatItems = toFlatItems(state.layoutData);
  return state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : undefined;
};

export const selectComponentId = ({ state }) => {
  return state.componentId;
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.layoutData);
  const flatGroups = toFlatGroups(state.layoutData);
  const imageGroups = toFlatGroups(state.images);

  return {
    flatItems,
    flatGroups,
    imageGroups,
    images: state.images,
    selectedItemId: state.selectedItemId,
    repositoryTarget: `components.items.${state.componentId}.layout`,
    resourceCategory: "userInterface",
    selectedResourceId: "component-editor",
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
  };
};
