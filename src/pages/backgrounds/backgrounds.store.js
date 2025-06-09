
export const INITIAL_STATE = Object.freeze({
  items: []
});

export const addItem = (state, item) => {
  state.items.push(item)
}

export const setItems = (state, items) => {
  state.items = items
}

export const toViewData = ({ state, props }, payload) => {
  return {
    items: state.items,
  };
}

