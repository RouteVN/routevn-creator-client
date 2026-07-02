export const createInitialState = () => ({
  assets: [
    {
      id: "images",
      label: "Images",
      route: "/project/images",
    },
    {
      id: "characters",
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

const selectResourcesCopy = (i18n = {}) => i18n.resourcesPage ?? {};

const selectResourceTypesCopy = (i18n = {}) => i18n.resourceTypes ?? {};

const localizeResourceItems = (items = [], resourceTypesCopy = {}) =>
  items.map((item) => ({
    ...item,
    label: resourceTypesCopy[item.id] ?? item.label,
  }));

export const selectResourceRoute = ({ state }, id) => {
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

export const selectViewData = ({ state, i18n }) => {
  const copy = selectResourcesCopy(i18n);
  const resourceTypesCopy = selectResourceTypesCopy(i18n);

  return {
    ...state,
    title: copy.title ?? "Resources",
    assetsTitle: copy.assetsTitle ?? "Assets",
    animatedAssetsTitle: copy.animatedAssetsTitle ?? "Animated Assets",
    userInterfaceTitle: copy.userInterfaceTitle ?? "User Interface",
    systemConfigTitle: copy.systemConfigTitle ?? "System Config",
    assets: localizeResourceItems(state.assets, resourceTypesCopy),
    animatedAssets: localizeResourceItems(
      state.animatedAssets,
      resourceTypesCopy,
    ),
    ui: localizeResourceItems(state.ui, resourceTypesCopy),
    system: localizeResourceItems(state.system, resourceTypesCopy),
  };
};
