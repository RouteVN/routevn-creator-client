const toolbarItems = [
  {
    id: "arrow-up",
    icon: "chevronDown",
    iconStyle: "transform: rotate(180deg);",
  },
  {
    id: "arrow-down",
    icon: "chevronDown",
    iconStyle: "",
  },
  {
    id: "add-actions",
    icon: "plus",
    iconStyle: "",
  },
];

export const createInitialState = () => ({
  isVisible: false,
  bottom: 0,
});

export const setKeyboardState = ({ state }, { isVisible, bottom } = {}) => {
  state.isVisible = isVisible === true;
  state.bottom = Number.isFinite(bottom) ? Math.max(0, Math.round(bottom)) : 0;
};

export const selectKeyboardState = ({ state }) => {
  return {
    isVisible: state.isVisible,
    bottom: state.bottom,
  };
};

export const selectViewData = ({ state }) => {
  return {
    isVisible: state.isVisible,
    bottomStyle: `${state.bottom}px`,
    toolbarItems,
  };
};
