import { buildLayoutRenderElements } from "./project/layout.js";

export const extractFileIdsFromRenderState = (obj) => {
  const fileReferencesByKey = new Map();

  const addFileReference = (fileId, type = "image/png") => {
    if (typeof fileId !== "string" || fileId.length === 0) {
      return;
    }

    const key = `${type}:${fileId}`;
    if (fileReferencesByKey.has(key)) {
      return;
    }

    fileReferencesByKey.set(key, {
      url: fileId,
      type,
    });
  };

  function traverse(value) {
    if (value === null || value === undefined) return;

    if (typeof value === "string") {
      if (value.startsWith("file:")) {
        addFileReference(value.replace("file:", ""));
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }

    if (typeof value === "object") {
      Object.keys(value).forEach((key) => {
        if (
          (key === "fileId" ||
            key === "url" ||
            key === "src" ||
            key === "thumbSrc" ||
            key === "barSrc" ||
            key === "hoverUrl" ||
            key === "clickUrl" ||
            key === "fontFileId") &&
          typeof value[key] === "string"
        ) {
          const fileId = value[key].startsWith("file:")
            ? value[key].replace("file:", "")
            : value[key];
          addFileReference(fileId, value.fileType || "image/png");
        }
        traverse(value[key]);
      });
    }
  }

  traverse(obj);
  return Array.from(fileReferencesByKey.values());
};

const RESOURCE_REFERENCE_KEYS = new Set([
  "resourceId",
  "guiId",
  "bgmId",
  "sfxId",
  "layoutId",
  "characterId",
  "transformId",
  "textStyleId",
  "fontId",
  "fontFileId",
  "colorId",
  "strokeColorId",
  "imageId",
  "hoverImageId",
  "clickImageId",
  "thumbImageId",
  "barImageId",
  "hoverThumbImageId",
  "hoverBarImageId",
]);

const createResourceSelection = () => ({
  images: new Set(),
  videos: new Set(),
  sounds: new Set(),
  fonts: new Set(),
  colors: new Set(),
  textStyles: new Set(),
  layouts: new Set(),
  characters: new Set(),
  transforms: new Set(),
  tweens: new Set(),
});

const addResourceIdToSelection = (selection, resources, resourceId) => {
  if (typeof resourceId !== "string" || resourceId.length === 0) {
    return;
  }

  if (resources.images?.[resourceId]) {
    selection.images.add(resourceId);
  }
  if (resources.videos?.[resourceId]) {
    selection.videos.add(resourceId);
  }
  if (resources.sounds?.[resourceId]) {
    selection.sounds.add(resourceId);
  }
  if (resources.fonts?.[resourceId]) {
    selection.fonts.add(resourceId);
  }
  if (resources.colors?.[resourceId]) {
    selection.colors.add(resourceId);
  }
  if (resources.textStyles?.[resourceId]) {
    selection.textStyles.add(resourceId);
  }
  if (resources.layouts?.[resourceId]) {
    selection.layouts.add(resourceId);
  }
  if (resources.characters?.[resourceId]) {
    selection.characters.add(resourceId);
  }
  if (resources.transforms?.[resourceId]) {
    selection.transforms.add(resourceId);
  }
  if (resources.tweens?.[resourceId]) {
    selection.tweens.add(resourceId);
  }
};

const traverseScene = (value, handleEntry) => {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => {
      traverseScene(item, handleEntry);
    });
    return;
  }

  Object.entries(value).forEach(([key, entry]) => {
    handleEntry(key, entry);
    traverseScene(entry, handleEntry);
  });
};

const pickByIds = (items = {}, idSet) => {
  if (!idSet || idSet.size === 0) {
    return {};
  }

  return Array.from(idSet).reduce((result, id) => {
    if (items[id]) {
      result[id] = items[id];
    }
    return result;
  }, {});
};

const collectResourceSelectionFromValue = (projectData, value) => {
  const resources = projectData?.resources || {};
  const selection = createResourceSelection();
  const pendingLayoutIds = [];
  const queuedLayoutIds = new Set();
  const pendingTextStyleIds = [];
  const queuedTextStyleIds = new Set();

  const scanValue = (node) => {
    traverseScene(node, (key, entry) => {
      if (!RESOURCE_REFERENCE_KEYS.has(key) || typeof entry !== "string") {
        return;
      }

      const hadLayout = selection.layouts.has(entry);
      const hadTextStyle = selection.textStyles.has(entry);
      addResourceIdToSelection(selection, resources, entry);

      if (
        !hadLayout &&
        selection.layouts.has(entry) &&
        !queuedLayoutIds.has(entry)
      ) {
        queuedLayoutIds.add(entry);
        pendingLayoutIds.push(entry);
      }

      if (
        !hadTextStyle &&
        selection.textStyles.has(entry) &&
        !queuedTextStyleIds.has(entry)
      ) {
        queuedTextStyleIds.add(entry);
        pendingTextStyleIds.push(entry);
      }
    });
  };

  scanValue(value);

  while (pendingLayoutIds.length > 0) {
    const layoutId = pendingLayoutIds.shift();
    const layout = resources.layouts?.[layoutId];
    if (!layout) {
      continue;
    }
    scanValue(layout);
  }

  while (pendingTextStyleIds.length > 0) {
    const textStyleId = pendingTextStyleIds.shift();
    const textStyle = resources.textStyles?.[textStyleId];
    if (!textStyle) {
      continue;
    }
    scanValue(textStyle);
  }

  return selection;
};

const dedupeFileReferences = (fileReferences = []) => {
  const dedupedReferences = new Map();

  fileReferences.forEach((fileReference) => {
    const fileId = fileReference?.url;
    if (!fileId || dedupedReferences.has(fileId)) {
      return;
    }
    dedupedReferences.set(fileId, fileReference);
  });

  return Array.from(dedupedReferences.values());
};

export const extractTransitionTargetSceneIds = (projectData, sceneId) => {
  const scene = projectData?.story?.scenes?.[sceneId];
  const allScenes = projectData?.story?.scenes || {};

  if (!scene) {
    return [];
  }

  const sceneIds = new Set();

  traverseScene(scene, (key, entry) => {
    if (key !== "sectionTransition" || typeof entry !== "object" || !entry) {
      return;
    }

    if (typeof entry.sceneId !== "string" || !allScenes[entry.sceneId]) {
      return;
    }

    sceneIds.add(entry.sceneId);
  });

  return Array.from(sceneIds);
};

export const extractTransitionTargetSceneIdsFromActions = (
  actions,
  projectData,
) => {
  const allScenes = projectData?.story?.scenes || {};
  if (!actions || typeof actions !== "object") {
    return [];
  }

  const sceneIds = new Set();
  traverseScene(actions, (key, entry) => {
    if (key !== "sectionTransition" || typeof entry !== "object" || !entry) {
      return;
    }

    if (typeof entry.sceneId !== "string" || !allScenes[entry.sceneId]) {
      return;
    }

    sceneIds.add(entry.sceneId);
  });

  return Array.from(sceneIds);
};

const getValueByPath = (source, path) => {
  if (!path) {
    return source;
  }

  return path.split(".").reduce((result, segment) => {
    if (result === null || result === undefined) {
      return undefined;
    }
    return result[segment];
  }, source);
};

const resolveEventBindingString = (value, eventData) => {
  if (typeof value !== "string") {
    return value;
  }
  if (value === "_event") {
    return eventData;
  }
  if (!value.startsWith("_event.")) {
    return value;
  }

  const resolvedValue = getValueByPath(
    eventData,
    value.slice("_event.".length),
  );
  return resolvedValue === undefined ? value : resolvedValue;
};

export const resolveEventBindings = (value, eventData) => {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveEventBindings(entry, eventData));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveEventBindings(entry, eventData),
      ]),
    );
  }
  return resolveEventBindingString(value, eventData);
};

export const extractSceneIdsFromValue = (value, projectData) => {
  const allScenes = projectData?.story?.scenes || {};
  if (!value || typeof value !== "object") {
    return [];
  }

  const sceneIds = new Set();
  traverseScene(value, (key, entry) => {
    if (key !== "sceneId" || typeof entry !== "string") {
      return;
    }
    if (!allScenes[entry]) {
      return;
    }
    sceneIds.add(entry);
  });

  return Array.from(sceneIds);
};

export const extractLayoutIdsFromValue = (value, projectData) => {
  const allLayouts = projectData?.resources?.layouts || {};
  if (!value || typeof value !== "object") {
    return [];
  }

  const layoutIds = new Set();

  const scanNode = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(scanNode);
      return;
    }

    if (typeof node.layoutId === "string" && allLayouts[node.layoutId]) {
      layoutIds.add(node.layoutId);
    }

    if (
      typeof node.resourceId === "string" &&
      allLayouts[node.resourceId] &&
      (typeof node.resourceType !== "string" || node.resourceType === "layout")
    ) {
      layoutIds.add(node.resourceId);
    }

    Object.values(node).forEach(scanNode);
  };

  scanNode(value);
  return Array.from(layoutIds);
};

export const extractFileIdsForScene = (projectData, sceneId) => {
  const scene = projectData?.story?.scenes?.[sceneId];
  const resources = projectData?.resources;

  if (!scene || !resources) {
    return [];
  }

  const selection = collectResourceSelectionFromValue(projectData, scene);

  const scopedLayouts = pickByIds(resources.layouts, selection.layouts);

  const scopedResources = {
    images: pickByIds(resources.images, selection.images),
    videos: pickByIds(resources.videos, selection.videos),
    sounds: pickByIds(resources.sounds, selection.sounds),
    fonts: pickByIds(resources.fonts, selection.fonts),
    colors: pickByIds(resources.colors, selection.colors),
    textStyles: pickByIds(resources.textStyles, selection.textStyles),
    layouts: scopedLayouts,
    characters: pickByIds(resources.characters, selection.characters),
    transforms: pickByIds(resources.transforms, selection.transforms),
    tweens: pickByIds(resources.tweens, selection.tweens),
  };

  return dedupeFileReferences(extractFileIdsFromRenderState(scopedResources));
};

export const extractFileIdsForLayouts = (projectData, layoutIds = []) => {
  const resources = projectData?.resources;
  if (!resources || !Array.isArray(layoutIds) || layoutIds.length === 0) {
    return [];
  }

  const validLayoutIds = new Set(
    layoutIds.filter((layoutId) => typeof layoutId === "string" && layoutId),
  );
  const scopedLayouts = pickByIds(resources.layouts, validLayoutIds);

  if (Object.keys(scopedLayouts).length === 0) {
    return [];
  }

  const selection = collectResourceSelectionFromValue(
    projectData,
    scopedLayouts,
  );
  const scopedResources = {
    images: pickByIds(resources.images, selection.images),
    videos: pickByIds(resources.videos, selection.videos),
    sounds: pickByIds(resources.sounds, selection.sounds),
    layouts: scopedLayouts,
    fonts: pickByIds(resources.fonts, selection.fonts),
    colors: pickByIds(resources.colors, selection.colors),
    textStyles: pickByIds(resources.textStyles, selection.textStyles),
  };

  return dedupeFileReferences(extractFileIdsFromRenderState(scopedResources));
};

export const extractFileIdsForScenes = (projectData, sceneIds = []) => {
  if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
    return [];
  }

  const fileReferences = sceneIds.flatMap((sceneId) =>
    extractFileIdsForScene(projectData, sceneId),
  );
  return dedupeFileReferences(fileReferences);
};

export const extractInitialHybridSceneIds = (projectData, sceneId) => {
  if (!sceneId) {
    return [];
  }

  const relatedSceneIds = [
    sceneId,
    ...extractTransitionTargetSceneIds(projectData, sceneId),
  ];
  return Array.from(new Set(relatedSceneIds));
};

export const layoutHierarchyStructureToRenderState = (
  layout,
  imageItems,
  typographyData,
  colorsData,
  fontsData,
) => {
  return buildLayoutRenderElements(
    layout,
    imageItems,
    typographyData,
    colorsData,
    fontsData,
  );
};
