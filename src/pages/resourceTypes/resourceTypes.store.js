export const assetItems = [
  {
    id: "images",
    name: "Images",
    path: "/project/resources/images",
  },
  {
    id: "sounds",
    name: "Sounds",
    path: "/project/resources/sounds",
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
    id: "transforms",
    name: "Transforms",
    path: "/project/resources/transforms",
  },
  {
    id: "tweens",
    name: "Tweens",
    path: "/project/resources/tweens",
  },
];

export const userInterfaceItems = [
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
    id: "layouts",
    name: "Layouts",
    path: "/project/resources/layouts",
  },
];

export const systemConfigItems = [
  {
    id: "variables",
    name: "Variables",
    path: "/project/resources/variables",
  },
];

const settingsItems = [
  {
    id: "about",
    name: "About",
    path: "/project/settings/about",
  },
  // {
  //   id: "user",
  //   name: "User",
  //   path: "/project/settings/user",
  // },
];

const releaseItems = [
  {
    id: "versions",
    name: "Version",
    path: "/project/releases/versions",
  },
];

// Map sub-resource IDs to their parent resource IDs for menu highlighting
const resourceParentMapping = {
  "character-sprites": "characters",
  "layout-editor": "layouts",
};

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

  const resourceItems = categoryConfig.resources;

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
