import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    {
      name: "fileId",
      inputType: "font",
      previewText: "Aa",
    },
    { name: "name", inputType: "popover-input", label: "Name" },
    { name: "fontFamily", inputType: "read-only-text", label: "Font Family" },
    { name: "fileType", inputType: "read-only-text", label: "File Type" },
    {
      name: "fileSize",
      inputType: "read-only-text",
      label: "File Size",
    },
  ],
};

export const INITIAL_STATE = Object.freeze({
  fontsData: { tree: [], items: {} },
  selectedItemId: null,
  fieldResources: {},
});

export const setItems = (state, fontsData) => {
  state.fontsData = fontsData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.fontsData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const setFieldResources = (state, resources) => {
  state.fieldResources = resources;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.fontsData);
  const flatGroups = toFlatGroups(state.fontsData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      fontFamily: selectedItem.fontFamily || "",
      fileType: selectedItem.fileType || "",
      fileSize: selectedItem.fileSize
        ? formatFileSize(selectedItem.fileSize)
        : "",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "fonts",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "fonts",
    form,
    defaultValues,
    fieldResources: state.fieldResources,
  };
};
