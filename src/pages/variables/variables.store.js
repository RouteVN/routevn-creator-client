import { toFlatGroups, toFlatItems } from "../../deps/repository";

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const INITIAL_STATE = Object.freeze({
  variablesData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, variablesData) => {
  state.variablesData = variablesData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const toViewData = ({ state, props }, payload) => {
  console.log("🔧 Variables toViewData called with state:", state);
  
  const flatItems = toFlatItems(state.variablesData);
  const flatGroups = toFlatGroups(state.variablesData);

  console.log("🔧 Variables processed data:", {
    variablesData: state.variablesData,
    flatItems,
    flatGroups
  });

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'variable' ? 'Variable' : 'Folder',
    displayFileType: selectedItem.fileType || (selectedItem.type === 'variable' ? 'Variable' : null),
    displayFileSize: selectedItem.fileSize ? formatFileSize(selectedItem.fileSize) : null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? 'Details' : null;
  const detailFields = selectedItemDetails ? [
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'Variable Type', value: selectedItemDetails.variableType, show: !!selectedItemDetails.variableType },
    { type: 'text', label: 'Default Value', value: selectedItemDetails.defaultValue, show: !!selectedItemDetails.defaultValue },
    { type: 'text', label: 'Read Only', value: selectedItemDetails.readonly ? 'Yes' : 'No', show: selectedItemDetails.readonly !== undefined },
    { type: 'text', label: 'Path', value: selectedItemDetails.fullPath, size: 'sm' }
  ] : [];
  const detailEmptyMessage = 'No selection';
  
  const viewData = {
    flatItems,
    flatGroups,
    resourceCategory: 'systemConfig',
    selectedResourceId: 'variables',
    repositoryTarget: 'variables',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
  };
  
  console.log("🔧 Variables returning viewData:", viewData);
  
  return viewData;
}