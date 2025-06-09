export const INITIAL_STATE = Object.freeze({
  items: [
    {
      title: "Project",
      path: "/project",
    },
    {
      title: "Resources",
      path: "/project/resources",
    },
    {
      title: "Scenes",
      path: "/project/scenes",
    },
    {
      title: "Settings",
      path: "/project/settings",
    },
  ],
});

export const toViewData = ({ state, props }, payload) => {
  return {
    ...state,
    itemsEncoded: encodeURIComponent(JSON.stringify(state.items)),
  };
};

