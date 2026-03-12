export const createInitialState = () => ({
  assets: [
    {
      id: "images",
      label: "Images",
      route: "/project/resources/images",
    },
    {
      id: "character",
      label: "Character",
      route: "/project/resources/characters",
    },
    {
      id: "sounds",
      label: "Sounds",
      route: "/project/resources/sounds",
    },
    {
      id: "transforms",
      label: "Transforms",
      route: "/project/resources/transforms",
    },
    {
      id: "videos",
      label: "Videos",
      route: "/project/resources/videos",
    },
  ],
  ui: [
    {
      id: "colors",
      label: "Colors",
      route: "/project/resources/colors",
    },
    {
      id: "Fonts",
      label: "fonts",
      route: "/project/resources/fonts",
    },
    {
      id: "typography",
      label: "Typography",
      route: "/project/resources/typography",
    },
  ],
  system: [
    {
      id: "variables",
      label: "Variables",
      route: "/project/resources/variables",
    },
  ],
});

export const selectResourceRoute = ({ state }, id) => {
  // console.log('payload', payload)
  // const { resourceId, projectId } = payload;
  const resources = state.assets.concat(state.ui).concat(state.system);
  const resource = resources.find((resource) => resource.id === id);
  if (!resource) {
    throw new Error(`Resource ${id} not found`);
  }
  return resource.route;
};

export const selectViewData = ({ state }) => {
  return state;
};
