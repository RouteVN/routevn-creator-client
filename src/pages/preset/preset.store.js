import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", label: "Name" },
    { name: "description", inputType: "popover-input", label: "Description" },
  ],
};

export const INITIAL_STATE = Object.freeze({
  presetData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, presetData) => {
  state.presetData = presetData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.presetData);
  const flatGroups = toFlatGroups(state.presetData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      description: selectedItem.description || "",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "systemConfig",
    selectedResourceId: "preset",
    repositoryTarget: "preset",
    selectedItemId: state.selectedItemId,
    form,
    defaultValues,
  };
};
