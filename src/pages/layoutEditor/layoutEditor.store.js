import { toFlatItems, toFlatGroups } from '../../repository.js';

export const INITIAL_STATE = Object.freeze({
  layoutData: { tree: [], items: {} },
  selectedItemId: null,
  layoutId: null,
});

export const setItems = (state, layoutData) => {
  state.layoutData = layoutData;
};

export const setLayoutId = (state, layoutId) => {
  state.layoutId = layoutId;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectLayoutId = ({ state }) => {
  return state.layoutId;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.layoutData);
  const flatGroups = toFlatGroups(state.layoutData);
  
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;
  
  const detailTitle = selectedItem ? selectedItem.name : '';
  const detailFields = selectedItem ? [
    { label: 'Name', value: selectedItem.name },
    { label: 'Type', value: selectedItem.type || 'Layout Item' },
    { label: 'ID', value: selectedItem.id }
  ] : [];
  const detailEmptyMessage = 'Select a layout item to view details';
  
  return {
    flatItems,
    flatGroups,
    selectedItemId: state.selectedItemId,
    repositoryTarget: `layouts.items.${state.layoutId}.layout`,
    detailTitle,
    detailFields,
    detailEmptyMessage,
    resourceCategory: 'userInterface',
    selectedResourceId: 'layout-editor',
  };
}