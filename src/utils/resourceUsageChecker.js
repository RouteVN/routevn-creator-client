// Keys that indicate resource usage in scenes
export const SCENE_RESOURCE_KEYS = [
  "resourceId",
  "transformId",
  "sceneId",
  "sectionId",
  "characterId",
  "animation",
  "layoutId",
  "guiId",
  "bgmId",
  "sfxId",
];

// Keys that indicate resource usage in layouts
export const LAYOUT_RESOURCE_KEYS = [
  "imageId",
  "hoverImageId",
  "clickImageId",
  "typographyId",
  "hoverTypographyId",
  "clickedTypographyId",
  "fontFileId",
];

// Map of resource types to their keys
export const RESOURCE_KEYS_MAP = {
  scene: SCENE_RESOURCE_KEYS,
  layout: LAYOUT_RESOURCE_KEYS,
};

const recursivelyCheckResource = (data, resourceId, keys) => {
  const usages = [];

  if (!data || typeof data !== "object") {
    return usages;
  }

  const checkNode = (node, path) => {
    if (!node || typeof node !== "object") {
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (
        typeof value === "string" &&
        value === resourceId &&
        keys.includes(key)
      ) {
        usages.push({
          type: keys === SCENE_RESOURCE_KEYS ? "scene" : "layout",
          property: key,
          path: currentPath,
        });
      }

      if (typeof value === "object" && value !== null) {
        if (key === "items") {
          for (const [itemId, item] of Object.entries(value)) {
            checkNode(item, `${currentPath}.${itemId}`);
          }
        } else if (Array.isArray(value)) {
          value.forEach((item, index) => {
            checkNode(item, `${currentPath}[${index}]`);
          });
        } else {
          checkNode(value, currentPath);
        }
      }
    }
  };

  checkNode(data, "");
  return usages;
};

export const checkResourceUsage = (scene, layout, resourceId) => {
  const sceneUsages = recursivelyCheckResource(
    scene,
    resourceId,
    SCENE_RESOURCE_KEYS,
  );
  const layoutUsages = recursivelyCheckResource(
    layout,
    resourceId,
    LAYOUT_RESOURCE_KEYS,
  );

  return {
    inScene: sceneUsages,
    inLayout: layoutUsages,
    isUsed: sceneUsages.length > 0 || layoutUsages.length > 0,
    count: sceneUsages.length + layoutUsages.length,
  };
};
