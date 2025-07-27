import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    {
      name: "fileId",
      inputType: "image",
      height: 135,
    },
    { name: "name", inputType: "popover-input", description: "Name" },
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
    { name: "fullPath", inputType: "read-only-text", description: "Path" },
  ],
};

export const INITIAL_STATE = Object.freeze({
  spritesData: { tree: [], items: {} },
  selectedItemId: undefined,
  characterId: undefined,
  fieldResources: {},
});

export const setFieldResources = (state, resources) => {
  state.fieldResources = resources;
};

export const setItems = (state, spritesData) => {
  state.spritesData = spritesData;
};

export const setCharacterId = (state, characterId) => {
  state.characterId = characterId;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectCharacterId = ({ state }) => {
  return state.characterId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.spritesData contains the full structure with tree and items
  if (!state.spritesData || !state.spritesData.items || !state.spritesData.tree)
    return null;
  const flatItems = toFlatItems(state.spritesData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.spritesData);
  const flatGroups = toFlatGroups(state.spritesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into form defaults
  let defaultValues = {};

  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      typeDisplay: selectedItem.type === "image" ? "Sprite" : "Folder",
      displayFileType:
        selectedItem.fileType || (selectedItem.type === "image" ? "PNG" : ""),
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
    selectedResourceId: "character-sprites",
    selectedItemId: state.selectedItemId,
    repositoryTarget: `characters.items.${state.characterId}.sprites`,
    form,
    defaultValues,
    fieldResources: state.fieldResources,
  };
};
