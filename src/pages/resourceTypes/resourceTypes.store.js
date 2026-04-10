export const assetItems = [
  {
    id: "images",
    name: "Images",
    path: "/project/images",
  },
  {
    id: "sounds",
    name: "Sounds",
    path: "/project/sounds",
  },
  {
    id: "videos",
    name: "Videos",
    path: "/project/videos",
  },
  {
    id: "characters",
    name: "Characters",
    path: "/project/characters",
  },
  {
    id: "transforms",
    name: "Transforms",
    path: "/project/transforms",
  },
];

export const animatedAssetItems = [
  {
    id: "animations",
    name: "Animations",
    path: "/project/animations",
  },
  {
    id: "particles",
    name: "Particles",
    path: "/project/particles",
  },
  {
    id: "spritesheets",
    name: "Spritesheets",
    path: "/project/spritesheets",
  },
];

export const userInterfaceItems = [
  {
    id: "colors",
    name: "Colors",
    path: "/project/colors",
  },
  {
    id: "fonts",
    name: "Fonts",
    path: "/project/fonts",
  },
  {
    id: "textStyles",
    name: "Text Styles",
    path: "/project/text-styles",
  },
  {
    id: "layouts",
    name: "Layouts",
    path: "/project/layouts",
  },
];

export const systemConfigItems = [
  {
    id: "controls",
    name: "Controls",
    path: "/project/controls",
  },
  {
    id: "systemVariables",
    name: "System Variables",
    path: "/project/system-variables",
  },
  {
    id: "variables",
    name: "Variables",
    path: "/project/variables",
  },
];

const settingsItems = [
  {
    id: "about",
    name: "About",
    path: "/project/about",
  },
  // {
  //   id: "user",
  //   name: "User",
  //   path: "/project/user",
  // },
];

const releaseItems = [
  {
    id: "versions",
    name: "Versions",
    path: "/project/releases/versions",
  },
];

// Map sub-resource IDs to their parent resource IDs for menu highlighting
const resourceParentMapping = {
  "character-sprites": "characters",
  "layout-editor": "layouts",
  "animation-editor": "animations",
};

const resourceCategoryNames = {
  assets: {
    label: "Assets",
    resources: assetItems,
  },
  animatedAssets: {
    label: "Animated Assets",
    resources: animatedAssetItems,
  },
  userInterface: {
    label: "User Interface",
    resources: userInterfaceItems,
  },
  systemConfig: {
    label: "System",
    resources: systemConfigItems,
  },
  settings: {
    label: "Settings",
    resources: settingsItems,
  },
  releases: {
    label: "Releases",
    resources: releaseItems,
  },
};

export const createInitialState = () => ({});

const EMPTY_CATEGORY = Object.freeze({
  label: "",
  resources: [],
});

const getCategoryConfig = (resourceCategory) =>
  resourceCategoryNames[resourceCategory] || EMPTY_CATEGORY;

export const selectResourceItem = ({ props }, id) => {
  const { resourceCategory } = props;
  const categoryConfig = getCategoryConfig(resourceCategory);
  return categoryConfig.resources.find((item) => item.id === id);
};

export const selectViewData = ({ props }) => {
  const { resourceCategory, selectedResourceId } = props;
  const categoryConfig = getCategoryConfig(resourceCategory);

  // Get the actual resource ID to highlight (use parent mapping if exists)
  const actualSelectedId =
    resourceParentMapping[selectedResourceId] || selectedResourceId;

  const resourceItems = categoryConfig.resources.filter(
    (item) => !item.hidden || item.id === actualSelectedId,
  );

  const items = resourceItems.map((item) => {
    const isSelected = actualSelectedId === item.id;
    return {
      id: item.id,
      name: item.name,
      path: item.path,
      bgc: isSelected ? "mu" : "bg",
    };
  });

  return {
    label: categoryConfig.label,
    items,
  };
};
