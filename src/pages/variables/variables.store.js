import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", label: "Name" },
    {
      name: "variableType",
      inputType: "popover-input",
      label: "Variable Type",
    },
    {
      name: "initialValue",
      inputType: "popover-input",
      label: "Initial Value",
    },
    { name: "readonly", inputType: "popover-input", label: "Read Only" },
  ],
};

export const INITIAL_STATE = Object.freeze({
  variablesData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, variablesData) => {
  state.variablesData = variablesData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.variablesData);
  const flatGroups = toFlatGroups(state.variablesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      variableType: selectedItem.variableType || "",
      initialValue: selectedItem.initialValue || "",
      readonly: selectedItem.readonly ? "true" : "false",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "systemConfig",
    selectedResourceId: "variables",
    repositoryTarget: "variables",
    selectedItemId: state.selectedItemId,
    form,
    defaultValues,
  };
};
