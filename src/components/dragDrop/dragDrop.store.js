export const INITIAL_STATE = Object.freeze({
  isDragging: false,
});

export const startDragging = (state, isDragging) => {
  state.isDragging = true;
};

export const stopDragging = (state, isDragging) => {
  state.isDragging = false;
};

export const toViewData = ({ state, props }) => ({
  ...state,
  ...props,
  bgc: state.isDragging ? "mu" : "",
});
