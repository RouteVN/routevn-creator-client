import { toFlatGroups, toFlatItems } from "../../repository";

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const INITIAL_STATE = Object.freeze({
  audioData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, audioData) => {
  state.audioData = audioData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const toViewData = ({ state, props }, payload) => {
  console.log("🎵 Audio toViewData called with state:", state);
  
  const flatItems = toFlatItems(state.audioData);
  const flatGroups = toFlatGroups(state.audioData);

  console.log("🎵 Audio processed data:", {
    audioData: state.audioData,
    flatItems,
    flatGroups
  });

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'audio' ? 'Audio' : 'Folder',
    displayFileType: selectedItem.fileType || (selectedItem.type === 'audio' ? 'MP3' : null),
    displayFileSize: selectedItem.fileSize ? formatFileSize(selectedItem.fileSize) : null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? 'Details' : null;
  const detailFields = selectedItemDetails ? [
    { type: 'audio', fileId: selectedItemDetails.fileId, width: 240, height: 60 },
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'File Type', value: selectedItemDetails.displayFileType, show: !!selectedItemDetails.displayFileType },
    { type: 'text', label: 'File Size', value: selectedItemDetails.displayFileSize, show: !!selectedItemDetails.displayFileSize },
    { type: 'text', label: 'Path', value: selectedItemDetails.fullPath, size: 'sm' }
  ] : [];
  const detailEmptyMessage = 'No selection';
  
  const viewData = {
    flatItems,
    flatGroups,
    resourceCategory: 'assets',
    selectedResourceId: 'audio',
    repositoryTarget: 'audio',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
  };
  
  console.log("🎵 Audio returning viewData:", viewData);
  
  return viewData;
}

