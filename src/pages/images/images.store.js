import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

export const INITIAL_STATE = Object.freeze({
  imagesData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, imagesData) => {
  state.imagesData = imagesData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.imagesData contains the full structure with tree and items
  const flatItems = toFlatItems(state.imagesData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const toViewData = ({ state }) => {
  const flatItems = toFlatItems(state.imagesData);
  const flatGroups = toFlatGroups(state.imagesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into detailPanel props
  let detailFields;
  if (selectedItem) {
    detailFields = [
      {
        type: "image",
        fileId: selectedItem.fileId,
        width: 240,
        height: 135,
        editable: true,
        accept: "image/*",
        eventType: "image-file-selected",
      },
      { id: "name", type: "text", value: selectedItem.name, editable: true },
      { type: "text", label: "File Type", value: selectedItem.fileType },
      {
        type: "text",
        label: "File Size",
        value: formatFileSize(selectedItem.fileSize),
      },
      {
        type: "text",
        label: "Dimensions",
        value: `${selectedItem.width} × ${selectedItem.height}`,
      },
    ];
  }

  const detailEmptyMessage = "No selection";

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "images",
    selectedItemId: state.selectedItemId,
    detailTitle: undefined,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: "images",
  };
};
