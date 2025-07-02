
import { toFlatGroups, toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  colorsData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, colorsData) => {
  state.colorsData = colorsData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.colorsData);
  return flatItems.find(item => item.id === state.selectedItemId);
}

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.colorsData);
  const flatGroups = toFlatGroups(state.colorsData);

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'color' ? 'Color' : 'Folder',
    displayHex: selectedItem.hex || null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? 'Color Details' : null;
  const detailFields = selectedItemDetails ? [
    { type: 'color', hex: selectedItemDetails.displayHex, width: 240, height: 60, show: !!selectedItemDetails.displayHex },
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'Hex Value', value: selectedItemDetails.displayHex, show: !!selectedItemDetails.displayHex },
    { type: 'text', label: 'Path', value: selectedItemDetails.fullPath, size: 'sm' }
  ] : [];
  const detailEmptyMessage = 'Select a color to view details';

  return {
    flatItems,
    flatGroups,
    resourceCategory: 'userInterface',
    selectedResourceId: 'colors',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: 'colors',
  };
}

