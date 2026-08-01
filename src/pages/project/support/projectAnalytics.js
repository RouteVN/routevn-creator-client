import { toFlatItems } from "../../../internal/project/tree.js";
import { normalizeSceneTextStats } from "../../../internal/ui/sceneTextStats.js";

export const PROJECT_ANALYTICS_RESOURCE_GROUPS = Object.freeze([
  {
    key: "assets",
    resourceKeys: ["images", "sounds", "videos", "characters", "transforms"],
  },
  {
    key: "animatedAssets",
    resourceKeys: ["animations", "particles", "spritesheets"],
  },
  {
    key: "userInterface",
    resourceKeys: ["colors", "fonts", "textStyles", "layouts"],
  },
  {
    key: "systemConfig",
    resourceKeys: ["variables", "controls"],
  },
]);

const PROJECT_ANALYTICS_RESOURCE_ROUTES = Object.freeze({
  images: "/project/images",
  sounds: "/project/sounds",
  videos: "/project/videos",
  characters: "/project/characters",
  transforms: "/project/transforms",
  animations: "/project/animations",
  particles: "/project/particles",
  spritesheets: "/project/spritesheets",
  colors: "/project/colors",
  fonts: "/project/fonts",
  textStyles: "/project/text-styles",
  layouts: "/project/layouts",
  variables: "/project/variables",
  controls: "/project/controls",
  scenes: "/project/scenes",
});

export const selectProjectAnalyticsResourceRoute = ({ resourceKey } = {}) =>
  PROJECT_ANALYTICS_RESOURCE_ROUTES[resourceKey];

const selectResourceItems = (collection = {}) =>
  Object.values(collection.items ?? {}).filter(
    (item) => item?.type !== "folder",
  );

const selectScenes = (repositoryState = {}) =>
  toFlatItems(repositoryState.scenes ?? { items: {}, tree: [] }).filter(
    (scene) => scene.type !== "folder",
  );

const selectCharacters = (repositoryState = {}) =>
  toFlatItems(repositoryState.characters ?? { items: {}, tree: [] }).filter(
    (character) => character.type !== "folder",
  );

export const buildProjectAnalytics = ({
  repositoryState = {},
  sceneOverviewsById = {},
} = {}) => {
  const scenes = selectScenes(repositoryState).map((scene) => {
    const textStats = normalizeSceneTextStats(
      sceneOverviewsById[scene.id]?.textStats,
    );

    return {
      id: scene.id,
      name: scene.name ?? scene.id,
      wordCount: textStats.wordCount,
      characterCount: textStats.characterCount,
    };
  });
  const resourceGroups = PROJECT_ANALYTICS_RESOURCE_GROUPS.map((group) => ({
    key: group.key,
    resources: group.resourceKeys.map((key) => ({
      key,
      count: selectResourceItems(repositoryState[key]).length,
    })),
  }));
  const characterResources = selectCharacters(repositoryState).map(
    (character) => {
      const sprites = selectResourceItems(character.sprites);

      return {
        id: character.id,
        name: character.name ?? character.id,
        spriteCount: sprites.filter(
          (sprite) => sprite.type === "image" || sprite.type === "spritesheet",
        ).length,
      };
    },
  );

  return {
    resourceGroups,
    characterResources,
    scenes,
  };
};
