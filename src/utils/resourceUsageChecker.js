export const checkResourceUsageInScene = (scene, resourceId) => {
  const usages = [];

  if (!scene || typeof scene !== "object") {
    return usages;
  }

  const checkNode = (node, path) => {
    if (!node || typeof node !== "object") {
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === "string" && value === resourceId) {
        if (
          key === "resourceId" ||
          key === "sceneId" ||
          key === "sectionId" ||
          key === "characterId" ||
          key === "animation" ||
          key === "layoutId" ||
          key === "guiId" ||
          key === "bgmId" ||
          key === "sfxId"
        ) {
          usages.push({
            type: "scene",
            property: key,
            path: currentPath,
          });
        }
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

  checkNode(scene, "");
  return usages;
};

export const checkResourceUsageInLayout = (layout, resourceId) => {
  const usages = [];
  console.log("Checking layout for resourceId: ", layout);
  if (!layout || typeof layout !== "object") {
    return usages;
  }

  const checkNode = (node, path) => {
    console.log("Checking node: ", node, " at path: ", path);
    if (!node || typeof node !== "object") {
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === "string" && value === resourceId) {
        if (
          key === "imageId" ||
          key === "hoverImageId" ||
          key === "clickImageId" ||
          key === "typographyId" ||
          key === "hoverTypographyId" ||
          key === "clickedTypographyId" ||
          key === "fontFileId"
        ) {
          usages.push({
            type: "layout",
            property: key,
            path: currentPath,
          });
        }
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

  checkNode(layout, "");
  return usages;
};

export const checkResourceUsage = (scene, layout, resourceId) => {
  console.log("Checking resource usage for resourceId: ", resourceId);
  const sceneUsages = checkResourceUsageInScene(scene, resourceId);
  const layoutUsages = checkResourceUsageInLayout(layout, resourceId);

  return {
    inScene: sceneUsages,
    inLayout: layoutUsages,
    isUsed: sceneUsages.length > 0 || layoutUsages.length > 0,
    count: sceneUsages.length + layoutUsages.length,
  };
};
