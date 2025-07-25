export const INITIAL_STATE = Object.freeze({
  disableUserClick: false,
  autoPlay: false,
  autoPlayDelay: 1000,
});

export const setDisableUserClick = (state, { disableUserClick }) => {
  state.disableUserClick = disableUserClick;
};

export const setAutoPlay = (state, { autoPlay }) => {
  state.autoPlay = autoPlay;
};

export const setAutoPlayDelay = (state, { autoPlayDelay }) => {
  state.autoPlayDelay = autoPlayDelay;
};

export const toViewData = ({ state, props }, payload) => {
  const booleanOptions = [
    { value: false, label: "No" },
    { value: true, label: "Yes" },
  ];

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
    },
    {
      id: "current",
      label: "Controls",
    },
  ];

  return {
    breadcrumb,
    booleanOptions,
    disableUserClick: state.disableUserClick,
    autoPlay: state.autoPlay,
    autoPlayDelay: state.autoPlayDelay,
    submitDisabled: false,
  };
};
