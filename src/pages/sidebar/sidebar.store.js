export const INITIAL_STATE = Object.freeze({
  items: [
    {
      title: "Project",
      path: "/project",
      icon: "home",
    },
    {
      title: "Assets",
      path: "/project/resources/images",
      icon: "image",
    },
    {
      title: "User Interface",
      path: "/project/resources/colors",
      icon: "palette",
    },
    {
      title: "System Config",
      path: "/project/resources/variables",
      icon: "gear",
    },
    {
      title: "Scenes",
      path: "/project/scenes",
      icon: "film",
    },
    {
      title: "Settings",
      path: "/project/settings/general",
      icon: "settings",
    },
  ],
});

export const toViewData = ({ state, props }, payload) => {
  return {
    ...state,
    itemsEncoded: encodeURIComponent(JSON.stringify(state.items)),
  };
};

