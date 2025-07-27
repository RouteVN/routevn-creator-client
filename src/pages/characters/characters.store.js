import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    {
      name: "fileId",
      inputType: "image",
      width: 240,
    },
    { name: "name", inputType: "popover-input", description: "Name" },
    { name: "description", inputType: "popover-input", description: "Description" },
    { name: "typeDisplay", inputType: "read-only-text", description: "Type" },
    {
      name: "displayFileType",
      inputType: "read-only-text",
      description: "File Type",
    },
    {
      name: "displayFileSize",
      inputType: "read-only-text",
      description: "File Size",
    },
  ],
};

export const INITIAL_STATE = Object.freeze({
  charactersData: { tree: [], items: {} },
  selectedItemId: null,
  fieldResources: {},
});

export const setFieldResources = (state, resources) => {
  state.fieldResources = resources;
};

export const setItems = (state, charactersData) => {
  state.charactersData = charactersData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.charactersData contains the full structure with tree and items
  const flatItems = toFlatItems(state.charactersData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.charactersData);
  const flatGroups = toFlatGroups(state.charactersData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into form defaults
  let defaultValues = {};

  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      description: selectedItem.description || "No description provided",
      typeDisplay: selectedItem.type === "character" ? "Character" : "Folder",
      displayFileType:
        selectedItem.fileType ||
        (selectedItem.type === "character" ? "PNG" : ""),
      displayFileSize: selectedItem.fileSize
        ? formatFileSize(selectedItem.fileSize)
        : "",
      fullPath: selectedItem.fullLabel || selectedItem.name || "",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "characters",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "characters",
    form,
    defaultValues,
    fieldResources: state.fieldResources,
  };
};
