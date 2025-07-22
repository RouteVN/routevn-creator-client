import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

export const INITIAL_STATE = Object.freeze({
  fontsData: { tree: [], items: {} },
  selectedItemId: null,
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

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.fontsData);
  const flatGroups = toFlatGroups(state.fontsData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem
    ? {
        ...selectedItem,
        typeDisplay: selectedItem.type === "font" ? "Font" : "Folder",
        displayFileType:
          selectedItem.fileType ||
          (selectedItem.type === "font" ? "TTF" : null),
        displayFileSize: selectedItem.fileSize
          ? formatFileSize(selectedItem.fileSize)
          : null,
        fullPath: selectedItem.fullLabel || selectedItem.name || "",
      }
    : null;

  console.log({
    flatItems,
    flatGroups,
    selectedItem,
  });

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? "Details" : null;
  const detailFields = selectedItemDetails
    ? [
        // Add font preview first if it's a font file
        ...(selectedItemDetails.type === "font"
          ? [
              {
                type: "font",
                fontFamily: selectedItemDetails.fontFamily || "sans-serif",
                previewText: "Aa",
                fileId: selectedItemDetails.fileId,
                editable: true,
                accept: ".ttf,.otf,.woff,.woff2",
              },
            ]
          : []),
        {
          type: "text",
          label: "Name",
          value: selectedItemDetails.name,
          name: "name",
          editable: true,
        },
        { type: "text", label: "Type", value: selectedItemDetails.typeDisplay },
        {
          type: "text",
          label: "File Type",
          value: selectedItemDetails.displayFileType,
          show: !!selectedItemDetails.displayFileType,
        },
        {
          type: "text",
          label: "File Size",
          value: selectedItemDetails.displayFileSize,
          show: !!selectedItemDetails.displayFileSize,
        },
      ]
    : [];
  const detailEmptyMessage = "No selection";

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "fonts",
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: "fonts",
  };
};
