const assetItems = [
  {
    id: "images",
    name: "Images",
    path: "/project/resources/images",
  },
  {
    id: "audio",
    name: "Audio",
    path: "/project/resources/audio",
  },
  {
    id: "videos",
    name: "Videos",
    path: "/project/resources/videos",
  },
  {
    id: "characters",
    name: "Characters",
    path: "/project/resources/characters",
  },
  {
    id: "placements",
    name: "Placements",
    path: "/project/resources/placements",
  },
  {
    id: "animations",
    name: "Animations",
    path: "/project/resources/animations",
  },
];

const userInterfaceItems = [
  {
    id: "colors",
    name: "Colors",
    path: "/project/resources/colors",
  },
  {
    id: "fonts",
    name: "Fonts",
    path: "/project/resources/fonts",
  },
  {
    id: "typography",
    name: "Typography",
    path: "/project/resources/typography",
  },
  {
    id: "components",
    name: "Components",
    path: "/project/resources/components",
  },
  {
    id: "layouts",
    name: "Layouts",
    path: "/project/resources/layouts",
  },
];

const systemConfigItems = [
  {
    id: "variables",
    name: "Variables",
    path: "/project/resources/variables",
  },
  {
    id: "presets",
    name: "Presets",
    path: "/project/resources/presets",
  },
];

const resourceCategoryNames = {
  assets: {
    label: "Assets",
    resources: assetItems,
  },
  userInterface: {
    label: "User Interface",
    resources: userInterfaceItems,
  },
  systemConfig: {
    label: "System Config",
    resources: systemConfigItems,
  },
};

export const INITIAL_STATE = Object.freeze({});

export const selectResourceItem = ({ props }, id) => {
  const { resourceCategory } = props;
  return resourceCategoryNames[resourceCategory].resources.find(
    (item) => item.id === id,
  );
};

export const toViewData = ({ props }) => {
  const { resourceCategory, selectedResourceId } = props;

  const resourceItems = resourceCategoryNames[resourceCategory].resources;

  const items = resourceItems.map((item) => {
    const isSelected = selectedResourceId === item.id;
    return {
      id: item.id,
      name: item.name,
      path: item.path,
      bgc: isSelected ? "mu" : "bg",
    };
  });

  return {
    label: resourceCategoryNames[resourceCategory].label,
    items,
  };
};
