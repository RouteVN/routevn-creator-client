
import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

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

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.videosData contains the full structure with tree and items
  const flatItems = toFlatItems(state.videosData);
  return flatItems.find(item => item.id === state.selectedItemId);
}

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
}

export const toViewData = ({ state }) => {
  const flatItems = toFlatItems(state.videosData);
  const flatGroups = toFlatGroups(state.videosData);

  // Get selected item details
  const selectedItem = state.selectedItemId ?
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Transform selectedItem into detailPanel props
  let detailFields
  if (selectedItem) {
    detailFields = [
      { type: 'image', fileId: selectedItem.thumbnailFileId, width: 240, height: 135, editable: true, accept: 'video/*', eventType: 'video-file-selected' },
      { id: 'name', type: 'text', value: selectedItem.name, editable: true },
      { type: 'text', label: 'File Type', value: selectedItem.fileType },
      { type: 'text', label: 'File Size', value: formatFileSize(selectedItem.fileSize) },
    ];
  }

  const detailEmptyMessage = 'No selection';

  return {
    flatItems,
    flatGroups,
    resourceCategory: 'assets',
    selectedResourceId: 'videos',
    selectedItemId: state.selectedItemId,
    detailTitle: undefined,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: 'videos',
  };
}

