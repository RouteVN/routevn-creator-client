import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

export const INITIAL_STATE = Object.freeze({
  animationsData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, animationsData) => {
  state.animationsData = animationsData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.animationsData);
  const rawFlatGroups = toFlatGroups(state.animationsData);

  // Use raw flat groups directly since we're now passing animationProperties object
  const flatGroups = rawFlatGroups;

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem
    ? {
        ...selectedItem,
        typeDisplay: selectedItem.type === "animation" ? "Animation" : "Folder",
        displayFileType:
          selectedItem.fileType ||
          (selectedItem.type === "animation" ? "JSON" : null),
        displayFileSize: selectedItem.fileSize
          ? formatFileSize(selectedItem.fileSize)
          : null,
        fullPath: selectedItem.fullLabel || selectedItem.name || "",
      }
    : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? "Details" : null;
  const detailFields = selectedItemDetails
    ? [
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
        {
          type: "text",
          label: "Path",
          value: selectedItemDetails.fullPath,
          size: "sm",
        },
      ]
    : [];
  const detailEmptyMessage = "No selection";

  const viewData = {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "animations",
    repositoryTarget: "animations",
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
  };

  return viewData;
};
