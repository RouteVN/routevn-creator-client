export const INITIAL_STATE = Object.freeze({
  items: [
    {
      id: "10",
      label: "Transition",
      icon: "transition",
      mode: "sectionTransition",
    },
  ],
});

export const toViewData = ({ state }) => {
  return {
    items: state.items,
  };
};

export const selectItems = ({ state }) => {
  return state.items;
};
