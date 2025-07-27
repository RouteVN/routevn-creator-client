import { toFlatGroups, toFlatItems } from "../../deps/repository";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", label: "Name" },
    { name: "typeDisplay", inputType: "read-only-text", label: "Type" },
    { name: "fullPath", inputType: "read-only-text", label: "Path" },
  ],
};

export const INITIAL_STATE = Object.freeze({
  layoutsData: { tree: [], items: {} },
  selectedItemId: null,
  fieldResources: {},
});

export const setFieldResources = (state, resources) => {
  state.fieldResources = resources;
};

export const setItems = (state, layoutsData) => {
  state.layoutsData = layoutsData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.layoutsData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.layoutsData);
  const flatGroups = toFlatGroups(state.layoutsData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into form defaults
  let defaultValues = {};

  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      typeDisplay: selectedItem.type === "layout" ? "Layout" : "Folder",
      fullPath: selectedItem.fullLabel || selectedItem.name || "",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "layouts",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "layouts",
    form,
    defaultValues,
    fieldResources: state.fieldResources,
  };
};
