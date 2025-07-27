import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", description: "Name" },
    { name: "x", inputType: "read-only-text", description: "Position X" },
    { name: "y", inputType: "read-only-text", description: "Position Y" },
    { name: "scaleX", inputType: "read-only-text", description: "Scale X" },
    { name: "scaleY", inputType: "read-only-text", description: "Scale Y" },
    { name: "anchorX", inputType: "read-only-text", description: "Anchor X" },
    { name: "anchorY", inputType: "read-only-text", description: "Anchor Y" },
    { name: "rotation", inputType: "read-only-text", description: "Rotation" },
  ],
};

export const INITIAL_STATE = Object.freeze({
  placementData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, placementData) => {
  state.placementData = placementData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.placementData);
  const flatGroups = toFlatGroups(state.placementData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      x: selectedItem.x || "",
      y: selectedItem.y || "",
      scaleX: selectedItem.scaleX || "",
      scaleY: selectedItem.scaleY || "",
      anchorX: selectedItem.anchorX || "",
      anchorY: selectedItem.anchorY || "",
      rotation: selectedItem.rotation || "",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "placements",
    repositoryTarget: "placements",
    selectedItemId: state.selectedItemId,
    form,
    defaultValues,
  };
};
