export const createInitialState = () => ({
  isDragging: false,
});

export const startDragging = (state) => {
  state.isDragging = true;
};

export const stopDragging = (state) => {
  state.isDragging = false;
};

export const selectViewData = ({ state, props }) => ({
  ...state,
  ...props,
  bgc: state.isDragging ? "mu" : "",
});
