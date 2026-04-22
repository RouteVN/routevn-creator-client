import {
  buildLayoutElements,
  createLayoutReferenceResources,
  isFragmentLayout,
  toRouteEngineKeyboardResource,
} from "./layout.js";
import { RESOURCE_TYPES } from "./commands.js";
import { normalizeLineActions } from "./engineActions.js";
import { getInteractionActions } from "./interactionPayload.js";
import { toFlatItems, toHierarchyStructure } from "./tree.js";
import {
  collectTransitionMaskImageIds,
  compileTransitionMaskForRuntime,
} from "../animationMasks.js";
import {
  collectParticleTextureImageIds,
  createRenderableParticleData,
} from "../particles.js";
import { requireProjectResolution } from "../projectResolution.js";
import { withResolvedResourceFileMetadata } from "../resourceFileMetadata.js";

const DEFAULT_TIMESTAMP = 0;
const createResourceCollection = () => ({
  items: {},
  tree: [],
});

const createEmptyTagScopes = () => ({
  images: createResourceCollection(),
  sounds: createResourceCollection(),
  videos: createResourceCollection(),
  characters: createResourceCollection(),
  transforms: createResourceCollection(),
});

const toFiniteTimestamp = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const cloneOr = (value, fallback) => {
  if (value === undefined) return fallback;
  return structuredClone(value);
};

const isObjectRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const getHierarchyNodes = (collection) =>
  Array.isArray(collection?.tree) ? collection.tree : [];

const getRepositoryCollection = (repositoryState, resourceType) =>
  repositoryState?.[resourceType];

const walkHierarchy = (nodes, parentId, callback) => {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node.id !== "string") continue;
    callback(node, parentId);
    walkHierarchy(node.children, node.id, callback);
  }
};

const buildHierarchyParentMap = (tree) => {
  const parentById = new Map();
  const orderedIds = [];
  walkHierarchy(tree, null, (node, parentId) => {
    parentById.set(node.id, parentId);
    orderedIds.push(node.id);
  });
  return { parentById, orderedIds };
};

const appendMissingIds = (orderedIds, allIds) => {
  const result = [];
  const seen = new Set();

  for (const id of orderedIds) {
    if (!allIds.includes(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  for (const id of allIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
};

const createEmptyProjectState = ({
  projectId,
  name = "",
  description = "",
  timestamp = 0,
}) => {
  const resourceCollections = Object.fromEntries(
    RESOURCE_TYPES.map((type) => [type, createResourceCollection()]),
  );
  const createdAt = toFiniteTimestamp(timestamp, DEFAULT_TIMESTAMP);

  return {
    model_version: 2,
    project: {
      id: projectId,
      name,
      description,
      createdAt,
      updatedAt: createdAt,
    },
    story: {
      initialSceneId: null,
      sceneOrder: [],
    },
    scenes: {},
    sections: {},
    lines: {},
    tags: createEmptyTagScopes(),
    ...resourceCollections,
  };
};

const cloneCollectionState = (collection) => ({
  items: cloneOr(collection?.items, {}),
  tree: cloneOr(collection?.tree, []),
});

const projectRepositoryTagsToDomainTags = (repositoryTags) => {
  const tags = createEmptyTagScopes();

  if (!isObjectRecord(repositoryTags)) {
    return tags;
  }

  for (const [scopeKey, collection] of Object.entries(repositoryTags)) {
    tags[scopeKey] = cloneCollectionState(collection);
  }

  return tags;
};

const buildTreeFromParentMap = ({
  orderedIds,
  allIds,
  parentById,
  fallbackParentById,
}) => {
  const ROOT = "__root__";
  const ids = appendMissingIds(orderedIds, allIds);
  const idSet = new Set(ids);
  const childrenByParent = new Map([[ROOT, []]]);

  for (const id of ids) {
    const rawParentId =
      parentById.get(id) ?? fallbackParentById?.get(id) ?? null;
    const parentId =
      typeof rawParentId === "string" &&
      rawParentId.length > 0 &&
      rawParentId !== id &&
      idSet.has(rawParentId)
        ? rawParentId
        : null;
    const key = parentId || ROOT;
    if (!childrenByParent.has(key)) {
      childrenByParent.set(key, []);
    }
    childrenByParent.get(key).push(id);
  }

  const visited = new Set();
  const buildNodes = (parentKey) => {
    const idsForParent = childrenByParent.get(parentKey) || [];
    const nodes = [];
    for (const id of idsForParent) {
      if (visited.has(id)) continue;
      visited.add(id);
      const children = buildNodes(id);
      if (children.length > 0) {
        nodes.push({ id, children });
      } else {
        nodes.push({ id });
      }
    }
    return nodes;
  };

  const tree = buildNodes(ROOT);
  for (const id of ids) {
    if (visited.has(id)) continue;
    visited.add(id);
    tree.push({ id });
  }
  return tree;
};

const projectRepositoryResources = ({ repositoryState }) => {
  const resources = Object.fromEntries(
    RESOURCE_TYPES.map((collectionName) => [
      collectionName,
      { items: {}, tree: [] },
    ]),
  );

  // These are top-level repository collection names, not persisted item fields.
  for (const collectionName of RESOURCE_TYPES) {
    const repositoryCollection =
      getRepositoryCollection(repositoryState, collectionName) || {};
    const repositoryItems = repositoryCollection.items || {};
    const { parentById, orderedIds } = buildHierarchyParentMap(
      getHierarchyNodes(repositoryCollection),
    );
    const allIds = Object.keys(repositoryItems);
    const fallbackParentById = new Map(
      Object.entries(repositoryItems).map(([resourceId, item]) => [
        resourceId,
        item?.parentId ?? null,
      ]),
    );

    resources[collectionName].tree = buildTreeFromParentMap({
      orderedIds,
      allIds,
      parentById,
      fallbackParentById,
    });

    for (const [resourceId, item] of Object.entries(repositoryItems)) {
      const parentId = parentById.has(resourceId)
        ? parentById.get(resourceId)
        : (item?.parentId ?? null);
      const createdAt = toFiniteTimestamp(item?.createdAt, DEFAULT_TIMESTAMP);
      const updatedAt = toFiniteTimestamp(item?.updatedAt, createdAt);
      const normalizedItem = withResolvedResourceFileMetadata({
        item,
        files: repositoryState?.files,
      });

      if (collectionName === "layouts" || collectionName === "controls") {
        const clonedLayout = cloneOr(item, {});
        const defaultType =
          collectionName === "controls" ? "control" : "layout";
        const entryType = clonedLayout.type || defaultType;

        if (entryType === "folder") {
          resources[collectionName].items[resourceId] = {
            id: resourceId,
            ...clonedLayout,
            type: "folder",
            name: item?.name || `Folder ${resourceId}`,
            parentId,
            createdAt,
            updatedAt,
          };
          continue;
        }

        const repositoryElements = item?.elements || { items: {}, tree: [] };
        const elementItems = repositoryElements.items || {};
        const { parentById: elementParentById, orderedIds: elementOrderedIds } =
          buildHierarchyParentMap(getHierarchyNodes(repositoryElements));

        const elements = {};
        for (const [elementId, element] of Object.entries(elementItems)) {
          const elementParentId = elementParentById.has(elementId)
            ? elementParentById.get(elementId)
            : (element?.parentId ?? null);
          elements[elementId] = {
            id: elementId,
            ...cloneOr(element, {}),
            parentId: elementParentId,
            children: [],
          };
        }

        for (const id of elementOrderedIds) {
          const elementParentId = elementParentById.get(id) ?? null;
          if (!elementParentId) continue;
          if (!elements[elementParentId] || !elements[id]) continue;
          elements[elementParentId].children.push(id);
        }

        const rootElementOrder = appendMissingIds(
          elementOrderedIds.filter(
            (id) => (elementParentById.get(id) ?? null) === null,
          ),
          Object.keys(elements).filter((id) => {
            const elementParentId = elements[id]?.parentId ?? null;
            return !elementParentId || !elements[elementParentId];
          }),
        );

        resources[collectionName].items[resourceId] = {
          id: resourceId,
          ...clonedLayout,
          type: entryType,
          name:
            item?.name ||
            `${collectionName === "controls" ? "Control" : "Layout"} ${resourceId}`,
          ...(collectionName === "layouts"
            ? {
                layoutType: item?.layoutType || "general",
                isFragment: isFragmentLayout(item),
              }
            : {}),
          parentId,
          elements,
          rootElementOrder,
          createdAt,
          updatedAt,
        };
        continue;
      }

      resources[collectionName].items[resourceId] = {
        id: resourceId,
        ...cloneOr(normalizedItem, {}),
        ...(collectionName === "characters" && item?.type === "character"
          ? {
              sprites: projectRepositoryNestedCollectionToDomainCollection(
                item?.sprites,
              ),
            }
          : {}),
        parentId,
        createdAt,
        updatedAt,
      };
    }
  }

  return resources;
};

const projectRepositoryNestedCollectionToDomainCollection = (
  repositoryCollection = {},
) => {
  const repositoryItems = repositoryCollection.items || {};
  const { parentById, orderedIds } = buildHierarchyParentMap(
    getHierarchyNodes(repositoryCollection),
  );
  const allIds = Object.keys(repositoryItems);
  const fallbackParentById = new Map(
    Object.entries(repositoryItems).map(([itemId, item]) => [
      itemId,
      item?.parentId ?? null,
    ]),
  );

  const tree = buildTreeFromParentMap({
    orderedIds,
    allIds,
    parentById,
    fallbackParentById,
  });

  const items = {};
  for (const [itemId, item] of Object.entries(repositoryItems)) {
    const parentId = parentById.has(itemId)
      ? parentById.get(itemId)
      : (item?.parentId ?? null);
    items[itemId] = {
      id: itemId,
      ...cloneOr(item, {}),
      parentId,
    };
  }

  return {
    items,
    tree,
  };
};

export const projectRepositoryStateToDomainState = ({
  repositoryState,
  projectId = "unknown-project",
}) => {
  const state = createEmptyProjectState({
    projectId,
    name: repositoryState?.project?.name || "",
    description: repositoryState?.project?.description || "",
    timestamp: toFiniteTimestamp(
      repositoryState?.project?.createdAt,
      DEFAULT_TIMESTAMP,
    ),
  });

  if (!repositoryState || typeof repositoryState !== "object") {
    return state;
  }

  state.tags = projectRepositoryTagsToDomainTags(repositoryState?.tags);

  const sceneItems = repositoryState?.scenes?.items || {};
  const sceneHierarchy = getHierarchyNodes(repositoryState?.scenes);
  const { parentById: sceneParentById, orderedIds: sceneHierarchyOrder } =
    buildHierarchyParentMap(sceneHierarchy);

  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    if (!scene || typeof scene !== "object") continue;
    const sceneType = scene.type === "folder" ? "folder" : "scene";
    const parentId = sceneParentById.has(sceneId)
      ? sceneParentById.get(sceneId)
      : (scene?.parentId ?? null);

    if (sceneType === "folder") {
      state.scenes[sceneId] = {
        id: sceneId,
        type: "folder",
        name: scene.name || `Folder ${sceneId}`,
        sectionIds: [],
        initialSectionId: null,
        parentId,
        position: cloneOr(scene.position, { x: 200, y: 200 }),
        createdAt: toFiniteTimestamp(scene.createdAt, DEFAULT_TIMESTAMP),
        updatedAt: toFiniteTimestamp(
          scene.updatedAt,
          toFiniteTimestamp(scene.createdAt, DEFAULT_TIMESTAMP),
        ),
      };
      continue;
    }

    const sections = scene.sections || { items: {}, tree: [] };
    const sectionItems = sections.items || {};
    const sectionHierarchy = getHierarchyNodes(sections);
    const { orderedIds: sectionHierarchyOrder } =
      buildHierarchyParentMap(sectionHierarchy);
    const allSectionIds = Object.keys(sectionItems).filter(
      (sectionId) => sectionItems[sectionId]?.type !== "folder",
    );
    const sectionIds = appendMissingIds(
      sectionHierarchyOrder.filter(
        (sectionId) => sectionItems[sectionId]?.type !== "folder",
      ),
      allSectionIds,
    );
    const initialSectionId =
      sectionIds.includes(scene.initialSectionId) && scene.initialSectionId
        ? scene.initialSectionId
        : (sectionIds[0] ?? null);

    state.scenes[sceneId] = {
      id: sceneId,
      type: "scene",
      name: scene.name || `Scene ${sceneId}`,
      description: scene.description ?? "",
      sectionIds,
      initialSectionId,
      parentId,
      position: cloneOr(scene.position, { x: 200, y: 200 }),
      createdAt: toFiniteTimestamp(scene.createdAt, DEFAULT_TIMESTAMP),
      updatedAt: toFiniteTimestamp(
        scene.updatedAt,
        toFiniteTimestamp(scene.createdAt, DEFAULT_TIMESTAMP),
      ),
    };

    for (const [sectionId, section] of Object.entries(sectionItems)) {
      if (!section || section.type === "folder") continue;
      const lines = section.lines || { items: {}, tree: [] };
      const lineItems = lines.items || {};
      const lineHierarchy = getHierarchyNodes(lines);
      const { orderedIds: lineHierarchyOrder } =
        buildHierarchyParentMap(lineHierarchy);
      const lineIds = appendMissingIds(
        lineHierarchyOrder,
        Object.keys(lineItems),
      );
      const initialLineId =
        lineIds.includes(section.initialLineId) && section.initialLineId
          ? section.initialLineId
          : (lineIds[0] ?? null);

      state.sections[sectionId] = {
        id: sectionId,
        sceneId,
        name: section.name || `Section ${sectionId}`,
        lineIds,
        initialLineId,
        createdAt: toFiniteTimestamp(section.createdAt, DEFAULT_TIMESTAMP),
        updatedAt: toFiniteTimestamp(
          section.updatedAt,
          toFiniteTimestamp(section.createdAt, DEFAULT_TIMESTAMP),
        ),
      };

      for (const [lineId, line] of Object.entries(lineItems)) {
        state.lines[lineId] = {
          id: lineId,
          sectionId,
          actions: normalizeLineActions(line?.actions || {}),
          createdAt: toFiniteTimestamp(line?.createdAt, DEFAULT_TIMESTAMP),
          updatedAt: toFiniteTimestamp(
            line?.updatedAt,
            toFiniteTimestamp(line?.createdAt, DEFAULT_TIMESTAMP),
          ),
        };
      }
    }
  }

  const allSceneIds = Object.keys(state.scenes);
  const sceneOrder = appendMissingIds(sceneHierarchyOrder, allSceneIds).filter(
    (sceneId) => !!state.scenes[sceneId],
  );
  state.story.sceneOrder = sceneOrder;

  const initialSceneId = repositoryState?.story?.initialSceneId;
  const firstPlayableSceneId = sceneOrder.find(
    (sceneId) => state.scenes[sceneId]?.type !== "folder",
  );
  state.story.initialSceneId =
    (initialSceneId &&
      state.scenes[initialSceneId]?.type !== "folder" &&
      initialSceneId) ||
    firstPlayableSceneId ||
    null;

  Object.assign(state, projectRepositoryResources({ repositoryState }));
  state.project.createdAt = toFiniteTimestamp(
    repositoryState?.project?.createdAt,
    DEFAULT_TIMESTAMP,
  );
  state.project.updatedAt = toFiniteTimestamp(
    repositoryState?.project?.updatedAt,
    state.project.createdAt,
  );

  return state;
};

const pickResourceFields = (item, fields) => {
  return fields.reduce((result, fieldName) => {
    if (item?.[fieldName] !== undefined) {
      result[fieldName] = item[fieldName];
    }
    return result;
  }, {});
};

const constructImageResources = (
  repositoryImages = {},
  repositoryFiles = {},
) => {
  return Object.entries(repositoryImages).reduce((result, [imageId, item]) => {
    const normalizedItem = withResolvedResourceFileMetadata({
      item,
      files: repositoryFiles,
    });

    if (normalizedItem?.type && normalizedItem.type !== "image") {
      return result;
    }
    if (!normalizedItem?.fileId) {
      return result;
    }

    result[imageId] = pickResourceFields(normalizedItem, [
      "fileId",
      "thumbnailFileId",
      "fileType",
      "fileSize",
      "width",
      "height",
    ]);
    return result;
  }, {});
};

const constructSpritesheetResources = (
  repositorySpritesheets = {},
  repositoryFiles = {},
) => {
  return Object.entries(repositorySpritesheets).reduce(
    (result, [spritesheetId, item]) => {
      const normalizedItem = withResolvedResourceFileMetadata({
        item,
        files: repositoryFiles,
      });

      if (
        normalizedItem?.type !== "spritesheet" ||
        !normalizedItem.fileId ||
        !normalizedItem.jsonData
      ) {
        return result;
      }

      result[spritesheetId] = pickResourceFields(normalizedItem, [
        "fileId",
        "fileType",
        "fileSize",
        "jsonData",
        "width",
        "height",
        "animations",
      ]);
      return result;
    },
    {},
  );
};

const constructVideoResources = (
  repositoryVideos = {},
  repositoryFiles = {},
) => {
  return Object.entries(repositoryVideos).reduce((result, [videoId, item]) => {
    const normalizedItem = withResolvedResourceFileMetadata({
      item,
      files: repositoryFiles,
    });

    if (normalizedItem?.type !== "video" || !normalizedItem.fileId) {
      return result;
    }

    result[videoId] = pickResourceFields(normalizedItem, [
      "fileId",
      "fileType",
      "fileSize",
      "width",
      "height",
    ]);
    return result;
  }, {});
};

const constructSoundResources = (
  repositorySounds = {},
  repositoryFiles = {},
) => {
  return Object.entries(repositorySounds).reduce((result, [soundId, item]) => {
    const normalizedItem = withResolvedResourceFileMetadata({
      item,
      files: repositoryFiles,
    });

    if (normalizedItem?.type !== "sound" || !normalizedItem.fileId) {
      return result;
    }

    result[soundId] = pickResourceFields(normalizedItem, [
      "fileId",
      "fileType",
      "fileSize",
    ]);
    return result;
  }, {});
};

const constructAnimationResources = (
  repositoryAnimations = {},
  repositoryImages = {},
) => {
  return Object.entries(repositoryAnimations).reduce(
    (result, [animationId, item]) => {
      if (item?.type !== "animation" || !item.animation) {
        return result;
      }

      const animation = structuredClone(item.animation);

      if (animation?.type === "transition") {
        const compiledMask = compileTransitionMaskForRuntime(
          animation.mask,
          repositoryImages,
        );

        if (compiledMask) {
          animation.mask = compiledMask;
        } else {
          delete animation.mask;
        }
      }

      result[animationId] = animation;
      return result;
    },
    {},
  );
};

const constructCharacterResources = (repositoryCharacters = {}) => {
  return Object.entries(repositoryCharacters).reduce(
    (result, [characterId, character]) => {
      if (character?.type !== "character") {
        return result;
      }

      result[characterId] = {
        name: character.name,
        variables: {
          name: character.name || "Unnamed Character",
        },
      };
      return result;
    },
    {},
  );
};

const constructTransformResources = (repositoryTransforms = {}) => {
  return Object.entries(repositoryTransforms).reduce(
    (result, [transformId, transform]) => {
      if (transform?.type !== "transform") {
        return result;
      }

      result[transformId] = pickResourceFields(transform, [
        "x",
        "y",
        "anchorX",
        "anchorY",
        "scaleX",
        "scaleY",
        "rotation",
      ]);
      return result;
    },
    {},
  );
};

const constructParticleResources = (
  repositoryParticles = {},
  imageItems = {},
) => {
  return Object.entries(repositoryParticles).reduce(
    (result, [particleId, item]) => {
      if (item?.type !== "particle" || !item.modules) {
        return result;
      }

      const renderableParticle = createRenderableParticleData(item, imageItems);

      result[particleId] = pickResourceFields(renderableParticle, [
        "name",
        "description",
        "width",
        "height",
        "seed",
        "modules",
      ]);
      return result;
    },
    {},
  );
};

const extractCharacterImages = (
  repositoryCharacters = {},
  repositoryFiles = {},
) => {
  return Object.entries(repositoryCharacters).reduce(
    (result, [, character]) => {
      if (character?.type !== "character" || !character.sprites?.items) {
        return result;
      }

      Object.entries(character.sprites.items).forEach(([spriteId, sprite]) => {
        const normalizedSprite = withResolvedResourceFileMetadata({
          item: sprite,
          files: repositoryFiles,
        });

        if (!normalizedSprite?.fileId) {
          return;
        }

        result[spriteId] = pickResourceFields(normalizedSprite, [
          "fileId",
          "fileType",
          "fileSize",
          "width",
          "height",
        ]);
      });

      return result;
    },
    {},
  );
};

const constructLayoutResources = (
  repositoryLayouts = {},
  repositoryControls = {},
  imageItems = {},
  filesData = { items: {}, tree: [] },
  particlesData = { items: {}, tree: [] },
  spritesheetsData = { items: {}, tree: [] },
  textStylesData = { items: {}, tree: [] },
  colors = { items: {}, tree: [] },
  fonts = { items: {}, tree: [] },
) => {
  const baseLayoutResources = createLayoutReferenceResources(
    imageItems,
    textStylesData,
    colors,
    fonts,
    filesData,
  );
  const textStyles = {
    ...baseLayoutResources.textStyles,
  };
  const controls = {};
  const layouts = {};

  Object.entries(repositoryLayouts).forEach(([layoutId, layout]) => {
    if (layout?.type !== "layout") {
      return;
    }

    const { elements, resources } = buildLayoutElements(
      toHierarchyStructure(layout.elements),
      imageItems,
      textStylesData,
      colors,
      fonts,
      {
        layoutId,
        layoutType: layout.layoutType,
        filesData,
        particlesData,
        spritesheetsData,
        layoutsData: repositoryLayouts,
      },
    );

    Object.assign(textStyles, resources.textStyles);
    layouts[layoutId] = {
      id: layoutId,
      name: layout.name,
      layoutType: layout.layoutType,
      isFragment: isFragmentLayout(layout),
      elements,
      ...(Array.isArray(layout.transitions)
        ? { transitions: structuredClone(layout.transitions) }
        : {}),
    };
  });

  Object.entries(repositoryControls).forEach(([controlId, control]) => {
    if (control?.type !== "control") {
      return;
    }

    const { elements, resources } = buildLayoutElements(
      toHierarchyStructure(control.elements),
      imageItems,
      textStylesData,
      colors,
      fonts,
      {
        layoutId: controlId,
        filesData,
        particlesData,
        spritesheetsData,
        layoutsData: repositoryLayouts,
      },
    );

    Object.assign(textStyles, resources.textStyles);
    controls[controlId] = {
      id: controlId,
      name: control.name,
      keyboard: toRouteEngineKeyboardResource(control.keyboard),
      elements,
    };
  });

  return {
    resources: {
      images: baseLayoutResources.images,
      colors: baseLayoutResources.colors,
      fonts: baseLayoutResources.fonts,
      textStyles,
      controls,
    },
    layouts,
  };
};

const constructProjectResources = (repositoryState = {}) => {
  const repositoryImages = repositoryState.images?.items || {};
  const repositoryFiles = repositoryState.files?.items || {};
  const repositorySpritesheets = repositoryState.spritesheets?.items || {};
  const repositoryVideos = repositoryState.videos?.items || {};
  const repositorySounds = repositoryState.sounds?.items || {};
  const repositoryAnimations = repositoryState.animations?.items || {};
  const repositoryCharacters = repositoryState.characters?.items || {};
  const repositoryTransforms = repositoryState.transforms?.items || {};
  const repositoryParticles = repositoryState.particles?.items || {};
  const repositoryLayouts = repositoryState.layouts?.items || {};
  const repositoryControls = repositoryState.controls?.items || {};
  const textStylesData = repositoryState.textStyles || { items: {}, tree: [] };
  const colors = repositoryState.colors || { items: {}, tree: [] };
  const fonts = repositoryState.fonts || { items: {}, tree: [] };
  const variables = Object.fromEntries(
    Object.entries(repositoryState.variables?.items || {}).filter(
      ([, item]) => item.type !== "folder",
    ),
  );

  const characterImages = extractCharacterImages(
    repositoryCharacters,
    repositoryFiles,
  );
  const imageResources = constructImageResources(
    repositoryImages,
    repositoryFiles,
  );
  const imageItems = {
    ...imageResources,
    ...characterImages,
  };
  const spritesheetsData = repositoryState.spritesheets || {
    items: {},
    tree: [],
  };
  const particlesData = repositoryState.particles || {
    items: {},
    tree: [],
  };
  const { resources: layoutResources, layouts } = constructLayoutResources(
    repositoryLayouts,
    repositoryControls,
    imageItems,
    repositoryState.files || { items: {}, tree: [] },
    particlesData,
    spritesheetsData,
    textStylesData,
    colors,
    fonts,
  );

  return {
    images: layoutResources.images,
    spritesheets: constructSpritesheetResources(
      repositorySpritesheets,
      repositoryFiles,
    ),
    videos: constructVideoResources(repositoryVideos, repositoryFiles),
    sounds: constructSoundResources(repositorySounds, repositoryFiles),
    particles: constructParticleResources(repositoryParticles, imageResources),
    fonts: layoutResources.fonts,
    colors: layoutResources.colors,
    textStyles: layoutResources.textStyles,
    controls: layoutResources.controls,
    transforms: constructTransformResources(repositoryTransforms),
    characters: constructCharacterResources(repositoryCharacters),
    layouts,
    animations: constructAnimationResources(
      repositoryAnimations,
      repositoryImages,
    ),
    variables,
  };
};

const constructStory = (scenes) => {
  const transformedScenes = {};

  if (!scenes?.items) {
    return transformedScenes;
  }

  Object.entries(scenes.items).forEach(([sceneId, scene]) => {
    if (scene.type !== "scene") {
      return;
    }

    let firstSectionId;
    if (scene.sections?.tree && scene.sections.tree.length > 0) {
      const firstSection = scene.sections.tree[0];
      firstSectionId =
        typeof firstSection === "string" ? firstSection : firstSection.id;
    }

    const transformedScene = {
      name: scene.name,
      initialSectionId: firstSectionId,
      sections: {},
    };

    if (scene.sections?.items) {
      Object.entries(scene.sections.items).forEach(([sectionId, section]) => {
        const transformedSection = {
          name: section.name || "Unnamed Section",
          lines: [],
        };

        if (section.lines?.tree && section.lines?.items) {
          section.lines.tree.forEach((lineNode) => {
            const lineId =
              typeof lineNode === "string" ? lineNode : lineNode.id;
            const line = section.lines.items[lineId];
            if (!line) {
              return;
            }

            transformedSection.lines.push({
              id: lineId,
              actions: normalizeLineActions(line.actions || {}),
            });
          });
        }

        transformedScene.sections[sectionId] = transformedSection;
      });
    }

    transformedScenes[sceneId] = transformedScene;
  });

  return transformedScenes;
};

const alignDialogueModesWithLayouts = (story, layouts = {}) => {
  const scenes = isObjectRecord(story?.scenes) ? story.scenes : {};

  Object.values(scenes).forEach((scene) => {
    const sections = isObjectRecord(scene?.sections) ? scene.sections : {};

    Object.values(sections).forEach((section) => {
      const lines = Array.isArray(section?.lines) ? section.lines : [];

      lines.forEach((line) => {
        const dialogue = line?.actions?.dialogue;
        const layoutId = dialogue?.ui?.resourceId;
        const layoutType = layouts?.[layoutId]?.layoutType;

        if (layoutType === "dialogue-nvl") {
          dialogue.mode = "nvl";
        }
      });
    });
  });
};

export function constructProjectData(state, options = {}) {
  const screenResolution = requireProjectResolution(
    state?.project?.resolution,
    "Repository project resolution",
  );
  const resources = constructProjectResources(state);
  const story = {
    initialSceneId: options.initialSceneId || state.story?.initialSceneId,
    scenes: constructStory(state.scenes),
  };

  alignDialogueModesWithLayouts(story, resources.layouts);

  return {
    screen: {
      width: screenResolution.width,
      height: screenResolution.height,
      backgroundColor: "#000000",
    },
    resources,
    story,
  };
}

const createTransitionKey = (transition) => {
  if (!transition) {
    return null;
  }

  const sceneId = transition.sceneId || "";
  const sectionId = transition.sectionId || "";

  if (!sceneId && !sectionId) {
    return null;
  }

  return `${sceneId}::${sectionId}`;
};

const getTransitionsFromLayout = (layout) => {
  if (!layout?.elements?.items) {
    return [];
  }

  return Object.values(layout.elements.items)
    .flatMap((element) => [
      getInteractionActions(element?.click).sectionTransition,
      getInteractionActions(element?.rightClick).sectionTransition,
    ])
    .filter(Boolean);
};

const resolveLayoutReference = ({ ref, layouts, controls }) => {
  if (!ref?.resourceId) {
    return undefined;
  }

  if (ref.resourceType === "control") {
    return controls?.items?.[ref.resourceId];
  }

  if (ref.resourceType === "layout") {
    return layouts?.items?.[ref.resourceId];
  }

  return layouts?.items?.[ref.resourceId] || controls?.items?.[ref.resourceId];
};

const toSectionLines = (section) => {
  if (Array.isArray(section?.lines)) {
    return section.lines;
  }

  if (!section?.lines) {
    return [];
  }

  return toFlatItems(section.lines);
};

export const getSectionPresentation = ({
  section,
  initialSectionId,
  layouts,
  controls,
  menuSceneId,
}) => {
  const lines = toSectionLines(section);
  const transitions = new Set();

  let choiceCount = 0;
  let hasMenuReturnAction = false;
  let returnsToMenuScene = false;

  lines.forEach((line) => {
    const lineActions = normalizeLineActions(line.actions || {});
    const pushOverlay = lineActions?.pushOverlay;
    const popOverlay = lineActions?.popOverlay;
    if (pushOverlay || popOverlay) {
      hasMenuReturnAction = true;
    }

    const sectionTransition = lineActions?.sectionTransition;
    if (menuSceneId && sectionTransition?.sceneId === menuSceneId) {
      returnsToMenuScene = true;
    }
    const sectionTransitionKey = createTransitionKey(sectionTransition);
    if (sectionTransitionKey) {
      transitions.add(sectionTransitionKey);
    }

    const choice = lineActions?.choice;
    const choiceItems = Array.isArray(choice?.items) ? choice.items : [];
    choiceCount += choiceItems.length;

    choiceItems.forEach((choiceItem) => {
      const choiceTransition =
        choiceItem.events?.click?.actions?.sectionTransition;
      if (menuSceneId && choiceTransition?.sceneId === menuSceneId) {
        returnsToMenuScene = true;
      }
      const choiceTransitionKey = createTransitionKey(choiceTransition);
      if (choiceTransitionKey) {
        transitions.add(choiceTransitionKey);
      }
    });

    const layoutRefs = [lineActions?.background, lineActions?.control].filter(
      (ref) => ref?.resourceId,
    );

    layoutRefs.forEach((layoutRef) => {
      const layout = resolveLayoutReference({
        ref: layoutRef,
        layouts,
        controls,
      });
      const layoutTransitions = getTransitionsFromLayout(layout);

      layoutTransitions.forEach((layoutTransition) => {
        if (menuSceneId && layoutTransition?.sceneId === menuSceneId) {
          returnsToMenuScene = true;
        }
        const layoutTransitionKey = createTransitionKey(layoutTransition);
        if (layoutTransitionKey) {
          transitions.add(layoutTransitionKey);
        }
      });
    });
  });

  const outgoingCount = transitions.size;
  const isMenuReturn = hasMenuReturnAction || returnsToMenuScene;

  return {
    lineCount: lines.length,
    choiceCount,
    outgoingCount,
    isMenuReturn,
    isDeadEnd: outgoingCount === 0 && !isMenuReturn,
    isInitial: section.id === initialSectionId,
  };
};

export const getVariableOptions = (variablesData, options = {}) => {
  const { type, showType = false } = options;
  const variablesItems = variablesData?.items || {};
  const variableEntries = Object.entries(variablesItems);

  return variableEntries
    .filter(([_, item]) => {
      if (item.type === "folder") {
        return false;
      }
      if (type && item.type !== type) {
        return false;
      }
      return true;
    })
    .map(([id, variable]) => {
      const varType = (variable.type || "string").toLowerCase();
      return {
        label: showType ? `${variable.name} (${varType})` : variable.name,
        value: id,
      };
    });
};

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
  "variableId",
];

const LAYOUT_RESOURCE_KEYS = [
  "resourceId",
  "layoutId",
  "fragmentLayoutId",
  "particleId",
  "sceneId",
  "sectionId",
  "variableId",
  "imageId",
  "hoverImageId",
  "clickImageId",
  "thumbImageId",
  "barImageId",
  "hoverThumbImageId",
  "hoverBarImageId",
  "textStyleId",
  "hoverTextStyleId",
  "clickTextStyleId",
  "fontFileId",
];

const TEXT_STYLE_RESOURCE_KEYS = ["colorId", "strokeColorId", "fontId"];

const EXPORT_RESOURCE_KEYS = new Set([
  ...SCENE_RESOURCE_KEYS,
  ...LAYOUT_RESOURCE_KEYS,
  ...TEXT_STYLE_RESOURCE_KEYS,
]);

const RESOURCE_KEY_TO_TYPES = {
  resourceId: [
    "controls",
    "layouts",
    "images",
    "spritesheets",
    "videos",
    "sounds",
    "particles",
    "animations",
    "transforms",
    "characters",
    "textStyles",
    "colors",
    "fonts",
    "variables",
    "sprites",
  ],
  transformId: ["transforms"],
  characterId: ["characters"],
  animation: ["animations"],
  layoutId: ["layouts"],
  fragmentLayoutId: ["layouts"],
  bgmId: ["sounds"],
  sfxId: ["sounds"],
  variableId: ["variables"],
  imageId: ["images"],
  hoverImageId: ["images"],
  clickImageId: ["images"],
  particleId: ["particles"],
  thumbImageId: ["images"],
  barImageId: ["images"],
  hoverThumbImageId: ["images"],
  hoverBarImageId: ["images"],
  textStyleId: ["textStyles"],
  hoverTextStyleId: ["textStyles"],
  clickTextStyleId: ["textStyles"],
  colorId: ["colors"],
  strokeColorId: ["colors"],
  fontId: ["fonts"],
  fontFileId: ["fonts"],
};

const COLLECTION_DEFS = {
  images: { collection: "images", itemType: "image" },
  spritesheets: { collection: "spritesheets", itemType: "spritesheet" },
  videos: { collection: "videos", itemType: "video" },
  sounds: { collection: "sounds", itemType: "sound" },
  particles: { collection: "particles", itemType: "particle" },
  animations: { collection: "animations", itemType: "animation" },
  transforms: { collection: "transforms", itemType: "transform" },
  characters: { collection: "characters", itemType: "character" },
  fonts: { collection: "fonts", itemType: "font" },
  colors: { collection: "colors", itemType: "color" },
  textStyles: { collection: "textStyles", itemType: "textStyle" },
  layouts: { collection: "layouts", itemType: "layout" },
  controls: { collection: "controls", itemType: "control" },
  variables: { collection: "variables", itemType: null },
  sprites: { collection: null, itemType: "sprite" },
};

const RESOURCE_KEYS_MAP = {
  scenes: SCENE_RESOURCE_KEYS,
  layouts: LAYOUT_RESOURCE_KEYS,
  controls: LAYOUT_RESOURCE_KEYS,
  textStyles: TEXT_STYLE_RESOURCE_KEYS,
};

const createUsageBuckets = () =>
  Object.keys(COLLECTION_DEFS).reduce((acc, key) => {
    acc[key] = new Set();
    return acc;
  }, {});

const getCollectionItems = (state, collectionName) => {
  return state?.[collectionName]?.items || {};
};

const toSetMap = () =>
  Object.keys(COLLECTION_DEFS).reduce((acc, key) => {
    acc[key] = new Set();
    return acc;
  }, {});

const addTypeIndex = (map, id, type) => {
  if (!id) return;
  if (!map.has(id)) {
    map.set(id, new Set());
  }
  map.get(id).add(type);
};

const createResourceIndex = (state) => {
  const byId = new Map();
  const byType = toSetMap();
  const spriteOwnerById = new Map();
  const spriteFileById = new Map();

  for (const [resourceType, def] of Object.entries(COLLECTION_DEFS)) {
    if (!def.collection || resourceType === "sprites") continue;
    const items = getCollectionItems(state, def.collection);

    for (const [id, item] of Object.entries(items)) {
      if (!item) continue;

      if (resourceType === "variables") {
        if (item.type === "folder") continue;
        byType.variables.add(id);
        addTypeIndex(byId, id, "variables");
        continue;
      }

      if (item.type !== def.itemType) continue;
      byType[resourceType].add(id);
      addTypeIndex(byId, id, resourceType);
    }
  }

  const characterItems = getCollectionItems(state, "characters");
  for (const [characterId, character] of Object.entries(characterItems)) {
    if (!character || character.type !== "character") continue;
    const sprites = character.sprites?.items || {};
    for (const [spriteId, sprite] of Object.entries(sprites)) {
      byType.sprites.add(spriteId);
      addTypeIndex(byId, spriteId, "sprites");
      spriteOwnerById.set(spriteId, characterId);
      if (sprite?.fileId) {
        spriteFileById.set(spriteId, sprite.fileId);
      }
    }
  }

  return {
    byId,
    byType,
    spriteOwnerById,
    spriteFileById,
  };
};

const scanNodeForResourceReferences = (node, onReference) => {
  if (!node || typeof node !== "object") return;

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string" && EXPORT_RESOURCE_KEYS.has(key)) {
      onReference({ key, value });
    }

    if (value && typeof value === "object") {
      scanNodeForResourceReferences(value, onReference);
    }
  }
};

const scanNodeForTransitionEntries = (node, onTransition) => {
  if (!node || typeof node !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (
      (key === "sectionTransition" || key === "resetStoryAtSection") &&
      value &&
      typeof value === "object"
    ) {
      onTransition(value);
    }

    if (value && typeof value === "object") {
      scanNodeForTransitionEntries(value, onTransition);
    }
  }
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
      checkNode(value, resourceId, keys, usages);
    }
  }
};

const filterTreeNodesByIds = (nodes, keepIds) => {
  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes.reduce((result, node) => {
    if (!node || typeof node.id !== "string") {
      return result;
    }

    const children = filterTreeNodesByIds(node.children, keepIds);
    if (!keepIds.has(node.id) && children.length === 0) {
      return result;
    }

    if (children.length > 0) {
      result.push({
        ...node,
        children,
      });
      return result;
    }

    const nextNode = {
      ...node,
    };
    delete nextNode.children;
    result.push(nextNode);
    return result;
  }, []);
};

const collectTreeNodeIds = (nodes, ids) => {
  if (!Array.isArray(nodes)) {
    return;
  }

  nodes.forEach((node) => {
    if (!node || typeof node.id !== "string") {
      return;
    }

    ids.add(node.id);
    collectTreeNodeIds(node.children, ids);
  });
};

const filterCollectionItemsByIds = (collectionState, ids) => {
  if (!collectionState) return collectionState;
  const items = collectionState.items || {};
  const keepIds = new Set(Array.from(ids || []).filter(Boolean));
  const filteredTree = filterTreeNodesByIds(
    getHierarchyNodes(collectionState),
    keepIds,
  );
  const finalIds = new Set(keepIds);
  const treeIds = new Set();

  collectTreeNodeIds(filteredTree, treeIds);
  treeIds.forEach((id) => {
    finalIds.add(id);
  });

  const filteredItems = {};

  for (const id of finalIds) {
    const item = items[id];
    if (item) {
      filteredItems[id] = item;
    }
  }

  const nextTree = [...filteredTree];
  for (const id of finalIds) {
    if (!items[id] || treeIds.has(id)) {
      continue;
    }
    nextTree.push({ id });
  }

  return {
    ...collectionState,
    items: filteredItems,
    tree: nextTree,
  };
};

const getPlayableSceneIdsForExport = (state) => {
  const sceneItems = getCollectionItems(state, "scenes");
  const orderedSceneIds = [];

  walkHierarchy(getHierarchyNodes(state?.scenes), null, (node) => {
    orderedSceneIds.push(node.id);
  });

  return appendMissingIds(orderedSceneIds, Object.keys(sceneItems)).filter(
    (sceneId) => sceneItems[sceneId]?.type === "scene",
  );
};

const getPlayableSectionIdsForExport = (scene) => {
  const sectionItems = scene?.sections?.items || {};
  const orderedSectionIds = [];

  walkHierarchy(getHierarchyNodes(scene?.sections), null, (node) => {
    orderedSectionIds.push(node.id);
  });

  return appendMissingIds(orderedSectionIds, Object.keys(sectionItems)).filter(
    (sectionId) => sectionItems[sectionId]?.type !== "folder",
  );
};

const getLineIdsForExport = (section) => {
  const lineItems = section?.lines?.items || {};
  const orderedLineIds = [];

  walkHierarchy(getHierarchyNodes(section?.lines), null, (node) => {
    orderedLineIds.push(node.id);
  });

  return appendMissingIds(orderedLineIds, Object.keys(lineItems));
};

const resolveExportInitialSceneId = (state) => {
  const sceneItems = getCollectionItems(state, "scenes");
  const initialSceneId = state?.story?.initialSceneId;

  if (sceneItems[initialSceneId]?.type === "scene") {
    return initialSceneId;
  }

  return getPlayableSceneIdsForExport(state)[0];
};

const resolveExportInitialSectionId = (scene) => {
  const sectionIds = getPlayableSectionIdsForExport(scene);
  if (sectionIds.length === 0) {
    return undefined;
  }

  if (sectionIds.includes(scene?.initialSectionId)) {
    return scene.initialSectionId;
  }

  return sectionIds[0];
};

const getReachableLineIdsForSection = (section) => {
  const lineIds = getLineIdsForExport(section);
  if (lineIds.length === 0) {
    return [];
  }

  const startIndex = lineIds.includes(section?.initialLineId)
    ? lineIds.indexOf(section.initialLineId)
    : 0;

  return lineIds.slice(startIndex >= 0 ? startIndex : 0);
};

const createSceneIdBySectionIdIndex = (state) => {
  const sectionSceneIdBySectionId = new Map();
  const sceneItems = getCollectionItems(state, "scenes");

  Object.entries(sceneItems).forEach(([sceneId, scene]) => {
    if (!scene || scene.type !== "scene") {
      return;
    }

    Object.entries(scene.sections?.items || {}).forEach(
      ([sectionId, section]) => {
        if (section?.type === "folder") {
          return;
        }

        sectionSceneIdBySectionId.set(sectionId, sceneId);
      },
    );
  });

  return sectionSceneIdBySectionId;
};

const filterScenesForExport = (scenesState, storyUsage = {}) => {
  if (!scenesState) {
    return scenesState;
  }

  const sceneIds = new Set(storyUsage.sceneIds || []);
  const sectionIds = storyUsage.sectionIds || [];
  const lineIds = storyUsage.lineIds || [];
  const filteredScenes = filterCollectionItemsByIds(scenesState, sceneIds);
  const filteredSceneItems = {};

  Object.entries(filteredScenes.items || {}).forEach(([sceneId, scene]) => {
    if (!scene || scene.type === "folder") {
      filteredSceneItems[sceneId] = scene;
      return;
    }

    if (!sceneIds.has(sceneId)) {
      return;
    }

    const filteredSections = filterCollectionItemsByIds(
      scene.sections,
      sectionIds,
    );
    const filteredSectionItems = {};

    Object.entries(filteredSections.items || {}).forEach(
      ([sectionId, section]) => {
        if (!section || section.type === "folder") {
          filteredSectionItems[sectionId] = section;
          return;
        }

        filteredSectionItems[sectionId] = {
          ...section,
          lines: filterCollectionItemsByIds(section.lines, lineIds),
        };
      },
    );

    filteredSceneItems[sceneId] = {
      ...scene,
      sections: {
        ...filteredSections,
        items: filteredSectionItems,
      },
    };
  });

  return {
    ...filteredScenes,
    items: filteredSceneItems,
  };
};

const createExportUsageCollector = (state) => {
  const usage = createUsageBuckets();
  const index = createResourceIndex(state);
  const layoutQueue = [];
  const controlQueue = [];
  const particleQueue = [];
  const textStyleQueue = [];
  const characterQueue = [];
  const animationQueue = [];
  const scannedLayouts = new Set();
  const scannedControls = new Set();
  const scannedParticles = new Set();
  const scannedTextStyles = new Set();
  const scannedCharacters = new Set();
  const scannedAnimations = new Set();

  const addUsed = (type, id) => {
    if (!usage[type] || !id) {
      return false;
    }

    if (usage[type].has(id)) {
      return false;
    }

    usage[type].add(id);

    if (type === "layouts") {
      layoutQueue.push(id);
    } else if (type === "controls") {
      controlQueue.push(id);
    } else if (type === "particles") {
      particleQueue.push(id);
    } else if (type === "textStyles") {
      textStyleQueue.push(id);
    } else if (type === "characters") {
      characterQueue.push(id);
    } else if (type === "animations") {
      animationQueue.push(id);
    } else if (type === "sprites") {
      const ownerId = index.spriteOwnerById.get(id);
      if (ownerId) {
        addUsed("characters", ownerId);
      }
    }

    return true;
  };

  const markReference = ({ key, value }) => {
    const preferredTypes = RESOURCE_KEY_TO_TYPES[key] || [];
    let matchedPreferredType = false;

    for (const type of preferredTypes) {
      if (index.byType[type]?.has(value)) {
        addUsed(type, value);
        matchedPreferredType = true;
      }
    }

    if (matchedPreferredType) {
      return;
    }

    const candidateTypes = index.byId.get(value);
    if (!candidateTypes) {
      return;
    }

    for (const type of candidateTypes) {
      addUsed(type, value);
    }
  };

  const collectFromNode = (node) => {
    scanNodeForResourceReferences(node, markReference);
  };

  const finalize = () => {
    const imageItems = getCollectionItems(state, "images");

    while (layoutQueue.length > 0) {
      const layoutId = layoutQueue.shift();
      if (scannedLayouts.has(layoutId)) continue;
      scannedLayouts.add(layoutId);
      const layout = getCollectionItems(state, "layouts")[layoutId];
      if (!layout || layout.type !== "layout") continue;
      collectFromNode(layout);
    }

    while (controlQueue.length > 0) {
      const controlId = controlQueue.shift();
      if (scannedControls.has(controlId)) continue;
      scannedControls.add(controlId);
      const control = getCollectionItems(state, "controls")[controlId];
      if (!control || control.type !== "control") continue;
      collectFromNode(control);
    }

    while (particleQueue.length > 0) {
      const particleId = particleQueue.shift();
      if (scannedParticles.has(particleId)) continue;
      scannedParticles.add(particleId);

      const particle = getCollectionItems(state, "particles")[particleId];
      if (!particle || particle.type !== "particle") continue;

      collectParticleTextureImageIds(particle, imageItems).forEach(
        (imageId) => {
          addUsed("images", imageId);
        },
      );
    }

    while (textStyleQueue.length > 0) {
      const textStyleId = textStyleQueue.shift();
      if (scannedTextStyles.has(textStyleId)) continue;
      scannedTextStyles.add(textStyleId);
      const textStyle = getCollectionItems(state, "textStyles")[textStyleId];
      if (!textStyle || textStyle.type !== "textStyle") continue;
      collectFromNode(textStyle);
    }

    while (characterQueue.length > 0) {
      const characterId = characterQueue.shift();
      if (scannedCharacters.has(characterId)) continue;
      scannedCharacters.add(characterId);

      const character = getCollectionItems(state, "characters")[characterId];
      if (!character || character.type !== "character") continue;

      for (const spriteId of Object.keys(character.sprites?.items || {})) {
        addUsed("sprites", spriteId);
      }
    }

    while (animationQueue.length > 0) {
      const animationId = animationQueue.shift();
      if (scannedAnimations.has(animationId)) continue;
      scannedAnimations.add(animationId);

      const animation = getCollectionItems(state, "animations")[animationId];
      if (!animation || animation.type !== "animation") continue;

      collectFromNode(animation.animation);

      collectTransitionMaskImageIds(
        animation.animation?.mask,
        getCollectionItems(state, "images"),
      ).forEach((imageId) => {
        addUsed("images", imageId);
      });
    }

    const fileIds = new Set();
    const addFileId = (fileId) => {
      if (fileId) {
        fileIds.add(fileId);
      }
    };

    for (const id of usage.images) {
      addFileId(imageItems[id]?.fileId);
    }

    const spritesheetItems = getCollectionItems(state, "spritesheets");
    for (const id of usage.spritesheets) {
      addFileId(spritesheetItems[id]?.fileId);
    }

    const videoItems = getCollectionItems(state, "videos");
    for (const id of usage.videos) {
      addFileId(videoItems[id]?.fileId);
    }

    const soundItems = getCollectionItems(state, "sounds");
    for (const id of usage.sounds) {
      addFileId(soundItems[id]?.fileId);
    }

    const fontItems = getCollectionItems(state, "fonts");
    for (const id of usage.fonts) {
      addFileId(fontItems[id]?.fileId);
    }

    for (const spriteId of usage.sprites) {
      addFileId(index.spriteFileById.get(spriteId));
    }

    const usedIds = Object.fromEntries(
      Object.entries(usage).map(([type, idSet]) => [type, Array.from(idSet)]),
    );

    return {
      usedIds,
      resources: usedIds,
      fileIds: Array.from(fileIds),
    };
  };

  return {
    index,
    collectFromNode,
    finalize,
  };
};

export const compileExportReachability = (state) => {
  const sceneItems = getCollectionItems(state, "scenes");
  const sectionSceneIdBySectionId = createSceneIdBySectionIdIndex(state);
  const { index, collectFromNode, finalize } =
    createExportUsageCollector(state);
  const pendingSections = [];
  const queuedSections = new Set();
  const pendingLayouts = [];
  const pendingControls = [];
  const queuedLayouts = new Set();
  const queuedControls = new Set();
  const scannedLayouts = new Set();
  const scannedControls = new Set();
  const sceneIds = new Set();
  const sectionIds = new Set();
  const lineIds = new Set();
  const initialSceneId = resolveExportInitialSceneId(state) ?? null;

  const queueLayoutOrControl = (type, id) => {
    if (!id) {
      return;
    }

    if (type === "layouts") {
      if (queuedLayouts.has(id)) {
        return;
      }
      queuedLayouts.add(id);
      pendingLayouts.push(id);
      return;
    }

    if (type === "controls") {
      if (queuedControls.has(id)) {
        return;
      }
      queuedControls.add(id);
      pendingControls.push(id);
    }
  };

  const queueLayoutAndControlReferencesFromNode = (node) => {
    scanNodeForResourceReferences(node, ({ key, value }) => {
      const preferredTypes = RESOURCE_KEY_TO_TYPES[key] || [];
      let matchedPreferredType = false;

      preferredTypes.forEach((type) => {
        if (
          (type === "layouts" || type === "controls") &&
          index.byType[type]?.has(value)
        ) {
          matchedPreferredType = true;
          queueLayoutOrControl(type, value);
        }
      });

      if (matchedPreferredType) {
        return;
      }

      const candidateTypes = index.byId.get(value);
      if (!candidateTypes) {
        return;
      }

      candidateTypes.forEach((type) => {
        if (type === "layouts" || type === "controls") {
          queueLayoutOrControl(type, value);
        }
      });
    });
  };

  const queueReachableSection = ({ sceneId, sectionId } = {}) => {
    if (!sceneId || sceneItems[sceneId]?.type !== "scene") {
      return;
    }

    sceneIds.add(sceneId);
    const scene = sceneItems[sceneId];
    const nextSectionId =
      scene.sections?.items?.[sectionId]?.type !== "folder" && sectionId
        ? sectionId
        : resolveExportInitialSectionId(scene);

    if (!nextSectionId) {
      return;
    }

    const queueKey = `${sceneId}::${nextSectionId}`;
    if (queuedSections.has(queueKey)) {
      return;
    }

    queuedSections.add(queueKey);
    pendingSections.push({
      sceneId,
      sectionId: nextSectionId,
    });
  };

  const queueTransitionTarget = (entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    const sceneId =
      sceneItems[entry.sceneId]?.type === "scene"
        ? entry.sceneId
        : sectionSceneIdBySectionId.get(entry.sectionId);

    if (!sceneId) {
      return;
    }

    queueReachableSection({
      sceneId,
      sectionId: entry.sectionId,
    });
  };

  const scanTransitionsFromNode = (node) => {
    scanNodeForTransitionEntries(node, queueTransitionTarget);
    queueLayoutAndControlReferencesFromNode(node);
  };

  if (initialSceneId) {
    queueReachableSection({ sceneId: initialSceneId });
  }

  while (
    pendingSections.length > 0 ||
    pendingLayouts.length > 0 ||
    pendingControls.length > 0
  ) {
    while (pendingSections.length > 0) {
      const current = pendingSections.shift();
      const scene = sceneItems[current?.sceneId];
      const section = scene?.sections?.items?.[current?.sectionId];
      if (!scene || !section || section.type === "folder") {
        continue;
      }

      sceneIds.add(current.sceneId);
      sectionIds.add(current.sectionId);

      getReachableLineIdsForSection(section).forEach((lineId) => {
        const line = section.lines?.items?.[lineId];
        if (!line) {
          return;
        }

        lineIds.add(lineId);
        scanTransitionsFromNode(line.actions || {});
      });
    }

    while (pendingLayouts.length > 0) {
      const layoutId = pendingLayouts.shift();
      if (scannedLayouts.has(layoutId)) {
        continue;
      }

      scannedLayouts.add(layoutId);
      const layout = getCollectionItems(state, "layouts")[layoutId];
      if (!layout || layout.type !== "layout") {
        continue;
      }

      scanTransitionsFromNode(layout);
    }

    while (pendingControls.length > 0) {
      const controlId = pendingControls.shift();
      if (scannedControls.has(controlId)) {
        continue;
      }

      scannedControls.add(controlId);
      const control = getCollectionItems(state, "controls")[controlId];
      if (!control || control.type !== "control") {
        continue;
      }

      scanTransitionsFromNode(control);
    }
  }

  const reachableStory = {
    initialSceneId,
    sceneIds: Array.from(sceneIds),
    sectionIds: Array.from(sectionIds),
    lineIds: Array.from(lineIds),
  };

  collectFromNode(filterScenesForExport(state.scenes, reachableStory));

  return {
    story: reachableStory,
    ...finalize(),
  };
};

export const recursivelyCheckResource = ({ state, itemId, checkTargets }) => {
  const inProps = {};
  const referencedAnimationIds = new Set();
  const referencedParticleIds = new Set();

  for (const targetName of checkTargets) {
    const keys = RESOURCE_KEYS_MAP[targetName];
    if (!keys) continue;

    const targetData =
      targetName === "scenes"
        ? [
            ["scenes", state.scenes],
            ["sections", state.sections],
            ["lines", state.lines],
          ]
        : [[targetName, state[targetName]]];

    for (const [usageTargetName, data] of targetData) {
      if (!data) continue;
      const usages = [];
      checkNode(data, itemId, keys, usages);

      if (usages.length > 0) {
        inProps[usageTargetName] = usages;
      }

      scanNodeForResourceReferences(data, ({ key, value }) => {
        if (key === "animation" && typeof value === "string") {
          referencedAnimationIds.add(value);
        }

        if (key === "particleId" && typeof value === "string") {
          referencedParticleIds.add(value);
        }
      });
    }
  }

  if (referencedAnimationIds.size > 0) {
    const animationItems = state.animations?.items ?? {};
    const imageItems = state.images?.items ?? {};

    referencedAnimationIds.forEach((animationId) => {
      const animationItem = animationItems[animationId];
      if (!animationItem?.animation) {
        return;
      }

      const animationUsages = [];
      checkNode(animationItem.animation, itemId, ["imageId"], animationUsages);

      if (
        animationUsages.length === 0 &&
        collectTransitionMaskImageIds(
          animationItem.animation.mask,
          imageItems,
        ).includes(itemId)
      ) {
        animationUsages.push({
          property: "mask",
        });
      }

      if (animationUsages.length > 0) {
        const existingAnimationUsages = inProps.animations ?? [];
        inProps.animations = existingAnimationUsages.concat(animationUsages);
      }
    });
  }

  if (referencedParticleIds.size > 0) {
    const particleItems = state.particles?.items ?? {};
    const imageItems = state.images?.items ?? {};

    referencedParticleIds.forEach((particleId) => {
      const particleItem = particleItems[particleId];
      if (particleItem?.type !== "particle") {
        return;
      }

      if (
        !collectParticleTextureImageIds(particleItem, imageItems).includes(
          itemId,
        )
      ) {
        return;
      }

      const existingParticleUsages = inProps.particles ?? [];
      existingParticleUsages.push({
        property: "modules.appearance.texture",
      });
      inProps.particles = existingParticleUsages;
    });
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

export const collectUsedResourcesForExport = (state) => {
  return compileExportReachability(state);
};

export const buildFilteredStateForExport = (
  state,
  usage,
  options = { keepAllVariables: true },
) => {
  const usedIds = usage?.usedIds || usage?.resources || {};
  const story = usage?.story || {};
  const keepAllVariables = options?.keepAllVariables ?? true;

  return {
    ...state,
    story: {
      ...state.story,
      initialSceneId: story.initialSceneId ?? state.story?.initialSceneId,
    },
    scenes: filterScenesForExport(state.scenes, story),
    images: filterCollectionItemsByIds(state.images, usedIds.images || []),
    spritesheets: filterCollectionItemsByIds(
      state.spritesheets,
      usedIds.spritesheets || [],
    ),
    videos: filterCollectionItemsByIds(state.videos, usedIds.videos || []),
    sounds: filterCollectionItemsByIds(state.sounds, usedIds.sounds || []),
    particles: filterCollectionItemsByIds(
      state.particles,
      usedIds.particles || [],
    ),
    animations: filterCollectionItemsByIds(
      state.animations,
      usedIds.animations || [],
    ),
    transforms: filterCollectionItemsByIds(
      state.transforms,
      usedIds.transforms || [],
    ),
    characters: filterCollectionItemsByIds(
      state.characters,
      usedIds.characters || [],
    ),
    fonts: filterCollectionItemsByIds(state.fonts, usedIds.fonts || []),
    colors: filterCollectionItemsByIds(state.colors, usedIds.colors || []),
    textStyles: filterCollectionItemsByIds(
      state.textStyles,
      usedIds.textStyles || [],
    ),
    layouts: filterCollectionItemsByIds(state.layouts, usedIds.layouts || []),
    controls: filterCollectionItemsByIds(
      state.controls,
      usedIds.controls || [],
    ),
    variables: keepAllVariables
      ? state.variables
      : filterCollectionItemsByIds(state.variables, usedIds.variables || []),
  };
};
