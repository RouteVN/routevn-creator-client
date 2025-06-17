import { toFlatGroups, toFlatItems } from "../../repository";

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const INITIAL_STATE = Object.freeze({
  presetData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, presetData) => {
  state.presetData = presetData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.presetData);
  const flatGroups = toFlatGroups(state.presetData);

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'preset' ? 'Preset' : 'Folder',
    displayFileType: selectedItem.fileType || (selectedItem.type === 'preset' ? 'JSON' : null),
    displayFileSize: selectedItem.fileSize ? formatFileSize(selectedItem.fileSize) : null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? 'Preset Details' : null;
  const detailFields = selectedItemDetails ? [
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'Description', value: selectedItemDetails.description, show: !!selectedItemDetails.description },
    { type: 'text', label: 'File Type', value: selectedItemDetails.displayFileType, show: !!selectedItemDetails.displayFileType },
    { type: 'text', label: 'File Size', value: selectedItemDetails.displayFileSize, show: !!selectedItemDetails.displayFileSize },
    { type: 'text', label: 'Path', value: selectedItemDetails.fullPath, size: 'sm' }
  ] : [];
  const detailEmptyMessage = 'Select a preset to view details';
  
  const viewData = {
    flatItems,
    flatGroups,
    resourceCategory: 'systemConfig',
    selectedResourceId: 'preset',
    repositoryTarget: 'preset',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
  };
  
  return viewData;
}