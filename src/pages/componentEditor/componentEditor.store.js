import { toFlatItems, toFlatGroups } from '../../deps/repository';

export const INITIAL_STATE = Object.freeze({
  layoutData: { tree: [], items: {} },
  selectedItemId: null,
  componentId: null,
  contextMenuItems: [
    {
      label: 'Container AAA', type: 'item', value: {
        action: 'new-child-item', type: 'container', name: 'New Container'
      }
    },
    {
      label: 'Sprite', type: 'item', value: {
        action: 'new-child-item', type: 'sprite', name: 'New Sprite'
      }
    },
    {
      label: 'Text', type: 'item', value: {
        action: 'new-child-item', type: 'text', name: 'New Text'
      }
    },
    { label: 'Rename', type: 'item', value: 'rename-item' },
    { label: 'Delete', type: 'item', value: 'delete-item' }
  ],
  emptyContextMenuItems: [
    {
      label: 'Container AAA', type: 'item', value: {
        action: 'new-child-item', type: 'container', name: 'New Container'
      }
    },
    {
      label: 'Sprite', type: 'item', value: {
        action: 'new-child-item', type: 'sprite', name: 'New Sprite'
      }
    },
    {
      label: 'Text', type: 'item', value: {
        action: 'new-child-item', type: 'text', name: 'New Text'
      }
    },
  ]
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
    { type: 'text', label: 'Type', value: selectedItem.type || 'Layout Item' },
    { type: 'text', label: 'ID', value: selectedItem.id }
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
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
  };
}
