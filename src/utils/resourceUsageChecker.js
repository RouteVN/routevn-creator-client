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

// Keys that indicate resource usage in typography
export const TYPOGRAPHY_RESOURCE_KEYS = ["colorId", "fontId"];

const checkNode = (node, resourceId, keys, usages, targetType) => {
  if (!node || typeof node !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (
      typeof value === "string" &&
      value === resourceId &&
      keys.includes(key)
    ) {
      usages.push({
        property: key,
      });
    }

    if (typeof value === "object" && value !== null) {
      if (key === "items") {
        for (const item of Object.values(value)) {
          checkNode(item, resourceId, keys, usages, targetType);
        }
      } else if (Array.isArray(value)) {
        value.forEach((item) => {
          checkNode(item, resourceId, keys, usages, targetType);
        });
      } else {
        checkNode(value, resourceId, keys, usages, targetType);
      }
    }
  }
};

export const recursivelyCheckResource = ({ state, itemId, checkTargets }) => {
  const inProps = {};

  for (const target of checkTargets) {
    const { name, keys } = target;
    const data = state[name];

    if (!data) continue;

    const usages = [];
    checkNode(data, itemId, keys, usages, name);

    if (usages.length > 0) {
      inProps[name] = usages;
    }
  }

  const totalUsageCount = Object.values(inProps).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  return {
    inProps,
    isUsed: totalUsageCount > 0,
    count: totalUsageCount,
  };
};
