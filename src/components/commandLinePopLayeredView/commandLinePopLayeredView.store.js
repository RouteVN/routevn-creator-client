export const createInitialState = () => ({
  mode: "current",
  initiated: false,
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setInitiated = ({ state }, _payload = {}) => {
  state.initiated = true;
};

export const selectViewData = ({ state }) => {
  const breadcrumb = [
    { id: "actions", label: "Actions" },
    { label: "Pop Layered View" },
  ];

  return {
    initiated: state.initiated,
    mode: state.mode,
    breadcrumb,
  };
};
