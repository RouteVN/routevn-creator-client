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
      id: "videos",
      label: "Videos",
      route: "/project/videos",
    },
  ],
  animatedAssets: [
    {
      id: "animations",
      label: "Animations",
      route: "/project/animations",
    },
    {
      id: "particles",
      label: "Particles",
      route: "/project/particles",
    },
    {
      id: "spritesheets",
      label: "Spritesheets",
      route: "/project/spritesheets",
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
      id: "controls",
      label: "Controls",
      route: "/project/controls",
    },
  ],
});

export const selectResourceRoute = ({ state }, id) => {
  // console.log('payload', payload)
  // const { resourceId, projectId } = payload;
  const resources = state.assets
    .concat(state.animatedAssets)
    .concat(state.ui)
    .concat(state.system);
  const resource = resources.find((resource) => resource.id === id);
  if (!resource) {
    throw new Error(`Resource ${id} not found`);
  }
  return resource.route;
};

export const selectViewData = ({ state }) => {
  return state;
};
