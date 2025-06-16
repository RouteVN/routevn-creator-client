import { toFlatGroups, toFlatItems } from "../../repository";

export const INITIAL_STATE = Object.freeze({
  audioData: { tree: [], items: {} },
  selectedItemId: null,
});


// Context menu constants
const CONTEXT_MENU_ITEMS = [
  { label: 'New Folder', type: 'item', value: 'new-child-folder' },
  { label: 'Rename', type: 'item', value: 'rename-item' },
  { label: 'Delete', type: 'item', value: 'delete-item' }
];

const EMPTY_CONTEXT_MENU_ITEMS = [
  { label: 'New Folder', type: 'item', value: 'new-item' }
];

export const setItems = (state, audioData) => {
  state.audioData = audioData
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const toViewData = ({ state, props }, payload) => {
  console.log("🎵 Audio toViewData called with state:", state);
  
  const flatItems = toFlatItems(state.audioData);
  const flatGroups = toFlatGroups(state.audioData);

  console.log("🎵 Audio processed data:", {
    audioData: state.audioData,
    flatItems,
    flatGroups
  });

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;
  
  const viewData = {
    flatItems,
    flatGroups,
    contextMenuItems: CONTEXT_MENU_ITEMS,
    emptyContextMenuItems: EMPTY_CONTEXT_MENU_ITEMS,
    resourceCategory: 'assets',
    selectedResourceId: 'audio',
    repositoryTarget: 'audio',
    selectedItemId: state.selectedItemId,
  };
  
  console.log("🎵 Audio returning viewData:", viewData);
  
  return viewData;
}

