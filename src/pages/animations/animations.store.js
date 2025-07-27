import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", label: "Name" },
    { name: "duration", inputType: "popover-input", label: "Duration" },
    { name: "keyframes", inputType: "popover-input", label: "Keyframes" },
  ],
};

export const INITIAL_STATE = Object.freeze({
  animationsData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, animationsData) => {
  state.animationsData = animationsData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.animationsData);
  const flatGroups = toFlatGroups(state.animationsData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      duration: selectedItem.duration || "",
      keyframes: selectedItem.keyframes || "",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "animations",
    repositoryTarget: "animations",
    selectedItemId: state.selectedItemId,
    form,
    defaultValues,
  };
};
