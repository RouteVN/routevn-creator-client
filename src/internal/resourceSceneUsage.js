const scanValueForIds = (value, targetIdSet) => {
  if (typeof value === "string") {
    if (targetIdSet.has(value)) {
      return true;
    }
    if (value.includes("${")) {
      for (const id of targetIdSet) {
        if (value.includes(id)) {
          return true;
        }
      }
    }
    return false;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (scanValueForIds(item, targetIdSet)) {
        return true;
      }
    }
    return false;
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      if (scanValueForIds(nested, targetIdSet)) {
        return true;
      }
    }
  }

  return false;
};

export const findResourceSceneUsage = ({
  scenes,
  itemId,
  additionalItemIds = [],
} = {}) => {
  if (!itemId || !scenes?.items) {
    return [];
  }

  const targetIdSet = new Set([itemId, ...additionalItemIds]);
  const matchingScenes = [];

  for (const scene of Object.values(scenes.items)) {
    if (!scene || scene.type === "folder") {
      continue;
    }

    const sections = scene.sections?.items ?? scene.sections;
    if (scanValueForIds(sections, targetIdSet)) {
      matchingScenes.push({
        id: scene.id,
        name: scene.name || "Untitled Scene",
      });
    }
  }

  return matchingScenes;
};

export const formatResourceSceneUsage = (scenes = [], copy = {}) => {
  if (scenes.length === 0) {
    return copy.usedInNone ?? "None";
  }

  const names = scenes.map((scene) => scene.name);
  if (names.length <= 2) {
    return names.join(", ");
  }

  return `${names.slice(0, 2).join(", ")}, +${names.length - 2} more`;
};

export const createUsedInDetailField = ({
  scenes,
  itemId,
  additionalItemIds,
  copy = {},
} = {}) => {
  const matchingScenes = findResourceSceneUsage({
    scenes,
    itemId,
    additionalItemIds,
  });

  return {
    type: "text",
    label: copy.usedInLabel ?? "Used In",
    value: formatResourceSceneUsage(matchingScenes, copy),
  };
};
