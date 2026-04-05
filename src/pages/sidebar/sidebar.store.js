import {
  assetItems,
  systemConfigItems,
  userInterfaceItems,
} from "../resourceTypes/resourceTypes.store.js";

const SIDEBAR_TITLE_ASSETS = "Assets";
const SIDEBAR_TITLE_USER_INTERFACE = "User Interface";
const SIDEBAR_TITLE_SYSTEM = "System";
const SIDEBAR_TITLE_SCENES = "Scenes";
const SIDEBAR_TITLE_SETTINGS = "Settings";

export const createInitialState = () => ({
  header: {
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
      title: "Assets",
      path: "/project/images",
      icon: "image",
    },
    {
      title: "User Interface",
      path: "/project/colors",
      icon: "color",
    },
    {
      title: "System",
      path: "/project/controls",
      icon: "settings",
    },
    {
      title: "Scenes",
      path: "/project/scenes",
      icon: "script",
    },
    {
      title: "Release",
      path: "/project/releases/versions",
      icon: "choices",
    },
    {
      type: "spacer",
    },
    {
      title: "Settings",
      path: "/project/about",
      icon: "settings",
    },
  ],
});

export const setProjectImageUrl = ({ state }, { imageUrl } = {}) => {
  state.header.image.src = imageUrl;
};

export const selectViewData = ({ state }) => {
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  // Find the matching item based on path
  const findMatchingItem = () => {
    if (!currentPath) return null;

    // Check for exact match first
    const exactMatch = state.items.find((item) => item.path === currentPath);
    if (exactMatch) return exactMatch.path;

    // Build category mappings from imported definitions
    const categoryMappings = [
      {
        items: assetItems,
        sidebarPath: state.items.find(
          (item) => item.title === SIDEBAR_TITLE_ASSETS,
        )?.path,
      },
      {
        items: userInterfaceItems,
        sidebarPath: state.items.find(
          (item) => item.title === SIDEBAR_TITLE_USER_INTERFACE,
        )?.path,
      },
      {
        items: systemConfigItems,
        sidebarPath: state.items.find(
          (item) => item.title === SIDEBAR_TITLE_SYSTEM,
        )?.path,
      },
    ];

    // Check which category the current path belongs to
    for (const { items, sidebarPath } of categoryMappings) {
      if (!sidebarPath) continue;

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

      if (matchFound) return sidebarPath;
    }

    // For scenes - match any route starting with /project/scene
    if (currentPath.startsWith("/project/scene")) {
      const scenesItem = state.items.find(
        (item) => item.title === SIDEBAR_TITLE_SCENES,
      );
      if (scenesItem) return scenesItem.path;
    }

    // For settings
    if (currentPath === "/project/about" || currentPath === "/project/user") {
      const settingsItem = state.items.find(
        (item) => item.title === SIDEBAR_TITLE_SETTINGS,
      );
      if (settingsItem) return settingsItem.path;
    }

    // // For versions
    // if (currentPath === "/project/versions") {
    //   const versionsItem = state.items.find(
    //     (item) => item.title === "Versions",
    //   );
    //   if (versionsItem) return versionsItem.path;
    // }
    return null;
  };

  return {
    header: state.header,
    items: state.items,
    selectedItemId: findMatchingItem(),
  };
};
