export const createInitialState = () => ({
  assets: [
    {
      id: "images",
      label: "Images",
      route: "/project/images",
    },
    {
      id: "character",
      label: "Character",
      route: "/project/characters",
    },
    {
      id: "sounds",
      label: "Sounds",
      route: "/project/sounds",
    },
    {
      id: "transforms",
      label: "Transforms",
      route: "/project/transforms",
    },
    {
      id: "animations",
      label: "Animations",
      route: "/project/animations",
    },
    {
      id: "videos",
      label: "Videos",
      route: "/project/videos",
    },
  ],
  ui: [
    {
      id: "colors",
      label: "Colors",
      route: "/project/colors",
    },
    {
      id: "fonts",
      label: "Fonts",
      route: "/project/fonts",
    },
    {
      id: "textStyles",
      label: "Text Styles",
      route: "/project/text-styles",
    },
  ],
  system: [
    {
      id: "variables",
      label: "Variables",
      route: "/project/variables",
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
