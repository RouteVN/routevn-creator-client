export const createInitialState = () => ({
  items: [
    {
      id: "10",
      label: "Transition",
      icon: "transition",
      mode: "sectionTransition",
    },
  ],
});

export const selectViewData = ({ state }) => {
  return {
    items: state.items,
  };
};

export const selectItems = ({ state }) => {
  return state.items;
};
