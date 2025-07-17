import { toFlatGroups, toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  scenesData: { tree: [], items: {} },
  selectedItemId: null,
  whiteboardItems: []
});

export const setItems = (state, scenesData) => {
  state.scenesData = scenesData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const updateItemPosition = (state, { itemId, x, y }) => {
  const item = state.whiteboardItems.find(item => item.id === itemId);
  if (item) {
    item.x = x;
    item.y = y;
  }
};

export const addWhiteboardItem = (state, newItem) => {
  state.whiteboardItems.push(newItem);
};

export const setWhiteboardItems = (state, items) => {
  state.whiteboardItems = items;
};


// Track if we've initialized from repository yet
let hasInitialized = false;

export const toViewData = ({ state, props }, payload) => {
  // Check if we need to initialize from repository on first render
  if (!hasInitialized && payload && payload.repository) {
    const repositoryState = payload.repository.getState();
    const { scenes } = repositoryState;
    
    if (scenes && Object.keys(scenes.items || {}).length > 0) {
      // Initialize the scenes data
      state.scenesData = scenes;
      
      // Transform only scene items (not folders) into whiteboard items
      const sceneItems = Object.entries(scenes.items || {})
        .filter(([key, item]) => item.type === 'scene')
        .map(([sceneId, scene]) => ({
          id: sceneId,
          name: scene.name || `Scene ${sceneId}`,
          x: scene.position?.x || 200,
          y: scene.position?.y || 200,
        }));
      
      state.whiteboardItems = sceneItems;
      hasInitialized = true;
    }
  }
  
  const flatItems = toFlatItems(state.scenesData);
  const flatGroups = toFlatGroups(state.scenesData);

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'scene' ? 'Scene' : 'Folder',
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? 'Scene Details' : null;
  const detailFields = selectedItemDetails ? [
    { type: 'text', label: 'Name', value: selectedItemDetails.name },
    { type: 'text', label: 'Type', value: selectedItemDetails.typeDisplay },
    { type: 'text', label: 'Path', value: selectedItemDetails.fullPath, size: 'sm' },
    { type: 'text', label: 'Created', value: new Date().toLocaleDateString() },
    { type: 'text', label: 'Last Modified', value: new Date().toLocaleDateString() }
  ] : [];
  const detailEmptyMessage = 'Select a scene to view details';

  return {
    flatItems,
    flatGroups,
    resourceCategory: 'project',
    selectedResourceId: 'scenes',
    repositoryTarget: 'scenes',
    selectedItemId: state.selectedItemId,
    whiteboardItems: state.whiteboardItems,
    detailTitle,
    detailFields,
    detailEmptyMessage,
  };
};