import { toFlatItems, toFlatGroups } from '../../deps/repository';

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

  console.log('selected item details:', selectedItem);

  const detailTitle = selectedItem ? selectedItem.name : '';
  const detailFields = selectedItem ? [
    { type: 'text', label: 'Type', value: selectedItem.type || 'Layout Item' },
    { type: 'text', label: 'ID', value: selectedItem.id }
  ] : [];
  const detailEmptyMessage = 'Select a layout item to view details';

  console.log('detailFields', detailFields);

  const emptyContextMenuItems = [
    { text: 'Add Container', value: 'add-container' },
    { text: 'Add Sprite', value: 'add-sprite' },
    { text: 'Add Text', value: 'add-text' }
  ];

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
    emptyContextMenuItems,
  };
}
