
export const INITIAL_STATE = Object.freeze({
  isDragging: false,
  selectedItemId: undefined,

  // -2 means no target drag index
  targetDragIndex: -2,
  itemRects: {},
});

export const startDragging = (state, { id, itemRects }) => {
  state.isDragging = true;
  state.selectedItemId = id;
  state.itemRects = itemRects;
}

export const stopDragging = (state) => {
  state.isDragging = false;
  state.selectedItemId = undefined;
  state.targetDragIndex = -2;
  state.itemRects = {};
}

export const setTargetDragIndex = (state, index) => {
  state.targetDragIndex = index;
  console.log('setTargetDragIndex, state', state.targetDragIndex)
}

export const selectTargetDragIndex = (state, props, payload) => {
  return state.targetDragIndex;
}

export const selectItemRects = (state, props, payload) => {
  return state.itemRects;
}

export const selectIsDragging = (state, props, payload) => {
  return state.isDragging;
}

export const selectSelectedItemId = (state, props, payload) => {
  return state.selectedItemId;
}

export const toViewData = ({ state, props }, payload) => {
  return {
    ...state,
    items: props.items || []
  };
}

