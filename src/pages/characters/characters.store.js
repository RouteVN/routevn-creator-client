
import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

export const INITIAL_STATE = Object.freeze({
  charactersData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, charactersData) => {
  state.charactersData = charactersData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.charactersData contains the full structure with tree and items
  const flatItems = toFlatItems(state.charactersData);
  return flatItems.find(item => item.id === state.selectedItemId);
}

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.charactersData);
  const flatGroups = toFlatGroups(state.charactersData);

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'character' ? 'Character' : 'Folder',
    displayFileType: selectedItem.fileType || (selectedItem.type === 'character' ? 'PNG' : null),
    displayFileSize: selectedItem.fileSize ? formatFileSize(selectedItem.fileSize) : null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  console.log({
    flatItems,
    flatGroups,
    selectedItem,
  });

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? 'Character Details' : null;
  const detailFields = selectedItemDetails ? [
    // Always show character avatar - editable for uploading/replacing
    { 
      type: 'image', 
      fileId: selectedItemDetails.fileId || null, 
      width: 240, 
      height: 135, 
      editable: true 
    },
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Description', value: selectedItemDetails.description || 'No description provided', size: 'md' },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'File Type', value: selectedItemDetails.displayFileType, show: !!selectedItemDetails.displayFileType },
    { type: 'text', label: 'File Size', value: selectedItemDetails.displayFileSize, show: !!selectedItemDetails.displayFileSize },
    { type: 'text', label: 'Path', value: selectedItemDetails.fullPath, size: 'sm' }
  ] : [];
  const detailEmptyMessage = 'Select a character to view details';

  return {
    flatItems,
    flatGroups,
    resourceCategory: 'assets',
    selectedResourceId: 'characters',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: 'characters',
  };
}
