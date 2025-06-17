import { toFlatItems, toFlatGroups } from '../../repository.js';

export const INITIAL_STATE = Object.freeze({
  layoutData: { tree: [], items: {} },
  selectedItemId: null,
  componentId: null,
});

export const setItems = (state, layoutData) => {
  state.layoutData = layoutData;
};

export const setComponentId = (state, componentId) => {
  state.componentId = componentId;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectComponentId = ({ state }) => {
  return state.componentId;
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
    repositoryTarget: `components.items.${state.componentId}.layout`,
    detailTitle,
    detailFields,
    detailEmptyMessage,
    resourceCategory: 'userInterface',
    selectedResourceId: 'component-editor',
  };
}
