
export const INITIAL_STATE = Object.freeze({
  items: [],
  dropdownMenu: {
    isOpen: false,
    items: [],
    position: {
      x: 0,
      y: 0,
    },
  },
  tableData: {
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'type', label: 'Type' },
      { key: 'default', label: 'Default Value' },
      { key: 'readOnly', label: 'Read Only' }
    ],
    rows: [
      { id: 1, name: 'John Doe', type: 'string', default: 'John Doe', readOnly: false },
      { id: 2, name: 'Jane Smith', type: 'number', default: '123', readOnly: false },
      { id: 3, name: 'Bob Johnson', type: 'boolean', default: 'true', readOnly: false },
      { id: 4, name: 'Alice Williams', type: 'array', default: '["apple", "banana", "cherry"]', readOnly: false },
      { id: 5, name: 'Charlie Brown', type: 'object', default: '{ "name": "Charlie Brown", "age": 30 }', readOnly: false },
      { id: 6, name: 'Diana Prince', type: 'date', default: '2025-01-01', readOnly: false },
    ]
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
    resourceCategory: 'systemConfig',
    selectedResourceId: 'variables',
    tableData: state.tableData,
  };
}

