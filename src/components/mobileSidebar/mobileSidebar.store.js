import { toFlatItems } from "../../internal/project/tree.js";

const assetItems = [
  {
    id: "images",
    label: "Images",
    path: "/project/images",
    icon: "image",
  },
  {
    id: "sounds",
    label: "Sounds",
    path: "/project/sounds",
    icon: "audio",
  },
  {
    id: "characters",
    label: "Characters",
    path: "/project/characters",
    icon: "character",
  },
  {
    id: "transforms",
    label: "Transforms",
    path: "/project/transforms",
    icon: "transition",
  },
];

const animatedAssetItems = [
  {
    id: "animations",
    label: "Animations",
    path: "/project/animations",
    icon: "animation",
  },
  {
    id: "particles",
    label: "Particles",
    path: "/project/particles",
    icon: "particles",
  },
  {
    id: "spritesheets",
    label: "Spritesheets",
    path: "/project/spritesheets",
    icon: "spritesheets",
  },
];

const userInterfaceItems = [
  {
    id: "colors",
    label: "Colors",
    path: "/project/colors",
    icon: "color",
  },
  {
    id: "fonts",
    label: "Fonts",
    path: "/project/fonts",
    icon: "font",
  },
  {
    id: "text-styles",
    label: "Text Styles",
    path: "/project/text-styles",
    icon: "typography",
  },
  {
    id: "layouts",
    label: "Layouts",
    path: "/project/layouts",
    icon: "layout",
  },
];

const releaseItems = [
  {
    id: "versions",
    label: "Versions",
    path: "/project/releases/versions",
    icon: "rocket",
  },
  {
    id: "web-server",
    label: "Web Server",
    path: "/project/releases/web-server",
    icon: "website",
  },
];

const settingsItems = [
  {
    id: "project",
    label: "Project",
    path: "/project",
    icon: "home",
  },
  {
    id: "about",
    label: "About",
    path: "/project/about",
    icon: "info",
  },
  {
    id: "appearance",
    label: "Appearance",
    path: "/project/appearance",
    icon: "color",
  },
];

const assetsSections = [
  {
    id: "assets",
    label: "Assets",
    items: assetItems,
  },
  {
    id: "animated-assets",
    label: "Animated Assets",
    items: animatedAssetItems,
  },
  {
    id: "user-interface",
    label: "User Interface",
    items: userInterfaceItems,
  },
];

const releaseSections = [
  {
    id: "release",
    label: "Release",
    items: releaseItems,
  },
];

const settingsSections = [
  {
    id: "settings",
    label: "Settings",
    items: settingsItems,
  },
];

const sectionsByVariant = {
  assets: assetsSections,
  release: releaseSections,
  settings: settingsSections,
};

const resourceParentMapping = {
  "animation-editor": "animations",
  "character-sprites": "characters",
  "layout-editor": "layouts",
  releases: "versions",
};

export const createInitialState = () => ({
  scenesData: { tree: [], items: {} },
});

export const setScenesData = ({ state }, { scenesData } = {}) => {
  state.scenesData = scenesData ?? { tree: [], items: {} };
};

const buildSceneMapSections = (state) => {
  const sceneItems = toFlatItems(state.scenesData)
    .filter((item) => item.type === "scene")
    .map((item) => ({
      id: `scene:${item.id}`,
      label: item.name ?? "Scene",
      path: "/project/scene-editor",
      payload: { s: item.id },
      clearPayloadKeys: ["sceneId", "sectionId"],
      icon: "scene",
    }));

  return [
    {
      id: "scene-map",
      label: "Scenes",
      items: [
        {
          id: "scene-map",
          label: "Scene Map",
          path: "/project/scenes",
          clearPayloadKeys: ["s", "sceneId", "sectionId"],
          icon: "script",
        },
        ...sceneItems,
      ],
    },
  ];
};

const getSectionsByVariant = (state) => ({
  ...sectionsByVariant,
  "scene-map": buildSceneMapSections(state),
});

const getNavigationItems = (state) =>
  Object.values(getSectionsByVariant(state))
    .flat()
    .flatMap((section) => section.items)
    .filter((item) => !item.hidden);

const selectCurrentResourceId = () => {
  if (typeof window === "undefined") {
    return undefined;
  }

  const match = window.location.pathname.match(/^\/project\/([^/?]+)/);
  if (!match) {
    return undefined;
  }

  if (match[1] === "releases") {
    const releaseMatch = window.location.pathname.match(
      /^\/project\/releases\/([^/?]+)/,
    );
    return releaseMatch?.[1] ?? resourceParentMapping.releases;
  }

  if (match[1] === "scenes") {
    return "scene-map";
  }

  if (match[1] === "scene-editor") {
    const sceneId = new URLSearchParams(window.location.search).get("s");
    return sceneId ? `scene:${sceneId}` : undefined;
  }

  return resourceParentMapping[match[1]] ?? match[1];
};

export const selectItemById = ({ state }, { itemId } = {}) => {
  return getNavigationItems(state).find((item) => item.id === itemId);
};

export const selectViewData = ({ state, props = {} }) => {
  const variant = props.variant ?? "assets";
  const sections = getSectionsByVariant(state)[variant] ?? assetsSections;
  const selectedResourceId = selectCurrentResourceId();
  const viewSections = sections.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => !item.hidden)
      .map((item) => ({
        ...item,
        bgc: item.id === selectedResourceId ? "ac" : "bg",
      })),
  }));

  return {
    w: props.w ?? "f",
    h: props.h ?? "f",
    sections: viewSections,
  };
};
