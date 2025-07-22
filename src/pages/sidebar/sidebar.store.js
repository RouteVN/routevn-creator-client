export const INITIAL_STATE = Object.freeze({
  header: {
    label: "Sidebar",
    path: "/project",
    image: {
      src: "/public/project_logo_placeholder.png",
      width: 48,
      height: 48,
      alt: "Sidebar",
    },
  },
  items: [
    {
      title: "Assets",
      path: "/project/resources/images",
      icon: "image",
    },
    {
      title: "User Interface",
      path: "/project/resources/colors",
      icon: "color",
    },
    // {
    //   title: "System Config",
    //   path: "/project/resources/variables",
    //   icon: "gear",
    // },
    {
      title: "Scenes",
      path: "/project/scenes",
      icon: "script",
    },
    // {
    //   title: "Settings",
    //   path: "/project/settings/general",
    //   icon: "settings",
    // },
  ],
});

export const setProjectImageUrl = (state, imageUrl) => {
  state.header.image.src = imageUrl;
};

export const toViewData = ({ state, props }, payload) => {
  return {
    ...state,
    header: state.header,
    itemsEncoded: state.items,
  };
};
