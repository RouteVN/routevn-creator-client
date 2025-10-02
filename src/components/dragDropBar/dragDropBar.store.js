export const createInitialState = () => ({
  isDragging: false,
});

export const startDragging = (state, isDragging) => {
  state.isDragging = true;
};

export const stopDragging = (state, isDragging) => {
  state.isDragging = false;
};

export const selectViewData = ({ state, props }) => ({
  ...state,
  ...props,
  bgc: state.isDragging ? "mu" : "",
});
