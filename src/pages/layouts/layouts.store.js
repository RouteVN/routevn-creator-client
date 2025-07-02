
import { toFlatGroups, toFlatItems } from "../../deps/repository";

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const INITIAL_STATE = Object.freeze({
  layoutsData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, layoutsData) => {
  state.layoutsData = layoutsData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.layoutsData);
  return flatItems.find(item => item.id === state.selectedItemId);
}

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.layoutsData);
  const flatGroups = toFlatGroups(state.layoutsData);

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'layout' ? 'Layout' : 'Folder',
    displayFileType: selectedItem.fileType || (selectedItem.type === 'layout' ? 'YAML' : null),
    displayFileSize: selectedItem.fileSize ? formatFileSize(selectedItem.fileSize) : null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? 'Layout Details' : null;
  const detailFields = selectedItemDetails ? [
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'File Type', value: selectedItemDetails.displayFileType, show: !!selectedItemDetails.displayFileType },
    { type: 'text', label: 'File Size', value: selectedItemDetails.displayFileSize, show: !!selectedItemDetails.displayFileSize },
    { type: 'text', label: 'Path', value: selectedItemDetails.fullPath, size: 'sm' }
  ] : [];
  const detailEmptyMessage = 'Select a layout to view details';

  return {
    flatItems,
    flatGroups,
    resourceCategory: 'userInterface',
    selectedResourceId: 'layouts',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: 'layouts',
  };
}
