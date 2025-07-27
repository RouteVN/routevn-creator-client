import { toFlatGroups, toFlatItems } from "../../deps/repository";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", description: "Name" },
    { name: "hex", inputType: "read-only-text", description: "Hex Value" },
  ],
};

export const INITIAL_STATE = Object.freeze({
  colorsData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, colorsData) => {
  state.colorsData = colorsData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.colorsData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.colorsData);
  const flatGroups = toFlatGroups(state.colorsData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      hex: selectedItem.hex || "",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "colors",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "colors",
    form,
    defaultValues,
  };
};
