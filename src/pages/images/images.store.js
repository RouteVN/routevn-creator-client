import { toFlatGroups, toFlatItems } from "../../repository";

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const INITIAL_STATE = Object.freeze({
  imagesData: { tree: [], items: {} },
  collapsedIds: [],
  selectedItemId: null,
  dropdownMenu: {
    isOpen: false,
    items: [],
    position: {
      x: 0,
      y: 0,
    },
  },
  popover: {
    isOpen: false,
    itemId: null,
    position: {
      x: 0,
      y: 0,
    },
  }
});

// Removed addItem - not used with new tree structure

export const setItems = (state, imagesData) => {
  state.imagesData = imagesData
}

export const showDropdownMenuFileExplorerItem = (state, { position, id }) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    itemId: id,
    items: [
      {
        label: 'New Folder',
        type: 'item',
        value: 'new-child-folder',
      },
      {
        label: 'Rename',
        type: 'item',
        value: 'rename-item',
      },
      {
        label: 'Delete',
        type: 'item',
        value: 'delete-item',
      },
    ],
  }
}

export const showDropdownMenuFileExplorerEmpty = (state, { position }) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    items: [
      {
        label: 'New Background',
        type: 'item',
        value: 'new-item',
      },
    ],
  }
}

export const hideDropdownMenu = (state) => {
  state.dropdownMenu = {
    isOpen: false,
    position: {
      x: 0,
      y: 0,
    },
    items: [],
  }
}

export const selectAssetItem = ({ state }, id) => {
  // This function doesn't seem to be used correctly - assetItems doesn't exist in state
  return null;
}

export const selectDropdownMenuItemId = ({ state }) => {
  return state.dropdownMenu.itemId;
}

export const selectDropdownMenuPosition = ({ state }) => {
  return state.dropdownMenu.position;
}

export const showPopover = (state, { position, itemId }) => {
  state.popover = {
    isOpen: true,
    position,
    itemId,
  };
}

export const hidePopover = (state) => {
  state.popover = {
    isOpen: false,
    itemId: null,
    position: {
      x: 0,
      y: 0,
    },
  };
}

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
}

export const selectPopoverItem = ({ state }) => {
  if (!state.popover.itemId) return null;
  // Get item from the imagesData.items object
  return state.imagesData.items[state.popover.itemId] ? 
    { ...state.imagesData.items[state.popover.itemId], id: state.popover.itemId } : null;
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.imagesData contains the full structure with tree and items
  const flatItems = toFlatItems(state.imagesData);
  return flatItems.find(item => item.id === state.selectedItemId);
}

export const toViewData = ({ state, props }, payload) => {
  // Get current item for rename form
  const currentItem = state.popover.itemId && state.imagesData.items[state.popover.itemId] ? 
    { ...state.imagesData.items[state.popover.itemId], id: state.popover.itemId } : null;

  // Form configuration for renaming
  const renameForm = currentItem ? {
    fields: [{
      id: 'name',
      fieldName: 'name',
      inputType: 'inputText',
      label: 'Name',
      value: currentItem.name || '',
      required: true,
    }],
    actions: {
      layout: '',
      buttons: [{
        id: 'submit',
        variant: 'pr',
        content: 'Rename',
      }, {
        id: 'cancel',
        variant: 'se',
        content: 'Cancel',
      }],
    }
  } : null;

  const flatItems = toFlatItems(state.imagesData);
  const flatGroups = toFlatGroups(state.imagesData).map(group => ({
    ...group,
    isCollapsed: state.collapsedIds.includes(group.id),
    children: state.collapsedIds.includes(group.id) ? [] : group.children
  }));

  // Get selected item details
  const selectedItem = state.selectedItemId ? 
    flatItems.find(item => item.id === state.selectedItemId) : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem ? {
    ...selectedItem,
    typeDisplay: selectedItem.type === 'image' ? 'Image' : 'Folder',
    displayFileType: selectedItem.fileType || (selectedItem.type === 'image' ? 'PNG' : null),
    displayFileSize: selectedItem.fileSize ? formatFileSize(selectedItem.fileSize) : null,
    fullPath: selectedItem.fullLabel || selectedItem.name || '',
  } : null;

  console.log({
    flatItems,
    flatGroups,
    selectedItem,
  });

  return {
    flatItems,
    flatGroups,
    dropdownMenu: state.dropdownMenu,
    popover: state.popover,
    form: renameForm,
    resourceCategory: 'assets',
    selectedResourceId: 'images',
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
  };
}

