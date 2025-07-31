import { toFlatGroups, toFlatItems } from "../../deps/repository";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", description: "Name" },
    { name: "typeDisplay", inputType: "read-only-text", description: "Type" },
    {
      name: "layoutTypeDisplay",
      inputType: "read-only-text",
      description: "Layout Type",
    },
    { name: "fullPath", inputType: "read-only-text", description: "Path" },
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
    const layoutTypeLabels = {
      normal: "Normal",
      dialogue: "Dialogue", 
      choice: "Choice"
    };
    
    const layoutTypeLabel = selectedItem.layoutType 
      ? layoutTypeLabels[selectedItem.layoutType] || selectedItem.layoutType
      : "";

    defaultValues = {
      name: selectedItem.name,
      typeDisplay: selectedItem.type === "layout" ? "Layout" : "Folder",
      layoutTypeDisplay: layoutTypeLabel,
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
