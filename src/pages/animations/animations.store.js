import { toFlatGroups, toFlatItems } from "../../repository";

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const INITIAL_STATE = Object.freeze({
  animationsData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, animationsData) => {
  state.animationsData = animationsData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}


export const toViewData = ({ state, props }, payload) => {
  console.log("🎬 Animations toViewData called with state:", state);
  
  const flatItems = toFlatItems(state.animationsData);
  const flatGroups = toFlatGroups(state.animationsData);

  console.log("🎬 Animations processed data:", {
    animationsData: state.animationsData,
    flatItems,
    flatGroups
  });

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'animation' ? 'Animation' : 'Folder',
    displayFileType: selectedItem.fileType || (selectedItem.type === 'animation' ? 'JSON' : null),
    displayFileSize: selectedItem.fileSize ? formatFileSize(selectedItem.fileSize) : null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? 'Details' : null;
  const detailFields = selectedItemDetails ? [
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
    selectedResourceId: 'animations',
    repositoryTarget: 'animations',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
  };
  
  console.log("🎬 Animations returning viewData:", viewData);
  
  return viewData;
}