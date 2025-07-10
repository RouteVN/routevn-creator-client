import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

export const INITIAL_STATE = Object.freeze({
  placementData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, placementData) => {
  state.placementData = placementData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const toViewData = ({ state, props }, payload) => {
  console.log("🎯 Placements toViewData called with state:", state);
  
  const flatItems = toFlatItems(state.placementData);
  const flatGroups = toFlatGroups(state.placementData);

  console.log("🎯 Placements processed data:", {
    placementData: state.placementData,
    flatItems,
    flatGroups
  });

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'placement' ? 'Placement' : 'Folder',
    displayFileType: selectedItem.fileType || (selectedItem.type === 'placement' ? 'JSON' : null),
    displayFileSize: selectedItem.fileSize ? formatFileSize(selectedItem.fileSize) : null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? 'Placement Details' : null;
  const detailFields = selectedItemDetails ? [
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'Position X', value: selectedItemDetails.positionX, show: !!selectedItemDetails.positionX },
    { type: 'text', label: 'Position Y', value: selectedItemDetails.positionY, show: !!selectedItemDetails.positionY },
    { type: 'text', label: 'Scale', value: selectedItemDetails.scale, show: !!selectedItemDetails.scale },
    { type: 'text', label: 'Anchor', value: selectedItemDetails.anchor, show: !!selectedItemDetails.anchor },
    { type: 'text', label: 'Rotation', value: selectedItemDetails.rotation, show: !!selectedItemDetails.rotation },
    { type: 'text', label: 'File Type', value: selectedItemDetails.displayFileType, show: !!selectedItemDetails.displayFileType },
    { type: 'text', label: 'File Size', value: selectedItemDetails.displayFileSize, show: !!selectedItemDetails.displayFileSize },
    { type: 'text', label: 'Path', value: selectedItemDetails.fullPath, size: 'sm' }
  ] : [];
  const detailEmptyMessage = 'Select a placement to view details';
  
  const viewData = {
    flatItems,
    flatGroups,
    resourceCategory: 'assets',
    selectedResourceId: 'placements',
    repositoryTarget: 'placements',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
  };
  
  console.log("🎯 Placements returning viewData:", viewData);
  
  return viewData;
}