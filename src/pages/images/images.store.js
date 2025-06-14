import { toFlatGroups, toFlatItems } from "../../repository";

export const INITIAL_STATE = Object.freeze({
  items: [],
  collapsedIds: [],
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

export const addItem = (state, item) => {
  state.items.push(item)
}

export const setItems = (state, items) => {
  state.items = items
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
  return state.assetItems.find(item => item.id === id);
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
  return state.items.find(item => item.id === state.popover.itemId);
}

export const toViewData = ({ state, props }, payload) => {
  // Get current item for rename form
  const currentItem = state.popover.itemId ? 
    state.items.find(item => item.id === state.popover.itemId) : null;

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

  const flatItems = toFlatItems(state.items);
  const flatGroups = toFlatGroups(state.items).map(group => ({
    ...group,
    isCollapsed: state.collapsedIds.includes(group.id),
    children: state.collapsedIds.includes(group.id) ? [] : group.children
  }));

  console.log({
    flatItems,
    flatGroups,
  });

  return {
    flatItems,
    flatGroups,
    dropdownMenu: state.dropdownMenu,
    popover: state.popover,
    form: renameForm,
    resourceCategory: 'assets',
    selectedResourceId: 'images',
  };
}

