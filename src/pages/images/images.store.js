import { toFlatGroups, toFlatItems } from "../../deps/repository";

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const INITIAL_STATE = Object.freeze({
  imagesData: { tree: [], items: {} },
  selectedItemId: null,
});

// Removed addItem - not used with new tree structure

export const setItems = (state, imagesData) => {
  state.imagesData = imagesData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.imagesData contains the full structure with tree and items
  const flatItems = toFlatItems(state.imagesData);
  return flatItems.find(item => item.id === state.selectedItemId);
}

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.imagesData);
  const flatGroups = toFlatGroups(state.imagesData);

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'image' ? 'Image' : 'Folder',
    displayFileType: selectedItem.fileType || (selectedItem.type === 'image' ? 'PNG' : null),
    displayFileSize: selectedItem.fileSize ? formatFileSize(selectedItem.fileSize) : null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  console.log({
    flatItems,
    flatGroups,
    selectedItem,
  });

  // Transform selectedItem into detailPanel props
  const detailFields = selectedItemDetails ? [
    { type: 'image', fileId: selectedItemDetails.fileId, width: 240, height: 135, editable: true },
    { type: 'text', value: selectedItemDetails.name },
    { type: 'text', label: 'File Type', value: selectedItemDetails.displayFileType, show: !!selectedItemDetails.displayFileType },
    { type: 'text', label: 'File Size', value: selectedItemDetails.displayFileSize, show: !!selectedItemDetails.displayFileSize },
  ] : [];
  const detailEmptyMessage = 'No selection';

  return {
    flatItems,
    flatGroups,
    resourceCategory: 'assets',
    selectedResourceId: 'images',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle: undefined,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: 'images',
  };
}

