export const INITIAL_STATE = Object.freeze({
  items: [
    {
      id: "1",
      label: "Text",
      icon: "text",
      mode: "text",
    },
    {
      id: "2",
      label: "Background",
      icon: "background",
      mode: "background",
    },
  ],
});

export const toViewData = ({ state, props }, payload) => {
  return {
    items: state.items,
  };
};

export const selectItems = (state, props, payload) => {
  return state.items;
};

