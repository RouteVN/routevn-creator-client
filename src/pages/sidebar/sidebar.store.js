export const INITIAL_STATE = Object.freeze({
  items: [
    {
      title: "Project",
      path: "/project",
    },
    {
      title: "Assets",
      path: "/project/resources/images",
    },
    {
      title: "User Interface",
      path: "/project/resources/colors",
    },
    {
      title: "System Config",
      path: "/project/resources/variables",
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

