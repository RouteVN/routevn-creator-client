
import { toFlatGroups, toFlatItems } from "../../deps/repository";

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const INITIAL_STATE = Object.freeze({
  spritesData: { tree: [], items: {} },
  selectedItemId: undefined,
  characterId: undefined,
});

export const setItems = (state, spritesData) => {
  state.spritesData = spritesData
}

export const setCharacterId = (state, characterId) => {
  state.characterId = characterId;
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const selectCharacterId = ({ state }) => {
  return state.characterId;
}

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.spritesData contains the full structure with tree and items
  const flatItems = toFlatItems(state.spritesData);
  return flatItems.find(item => item.id === state.selectedItemId);
}

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.spritesData);
  const flatGroups = toFlatGroups(state.spritesData);

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'image' ? 'Sprite' : 'Folder',
    displayFileType: selectedItem.fileType || (selectedItem.type === 'image' ? 'PNG' : null),
    displayFileSize: selectedItem.fileSize ? formatFileSize(selectedItem.fileSize) : null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? 'Sprite Details' : null;
  const detailFields = selectedItemDetails ? [
    { type: 'image', fileId: selectedItemDetails.fileId, width: 240, height: 135 },
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'File Type', value: selectedItemDetails.displayFileType, show: !!selectedItemDetails.displayFileType },
    { type: 'text', label: 'File Size', value: selectedItemDetails.displayFileSize, show: !!selectedItemDetails.displayFileSize },
    { type: 'text', label: 'Path', value: selectedItemDetails.fullPath, size: 'sm' }
  ] : [];
  const detailEmptyMessage = 'Select a sprite to view details';

  return {
    flatItems,
    flatGroups,
    resourceCategory: 'assets',
    selectedResourceId: 'character-sprites',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: `characters.items.${state.characterId}.sprites`,
  };
}

