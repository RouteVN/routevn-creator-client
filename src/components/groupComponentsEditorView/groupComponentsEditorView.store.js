export const INITIAL_STATE = Object.freeze({
  dropdownMenu: {
    isOpen: false,
    items: [],
    position: {
      x: 0,
      y: 0,
    },
  }
});

export const showDropdownMenuComponentItem = (state, { position, id }) => {
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
  const flatGroups = props.flatGroups || [];

  return {
    flatGroups,
    selectedItemId: props.selectedItemId,
    dropdownMenu: state.dropdownMenu,
  };
}