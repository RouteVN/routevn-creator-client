export const INITIAL_STATE = Object.freeze({
  assets: [
    {
      id: "background",
      label: "Background",
      route: "/project/resources/backgrounds",
    },
    {
      id: "cg",
      label: "CG",
      route: "/project/cgs",
    },
    {
      id: "character",
      label: "Character",
      route: "/project/resources/characters"
    },
    {
      id: "background-music",
      label: "Bacgkround Music",
      route: '/project/resources/bgm'
    },
    {
      id: "sound-effects",
      label: "Sound Effects",
      route: '/project/resources/sfx'
    },
    {
      id: "animation-effects",
      label: "Animation Effects",
      route: '/project/resources/animations'
    },
    {
      id: "positions",
      label: "Positions",
      route: '/project/resources/positions'
    },
    {
      id: "visuals",
      label: "Visuals",
      route: '/project/resources/visuals'
    },
    {
      id: "videos",
      label: "Videos",
      route: '/project/resources/videos'
    },
  ],
  ui: [
    {
      id: "design-tokens",
      label: "Design Tokens",
      route: '/project/resources/design-tokens'
    },
    {
      id: "components",
      label: "Components",
      route: '/project/resources/components'
    },
    {
      id: "screens",
      label: "Screens",
      route: '/project/resources/screens'
    },
    {
      id: "choices",
      label: "Choices",
      route: '/project/resources/choices'
    },
    {
      id: "dialogue",
      label: "Dialogue",
      route: '/project/resources/dialogue'
    },
  ],
  system: [
    {
      id: "variables",
      label: "Variables",
      route: '/project/resources/variables'
    },
    {
      id: "presets",
      label: "Presets",
      route: '/project/resources/presets'
    },
  ],
});

export const selectResourceRoute = ({ state, props }, id) => {
  // console.log('payload', payload)
  // const { resourceId, projectId } = payload;
  const resources = state.assets.concat(state.ui).concat(state.system);
  const resource = resources.find((resource) => resource.id === id);
  if (!resource) {
    throw new Error(`Resource ${id} not found`);
  }
  return resource.route;
};

export const toViewData = ({ state, props }, payload) => {
  return state;
};

