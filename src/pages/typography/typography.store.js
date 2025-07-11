
import { toFlatGroups, toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  typographyData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, typographyData) => {
  state.typographyData = typographyData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.typographyData);
  return flatItems.find(item => item.id === state.selectedItemId);
}

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.typographyData);
  const flatGroups = toFlatGroups(state.typographyData);

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'typography' ? 'Typography' : 'Folder',
    displayFontSize: selectedItem.fontSize || null,
    displayFontColor: selectedItem.fontColor || null,
    displayFontStyle: selectedItem.fontStyle || null,
    displayFontWeight: selectedItem.fontWeight || null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? 'Typography Details' : null;
  const detailFields = selectedItemDetails ? [
    { 
      type: 'typography', 
      name: selectedItemDetails.name,
      fontSize: selectedItemDetails.displayFontSize || '16',
      fontColor: selectedItemDetails.displayFontColor || '#000000',
      fontStyle: selectedItemDetails.displayFontStyle || '',
      fontWeight: selectedItemDetails.displayFontWeight || 'normal',
      show: !!selectedItemDetails.displayFontSize 
    },
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'Font Size', value: selectedItemDetails.displayFontSize, show: !!selectedItemDetails.displayFontSize },
    { type: 'text', label: 'Font Color', value: selectedItemDetails.displayFontColor, show: !!selectedItemDetails.displayFontColor },
    { type: 'text', label: 'Font Style', value: selectedItemDetails.displayFontStyle, show: !!selectedItemDetails.displayFontStyle },
    { type: 'text', label: 'Font Weight', value: selectedItemDetails.displayFontWeight, show: !!selectedItemDetails.displayFontWeight },
    { type: 'text', label: 'Path', value: selectedItemDetails.fullPath, size: 'sm' }
  ].filter(field => field.show !== false) : [];
  const detailEmptyMessage = 'Select a typography style to view details';

  return {
    flatItems,
    flatGroups,
    resourceCategory: 'userInterface',
    selectedResourceId: 'typography',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: 'typography',
  };
}

