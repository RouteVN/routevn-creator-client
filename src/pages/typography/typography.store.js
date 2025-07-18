import { toFlatGroups, toFlatItems } from "../../deps/repository";

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

  // Helper functions to resolve IDs to names and values
  const getColorName = (colorId) => {
    if (!colorId) return null;
    const color = toFlatItems(state.colorsData)
      .filter((item) => item.type === "color")
      .find((color) => color.id === colorId);
    return color ? color.name : colorId;
  };

  const getColorHex = (colorId) => {
    if (!colorId) return "#000000";
    const color = toFlatItems(state.colorsData)
      .filter((item) => item.type === "color")
      .find((color) => color.id === colorId);
    return color ? color.hex : "#000000";
  };

  const getFontName = (fontId) => {
    if (!fontId) return null;
    const font = toFlatItems(state.fontsData)
      .filter((item) => item.type === "font")
      .find((font) => font.id === fontId);
    return font ? font.fontFamily : fontId;
  };

  // Compute display values for selected item
  const selectedItemDetails = selectedItem
    ? {
        ...selectedItem,
        typeDisplay:
          selectedItem.type === "typography" ? "Typography" : "Folder",
        displayFontSize: selectedItem.fontSize || null,
        displayFontColor: getColorName(selectedItem.colorId),
        displayFontStyle: getFontName(selectedItem.fontId),
        displayFontWeight: selectedItem.fontWeight || null,
        fullPath: selectedItem.fullLabel || selectedItem.name || "",
      }
    : null;

  // Generate color and font options for dropdowns
  const colorOptions = toFlatItems(state.colorsData)
    .filter((item) => item.type === "color")
    .map((color) => ({
      id: color.id,
      label: color.name,
      value: color.id,
    }));

  const fontOptions = toFlatItems(state.fontsData)
    .filter((item) => item.type === "font")
    .map((font) => ({
      id: font.id,
      label: font.fontFamily,
      value: font.id,
    }));

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? "Typography Details" : null;
  const detailFields = selectedItemDetails
    ? [
        {
          type: "typography",
          name: selectedItemDetails.name,
          fontSize: selectedItemDetails.displayFontSize || "16",
          fontColor: getColorHex(selectedItemDetails.colorId),
          fontStyle: getFontName(selectedItemDetails.fontId),
          fontWeight: selectedItemDetails.displayFontWeight || "normal",
          colorId: selectedItemDetails.colorId || "",
          fontId: selectedItemDetails.fontId || "",
          colorOptions: colorOptions,
          fontOptions: fontOptions,
          show: !!selectedItemDetails.displayFontSize,
        },
        {
          type: "text",
          label: "Name",
          value: selectedItemDetails.name,
          id: "name",
          editable: true,
        },
        { type: "text", label: "Type", value: selectedItemDetails.typeDisplay },
        {
          type: "text",
          label: "Font Size",
          value: selectedItemDetails.displayFontSize,
          show: !!selectedItemDetails.displayFontSize,
        },
        {
          type: "text",
          label: "Font Color",
          value: selectedItemDetails.displayFontColor,
          show: !!selectedItemDetails.displayFontColor,
        },
        {
          type: "text",
          label: "Font Style",
          value: selectedItemDetails.displayFontStyle,
          show: !!selectedItemDetails.displayFontStyle,
        },
        {
          type: "text",
          label: "Font Weight",
          value: selectedItemDetails.displayFontWeight,
          show: !!selectedItemDetails.displayFontWeight,
        },
        {
          type: "text",
          label: "Path",
          value: selectedItemDetails.fullPath,
          size: "sm",
        },
      ].filter((field) => field.show !== false)
    : [];
  const detailEmptyMessage = "Select a typography style to view details";

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "typography",
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: "typography",
    colorsData: state.colorsData,
    fontsData: state.fontsData,
  };
};
