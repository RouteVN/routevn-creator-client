
import { toFlatGroups, toFlatItems } from "../../repository";

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const INITIAL_STATE = Object.freeze({
  videosData: { tree: [], items: {} },
  selectedItemId: null,
  videoUrls: {}, // Cache for video URLs by fileId
});

export const setItems = (state, videosData) => {
  state.videosData = videosData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const setVideoUrl = (state, { fileId, url }) => {
  state.videoUrls[fileId] = url;
}

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.videosData);
  const flatGroups = toFlatGroups(state.videosData);

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'video' ? 'Video' : 'Folder',
    displayFileType: selectedItem.fileType || (selectedItem.type === 'video' ? 'MP4' : null),
    displayFileSize: selectedItem.fileSize ? formatFileSize(selectedItem.fileSize) : null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? 'Video Details' : null;
  const detailFields = selectedItemDetails && selectedItemDetails.type === 'video' ? [
    { type: 'video', fileId: selectedItemDetails.fileId, width: 240, height: 135, autoPlay: true, controls: true, videoUrl: state.videoUrls[selectedItemDetails.fileId] },
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'File Type', value: selectedItemDetails.displayFileType, show: !!selectedItemDetails.displayFileType },
    { type: 'text', label: 'File Size', value: selectedItemDetails.displayFileSize, show: !!selectedItemDetails.displayFileSize },
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
    selectedResourceId: 'videos',
    repositoryTarget: 'videos',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
  };
}

