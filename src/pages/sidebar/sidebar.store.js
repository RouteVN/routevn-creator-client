export const INITIAL_STATE = Object.freeze({
  items: [
    {
      title: "Project",
      slug: "/projects/projectid",
    },
    {
      title: "Resources",
      slug: "/projects/projectid/resources",
    },
    {
      title: "Scenes",
      slug: "/projects/projectid/scenes",
    },
    {
      title: "Settings",
      slug: "/projects",
    },
  ],
});

export const toViewData = ({ state, props }, payload) => {
  return {
    ...state,
    itemsEncoded: encodeURIComponent(JSON.stringify(state.items)),
  };
};

