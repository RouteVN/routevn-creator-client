import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

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

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.audioData);
  return flatItems.find(item => item.id === state.selectedItemId);
}

export const toViewData = ({ state }) => {
  const flatItems = toFlatItems(state.audioData);
  const flatGroups = toFlatGroups(state.audioData);

  // Get selected item details
  const selectedItem = state.selectedItemId ?
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Transform selectedItem into detailPanel props
  let detailFields
  if (selectedItem) {
    detailFields = [
      { type: 'audio', fileId: selectedItem.fileId, editable: true, accept: 'audio/*', eventType: 'audio-file-selected' },
      { type: 'text', value: selectedItem.name },
      { type: 'text', label: 'File Type', value: selectedItem.fileType },
      { type: 'text', label: 'File Size', value: formatFileSize(selectedItem.fileSize) },
    ];
  }

  const detailEmptyMessage = 'No selection';

  return {
    flatItems,
    flatGroups,
    resourceCategory: 'assets',
    selectedResourceId: 'audio',
    selectedItemId: state.selectedItemId,
    detailTitle: undefined,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: 'audio',
  };
}

