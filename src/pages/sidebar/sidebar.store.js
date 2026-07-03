import {
  assetItems,
  animatedAssetItems,
  systemConfigItems,
  userInterfaceItems,
} from "../resourceTypes/resourceTypes.store.js";

const SIDEBAR_ITEM_ASSETS = "assets";
const SIDEBAR_ITEM_ANIMATED_ASSETS = "animatedAssets";
const SIDEBAR_ITEM_USER_INTERFACE = "userInterface";
const SIDEBAR_ITEM_SYSTEM = "system";
const SIDEBAR_ITEM_SCENES = "scenes";
const SIDEBAR_ITEM_RELEASE = "release";
const SIDEBAR_ITEM_SETTINGS = "settings";

const SIDEBAR_TITLE_KEYS = {
  [SIDEBAR_ITEM_ASSETS]: "assetsTitle",
  [SIDEBAR_ITEM_ANIMATED_ASSETS]: "animatedAssetsTitle",
  [SIDEBAR_ITEM_USER_INTERFACE]: "userInterfaceTitle",
  [SIDEBAR_ITEM_SYSTEM]: "systemTitle",
  [SIDEBAR_ITEM_SCENES]: "scenesTitle",
  [SIDEBAR_ITEM_RELEASE]: "releaseTitle",
  [SIDEBAR_ITEM_SETTINGS]: "settingsTitle",
};

const selectSidebarCopy = (i18n = {}) => i18n.sidebarPage ?? {};

export const createInitialState = () => ({
  header: {
    id: "project",
    label: "Sidebar",
    path: "/project",
    image: {
      src: "/public/project_logo_placeholder.png",
      width: 48,
      height: 48,
      alt: "Sidebar",
    },
  },
  items: [
    {
      id: SIDEBAR_ITEM_ASSETS,
      title: "Assets",
      path: "/project/images",
      icon: "image",
    },
    {
      id: SIDEBAR_ITEM_ANIMATED_ASSETS,
      title: "Animated Assets",
      path: "/project/animations",
      icon: "animation",
    },
    {
      id: SIDEBAR_ITEM_USER_INTERFACE,
      title: "User Interface",
      path: "/project/colors",
      icon: "color",
    },
    {
      id: SIDEBAR_ITEM_SYSTEM,
      title: "System",
      path: "/project/controls",
      icon: "sliders",
    },
    {
      id: SIDEBAR_ITEM_SCENES,
      title: "Scenes",
      path: "/project/scenes",
      icon: "script",
    },
    {
      id: SIDEBAR_ITEM_RELEASE,
      title: "Release",
      path: "/project/releases/versions",
      icon: "rocket",
    },
    {
      type: "spacer",
    },
    {
      id: SIDEBAR_ITEM_SETTINGS,
      title: "Settings",
      path: "/project/about",
      icon: "settings",
    },
  ],
});

export const setProjectImageUrl = ({ state }, { imageUrl } = {}) => {
  state.header.image.src = imageUrl;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectSidebarCopy(i18n);
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  // Find the matching item based on path
  const findMatchingItem = () => {
    if (!currentPath) return null;

    // Check for exact match first
    const exactMatch = state.items.find((item) => item.path === currentPath);
    if (exactMatch) return exactMatch.id;

    // Build category mappings from imported definitions
    const categoryMappings = [
      {
        items: assetItems,
        sidebarItem: state.items.find(
          (item) => item.id === SIDEBAR_ITEM_ASSETS,
        ),
      },
      {
        items: animatedAssetItems,
        sidebarItem: state.items.find(
          (item) => item.id === SIDEBAR_ITEM_ANIMATED_ASSETS,
        ),
      },
      {
        items: userInterfaceItems,
        sidebarItem: state.items.find(
          (item) => item.id === SIDEBAR_ITEM_USER_INTERFACE,
        ),
      },
      {
        items: systemConfigItems,
        sidebarItem: state.items.find(
          (item) => item.id === SIDEBAR_ITEM_SYSTEM,
        ),
      },
    ];

    // Check which category the current path belongs to
    for (const { items, sidebarItem } of categoryMappings) {
      if (!sidebarItem) continue;

      // Check if current path matches any item in this category
      const matchFound = items.some((item) => {
        // Exact match
        if (currentPath === item.path) return true;

        // Extract the resource type from current path
        const currentResourceMatch = currentPath.match(/^\/project\/([^/?]+)/);
        if (!currentResourceMatch) return false;
        const currentResourceType = currentResourceMatch[1];

        // Check if current resource type is related to this item
        // For editor routes: layout-editor -> layout -> layouts
        const itemSingular = item.id.endsWith("s")
          ? item.id.slice(0, -1)
          : item.id;

        // Check various patterns
        if (currentResourceType === item.id) return true; // Exact: colors === colors
        if (currentResourceType.startsWith(itemSingular + "-")) return true; // Editor: layout-editor starts with layout-
        if (currentResourceType.startsWith(item.id + "-")) return true; // Sub-resource: colors-something starts with colors-

        return false;
      });

      if (matchFound) return sidebarItem.id;
    }

    // For scenes - match any route starting with /project/scene
    if (currentPath.startsWith("/project/scene")) {
      const scenesItem = state.items.find(
        (item) => item.id === SIDEBAR_ITEM_SCENES,
      );
      if (scenesItem) return scenesItem.id;
    }

    // For settings
    if (
      currentPath === "/project/about" ||
      currentPath === "/project/appearance" ||
      currentPath === "/project/user"
    ) {
      const settingsItem = state.items.find(
        (item) => item.id === SIDEBAR_ITEM_SETTINGS,
      );
      if (settingsItem) return settingsItem.id;
    }

    if (
      currentPath === "/project/releases" ||
      currentPath.startsWith("/project/releases/")
    ) {
      const releaseItem = state.items.find(
        (item) => item.id === SIDEBAR_ITEM_RELEASE,
      );
      if (releaseItem) return releaseItem.id;
    }

    return null;
  };

  return {
    header: {
      ...state.header,
      label: copy.sidebarLabel ?? state.header.label,
      image: {
        ...state.header.image,
        alt: copy.sidebarLabel ?? state.header.image.alt,
      },
    },
    items: state.items.map((item) => ({
      ...item,
      title: copy[SIDEBAR_TITLE_KEYS[item.id]] ?? item.title,
    })),
    selectedItemId: findMatchingItem(),
  };
};
