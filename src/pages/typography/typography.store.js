import { toFlatGroups, toFlatItems } from "../../deps/repository";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", description: "Name" },
    { name: "fontSize", inputType: "read-only-text", description: "Font Size" },
    { name: "colorId", inputType: "read-only-text", description: "Color ID" },
    { name: "fontId", inputType: "read-only-text", description: "Font ID" },
    {
      name: "fontWeight",
      inputType: "read-only-text",
      description: "Font Weight",
    },
    {
      name: "previewText",
      inputType: "read-only-text",
      description: "Preview Text",
    },
  ],
};

export const INITIAL_STATE = Object.freeze({
  typographyData: { tree: [], items: {} },
  colorsData: { tree: [], items: {} },
  fontsData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, typographyData) => {
  state.typographyData = typographyData;
};

export const setColorsData = (state, colorsData) => {
  state.colorsData = colorsData;
};

export const setFontsData = (state, fontsData) => {
  state.fontsData = fontsData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.typographyData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.typographyData);
  const flatGroups = toFlatGroups(state.typographyData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      fontSize: selectedItem.fontSize || "",
      colorId: selectedItem.colorId || "",
      fontId: selectedItem.fontId || "",
      fontWeight: selectedItem.fontWeight || "",
      previewText: selectedItem.previewText || "",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "typography",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "typography",
    colorsData: state.colorsData,
    fontsData: state.fontsData,
    form,
    defaultValues,
  };
};
