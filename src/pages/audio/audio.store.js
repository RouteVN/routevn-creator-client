import { toFlatGroups, toFlatItems } from "../../deps/repository";

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
  const flatItems = toFlatItems(state.audioData);
  const flatGroups = toFlatGroups(state.audioData);

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
  const detailTitle = selectedItemDetails ? 'Audio Details' : null;
  const detailFields = selectedItemDetails && selectedItemDetails.type === 'audio' ? [
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'File Type', value: selectedItemDetails.displayFileType, show: !!selectedItemDetails.displayFileType },
    { type: 'text', label: 'File Size', value: selectedItemDetails.displayFileSize, show: !!selectedItemDetails.displayFileSize },
    { type: 'text', label: 'Duration', value: selectedItemDetails.duration ? `${Math.round(selectedItemDetails.duration)}s` : 'Unknown', show: !!selectedItemDetails.duration },
    { type: 'waveform', label: 'Waveform', waveformData: selectedItemDetails.waveformData, duration: selectedItemDetails.duration, show: !!selectedItemDetails.waveformData },
    { type: 'text', label: 'Path', value: selectedItemDetails.fullPath, size: 'sm' }
  ] : selectedItemDetails ? [
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'Path', value: selectedItemDetails.fullPath, size: 'sm' }
  ] : [];
  const detailEmptyMessage = 'No selection';
  
  return {
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
}

