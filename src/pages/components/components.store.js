import { toFlatGroups, toFlatItems } from "../../deps/repository";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", label: "Name" },
    { name: "typeDisplay", inputType: "read-only-text", label: "Type" },
    { name: "fullPath", inputType: "read-only-text", label: "Path" },
  ],
};

export const INITIAL_STATE = Object.freeze({
  componentsData: { tree: [], items: {} },
  selectedItemId: null,
  fieldResources: {},
});

export const setFieldResources = (state, resources) => {
  state.fieldResources = resources;
};

export const setItems = (state, componentsData) => {
  state.componentsData = componentsData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.componentsData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.componentsData);
  const flatGroups = toFlatGroups(state.componentsData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into form defaults
  let defaultValues = {};

  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      typeDisplay: selectedItem.type === "component" ? "Component" : "Folder",
      fullPath: selectedItem.fullLabel || selectedItem.name || "",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "components",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "components",
    form,
    defaultValues,
    fieldResources: state.fieldResources,
  };
};
