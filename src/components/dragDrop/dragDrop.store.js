export const createInitialState = () => ({
  isDragging: false,
});

export const startDragging = ({ state }, _payload = {}) => {
  state.isDragging = true;
};

export const stopDragging = ({ state }, _payload = {}) => {
  state.isDragging = false;
};

export const selectViewData = ({ state, props }) => ({
  ...state,
  ...props,
  bgc: state.isDragging ? "mu" : "",
});
