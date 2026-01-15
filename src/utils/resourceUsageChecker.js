// Keys that indicate resource usage in different resource types
const SCENE_RESOURCE_KEYS = [
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

const LAYOUT_RESOURCE_KEYS = [
  "imageId",
  "hoverImageId",
  "clickImageId",
  "typographyId",
  "hoverTypographyId",
  "clickedTypographyId",
  "fontFileId",
];

const TYPOGRAPHY_RESOURCE_KEYS = ["colorId", "fontId"];

// Mapping from resource names to their keys
const RESOURCE_KEYS_MAP = {
  scenes: SCENE_RESOURCE_KEYS,
  layouts: LAYOUT_RESOURCE_KEYS,
  typography: TYPOGRAPHY_RESOURCE_KEYS,
};

const checkNode = (node, resourceId, keys, usages) => {
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
          checkNode(item, resourceId, keys, usages);
        }
      } else if (Array.isArray(value)) {
        value.forEach((item) => {
          checkNode(item, resourceId, keys, usages);
        });
      } else {
        checkNode(value, resourceId, keys, usages);
      }
    }
  }
};

export const recursivelyCheckResource = ({ state, itemId, checkTargets }) => {
  const inProps = {};

  for (const targetName of checkTargets) {
    const keys = RESOURCE_KEYS_MAP[targetName];
    if (!keys) continue;

    const data = state[targetName];
    if (!data) continue;

    const usages = [];
    checkNode(data, itemId, keys, usages);

    if (usages.length > 0) {
      inProps[targetName] = usages;
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
