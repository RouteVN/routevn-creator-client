
export const INITIAL_STATE = Object.freeze({
  items: [],
  dropdownMenu: {
    isOpen: false,
    items: [],
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
    items: [
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

export const toViewData = ({ state, props }, payload) => {
  return {
    items: state.items,
    dropdownMenu: state.dropdownMenu,
    resourceCategory: 'assets',
    selectedResourceId: 'videos',
  };
}

