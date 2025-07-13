import { toFlatItems, toFlatGroups } from '../../deps/repository';

export const INITIAL_STATE = Object.freeze({
  layoutData: { tree: [], items: {} },
  selectedItemId: null,
  componentId: null,
  images: { tree: [], items: {} },
  contextMenuItems: [
    {
      label: 'Container AAA', type: 'item', value: {
        action: 'new-child-item', type: 'container', name: 'New Container', x: 0, y: 0
      }
    },
    {
      label: 'Sprite', type: 'item', value: {
        action: 'new-child-item', type: 'sprite', name: 'New Sprite', x: 0, y: 0
      }
    },
    {
      label: 'Text', type: 'item', value: {
        action: 'new-child-item', type: 'text', name: 'New Text', x: 0, y: 0
      }
    },
    { label: 'Rename', type: 'item', value: 'rename-item' },
    { label: 'Delete', type: 'item', value: 'delete-item' }
  ],
  emptyContextMenuItems: [
    {
      label: 'Container AAA', type: 'item', value: {
        action: 'new-child-item', type: 'container', name: 'New Container', x: 0, y: 0
      }
    },
    {
      label: 'Sprite', type: 'item', value: {
        action: 'new-child-item', type: 'sprite', name: 'New Sprite', x: 0, y: 0
      }
    },
    {
      label: 'Text', type: 'item', value: {
        action: 'new-child-item', type: 'text', name: 'New Text', x: 0, y: 0
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

export const setImages = (state, { images }) => {
  state.images = images;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
}

export const selectSelectedItem = ({ state }) => {
  const flatItems = toFlatItems(state.layoutData);
  return state.selectedItemId ? flatItems.find(item => item.id === state.selectedItemId) : undefined;
}

export const selectComponentId = ({ state }) => {
  return state.componentId;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.layoutData);
  const flatGroups = toFlatGroups(state.layoutData);
  const imageGroups = toFlatGroups(state.images);

  const selectedItem = state.selectedItemId ?
    flatItems.find(item => item.id === state.selectedItemId) : null;

  let detailTitle = '';
  let detailFields = [];

  // const detailTitle = selectedItem ? selectedItem.name : '';
  if (selectedItem) {
    detailTitle = selectedItem.name;

    if (selectedItem.type === 'container') {
      detailFields = [
        { type: 'text', label: 'Type', value: selectedItem.type || 'Layout Item' },
        { type: 'text', label: 'ID', value: selectedItem.id },
        { id: 'x', type: 'text', label: 'X', value: selectedItem.x, editable: true },
        {
          id: 'y', type: 'text', label: 'Y', value: selectedItem.y, editable: true
        },
        {
          id: 'direction', type: 'select', label: 'Direction', value: selectedItem.direction, editable: true, options: [{
            label: 'Vertical', value: 'vertical'
          }, {
            label: 'Horizontal', value: 'horizontal'
          }]
        },
        {
          id: 'anchor', type: 'select', label: 'Anchor', value: selectedItem.anchor, editable: true, options: [{
            label: 'Top Left', value: 'top-left'
          }, {
            label: 'Top Right', value: 'top-right'
          }, {
            label: 'Bottom Left', value: 'bottom-left'
          }, {
            label: 'Bottom Right', value: 'bottom-right'
          }, {
            label: 'Center', value: 'center'
          }]
        },
      ];
    } else if (selectedItem.type === 'sprite') {
      detailFields = [
        { type: 'text', label: 'Type', value: selectedItem.type },
        { type: 'text', label: 'ID', value: selectedItem.id },
        { id: 'x', type: 'text', label: 'X', value: selectedItem.x, editable: true },
        { id: 'y', type: 'text', label: 'Y', value: selectedItem.y, editable: true },
        { id: 'imageId', type: 'image-selector', label: 'Image', value: selectedItem.imageId || '' },
      ];
    } else if (selectedItem.type === 'text') {
      detailFields = [
        { type: 'text', label: 'Type', value: selectedItem.type },
        { type: 'text', label: 'ID', value: selectedItem.id },
        { type: 'text', label: 'X', value: selectedItem.x },
        { type: 'text', label: 'Y', value: selectedItem.y },
        { type: 'text', label: 'Text Content', value: selectedItem.textContent || '' },
      ];
    }
  }
  const detailEmptyMessage = 'Select a layout item to view details';

  return {
    flatItems,
    flatGroups,
    imageGroups,
    images: state.images,
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
