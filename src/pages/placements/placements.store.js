import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", label: "Name" },
    { name: "x", inputType: "popover-input", label: "Position X" },
    { name: "y", inputType: "popover-input", label: "Position Y" },
    { name: "scaleX", inputType: "popover-input", label: "Scale X" },
    { name: "scaleY", inputType: "popover-input", label: "Scale Y" },
    { name: "anchorX", inputType: "popover-input", label: "Anchor X" },
    { name: "anchorY", inputType: "popover-input", label: "Anchor Y" },
    { name: "rotation", inputType: "popover-input", label: "Rotation" },
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
