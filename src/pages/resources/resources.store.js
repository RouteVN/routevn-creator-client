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
      id: "audio",
      label: "Audio",
      route: "/project/resources/audio",
    },
    {
      id: "animation-effects",
      label: "Animation Effects",
      route: "/project/resources/animations",
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
    {
      id: "components",
      label: "Components",
      route: "/project/resources/components",
    },
    {
      id: "bases",
      label: "Bases",
      route: "/project/resources/bases",
    },
    {
      id: "choices",
      label: "Choices",
      route: "/project/resources/choices",
    },
    {
      id: "dialogue",
      label: "Dialogue",
      route: "/project/resources/dialogue",
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
