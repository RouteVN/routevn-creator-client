import {
  buildLayoutElements,
  createLayoutReferenceResources,
} from "./layout.js";
import { RESOURCE_TYPES } from "./commands.js";
import { normalizeEngineActions } from "./engineActions.js";
import { toFlatItems, toHierarchyStructure } from "./tree.js";

const DEFAULT_TIMESTAMP = 0;
const createResourceCollection = () => ({
  items: {},
  tree: [],
});

const toFiniteTimestamp = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const cloneOr = (value, fallback) => {
  if (value === undefined) return fallback;
  return structuredClone(value);
};

const getHierarchyNodes = (collection) =>
  Array.isArray(collection?.tree) ? collection.tree : [];

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
  const resources = Object.fromEntries(
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
    resources,
  };
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
    RESOURCE_TYPES.map((type) => [type, { items: {}, tree: [] }]),
  );

  for (const resourceType of RESOURCE_TYPES) {
    const repositoryCollection = repositoryState?.[resourceType] || {};
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

    resources[resourceType].tree = buildTreeFromParentMap({
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

      if (resourceType === "layouts") {
        const clonedLayout = cloneOr(item, {});
        const entryType = clonedLayout.type || "layout";

        if (entryType === "folder") {
          resources[resourceType].items[resourceId] = {
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

        resources[resourceType].items[resourceId] = {
          id: resourceId,
          ...clonedLayout,
          type: entryType,
          name: item?.name || `Layout ${resourceId}`,
          layoutType: item?.layoutType || "base",
          parentId,
          elements,
          rootElementOrder,
          createdAt,
          updatedAt,
        };
        continue;
      }

      resources[resourceType].items[resourceId] = {
        id: resourceId,
        ...cloneOr(item, {}),
        ...(resourceType === "characters" && item?.type === "character"
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
          actions: cloneOr(line?.actions, {}),
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

  state.resources = projectRepositoryResources({ repositoryState });
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

const constructImageResources = (repositoryImages = {}) => {
  return Object.entries(repositoryImages).reduce((result, [imageId, item]) => {
    if (item?.type && item.type !== "image") {
      return result;
    }
    if (!item?.fileId) {
      return result;
    }

    result[imageId] = pickResourceFields(item, [
      "fileId",
      "fileType",
      "width",
      "height",
    ]);
    return result;
  }, {});
};

const constructVideoResources = (repositoryVideos = {}) => {
  return Object.entries(repositoryVideos).reduce((result, [videoId, item]) => {
    if (item?.type !== "video" || !item.fileId) {
      return result;
    }

    result[videoId] = pickResourceFields(item, [
      "fileId",
      "fileType",
      "width",
      "height",
    ]);
    return result;
  }, {});
};

const constructSoundResources = (repositorySounds = {}) => {
  return Object.entries(repositorySounds).reduce((result, [soundId, item]) => {
    if (item?.type !== "sound" || !item.fileId) {
      return result;
    }

    result[soundId] = pickResourceFields(item, ["fileId", "fileType"]);
    return result;
  }, {});
};

const constructTweenResources = (repositoryTweens = {}) => {
  return Object.entries(repositoryTweens).reduce((result, [tweenId, item]) => {
    if (item?.type !== "tween") {
      return result;
    }

    result[tweenId] = {
      properties: item.properties,
    };
    return result;
  }, {});
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

const extractCharacterImages = (repositoryCharacters = {}) => {
  return Object.entries(repositoryCharacters).reduce(
    (result, [, character]) => {
      if (character?.type !== "character" || !character.sprites?.items) {
        return result;
      }

      Object.entries(character.sprites.items).forEach(([spriteId, sprite]) => {
        if (!sprite?.fileId) {
          return;
        }

        result[spriteId] = pickResourceFields(sprite, [
          "fileId",
          "fileType",
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
  imageItems = {},
  typography = { items: {}, tree: [] },
  colors = { items: {}, tree: [] },
  fonts = { items: {}, tree: [] },
) => {
  const baseLayoutResources = createLayoutReferenceResources(
    imageItems,
    typography,
    colors,
    fonts,
  );
  const textStyles = {
    ...baseLayoutResources.textStyles,
  };
  const layouts = {};

  Object.entries(repositoryLayouts).forEach(([layoutId, layout]) => {
    if (layout?.type !== "layout") {
      return;
    }

    const { elements, resources } = buildLayoutElements(
      toHierarchyStructure(layout.elements),
      imageItems,
      typography,
      colors,
      fonts,
      { layoutId },
    );

    Object.assign(textStyles, resources.textStyles);

    layouts[layoutId] = {
      id: layoutId,
      name: layout.name,
      layoutType: layout.layoutType,
      elements,
      ...(Array.isArray(layout.transitions)
        ? { transitions: structuredClone(layout.transitions) }
        : {}),
    };
  });

  return {
    resources: {
      images: baseLayoutResources.images,
      colors: baseLayoutResources.colors,
      fonts: baseLayoutResources.fonts,
      textStyles,
    },
    layouts,
  };
};

const constructProjectResources = (repositoryState = {}) => {
  const repositoryImages = repositoryState.images?.items || {};
  const repositoryVideos = repositoryState.videos?.items || {};
  const repositorySounds = repositoryState.sounds?.items || {};
  const repositoryTweens = repositoryState.tweens?.items || {};
  const repositoryCharacters = repositoryState.characters?.items || {};
  const repositoryTransforms = repositoryState.transforms?.items || {};
  const repositoryLayouts = repositoryState.layouts?.items || {};
  const typography = repositoryState.typography || { items: {}, tree: [] };
  const colors = repositoryState.colors || { items: {}, tree: [] };
  const fonts = repositoryState.fonts || { items: {}, tree: [] };
  const variables = Object.fromEntries(
    Object.entries(repositoryState.variables?.items || {}).filter(
      ([, item]) => item.type !== "folder",
    ),
  );

  const characterImages = extractCharacterImages(repositoryCharacters);
  const imageItems = {
    ...constructImageResources(repositoryImages),
    ...characterImages,
  };
  const { resources: layoutResources, layouts } = constructLayoutResources(
    repositoryLayouts,
    imageItems,
    typography,
    colors,
    fonts,
  );

  return {
    images: layoutResources.images,
    videos: constructVideoResources(repositoryVideos),
    sounds: constructSoundResources(repositorySounds),
    fonts: layoutResources.fonts,
    colors: layoutResources.colors,
    textStyles: layoutResources.textStyles,
    transforms: constructTransformResources(repositoryTransforms),
    characters: constructCharacterResources(repositoryCharacters),
    layouts,
    tweens: constructTweenResources(repositoryTweens),
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
              actions: normalizeEngineActions(line.actions || {}),
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

export function constructProjectData(state, options = {}) {
  return {
    screen: {
      width: 1920,
      height: 1080,
      backgroundColor: "#000000",
    },
    resources: constructProjectResources(state),
    story: {
      initialSceneId: options.initialSceneId || state.story?.initialSceneId,
      scenes: constructStory(state.scenes),
    },
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
    .map((element) => {
      return element?.click?.actionPayload?.actions?.sectionTransition;
    })
    .filter(Boolean);
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
  menuSceneId,
}) => {
  const lines = toSectionLines(section);
  const transitions = new Set();

  let choiceCount = 0;
  let hasMenuReturnAction = false;
  let returnsToMenuScene = false;

  lines.forEach((line) => {
    const pushLayeredView =
      line.actions?.pushLayeredView || line.actions?.actions?.pushLayeredView;
    const popLayeredView =
      line.actions?.popLayeredView || line.actions?.actions?.popLayeredView;
    if (pushLayeredView || popLayeredView) {
      hasMenuReturnAction = true;
    }

    const sectionTransition =
      line.actions?.sectionTransition ||
      line.actions?.actions?.sectionTransition;
    if (menuSceneId && sectionTransition?.sceneId === menuSceneId) {
      returnsToMenuScene = true;
    }
    const sectionTransitionKey = createTransitionKey(sectionTransition);
    if (sectionTransitionKey) {
      transitions.add(sectionTransitionKey);
    }

    const choice = line.actions?.choice || line.actions?.actions?.choice;
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

    const layoutRefs = [
      line.actions?.background,
      line.actions?.base,
      line.actions?.actions?.background,
      line.actions?.actions?.base,
    ].filter((ref) => ref?.resourceType === "layout" && ref?.resourceId);

    layoutRefs.forEach((layoutRef) => {
      const layout = layouts?.items?.[layoutRef.resourceId];
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

  return Object.entries(variablesItems)
    .filter(([_, item]) => {
      if (item.type === "folder" || item.itemType === "folder") {
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
  "typographyId",
  "hoverTypographyId",
  "clickedTypographyId",
  "fontFileId",
];

const TYPOGRAPHY_RESOURCE_KEYS = ["colorId", "fontId"];

const EXPORT_RESOURCE_KEYS = new Set([
  ...SCENE_RESOURCE_KEYS,
  ...LAYOUT_RESOURCE_KEYS,
  ...TYPOGRAPHY_RESOURCE_KEYS,
]);

const RESOURCE_KEY_TO_TYPES = {
  resourceId: [
    "layouts",
    "images",
    "videos",
    "sounds",
    "tweens",
    "transforms",
    "characters",
    "typography",
    "colors",
    "fonts",
    "variables",
    "sprites",
  ],
  transformId: ["transforms"],
  characterId: ["characters"],
  animation: ["tweens"],
  layoutId: ["layouts"],
  bgmId: ["sounds"],
  sfxId: ["sounds"],
  variableId: ["variables"],
  imageId: ["images"],
  hoverImageId: ["images"],
  clickImageId: ["images"],
  thumbImageId: ["images"],
  barImageId: ["images"],
  hoverThumbImageId: ["images"],
  hoverBarImageId: ["images"],
  typographyId: ["typography"],
  hoverTypographyId: ["typography"],
  clickedTypographyId: ["typography"],
  colorId: ["colors"],
  fontId: ["fonts"],
  fontFileId: ["fonts"],
};

const COLLECTION_DEFS = {
  images: { collection: "images", itemType: "image" },
  videos: { collection: "videos", itemType: "video" },
  sounds: { collection: "sounds", itemType: "sound" },
  tweens: { collection: "tweens", itemType: "tween" },
  transforms: { collection: "transforms", itemType: "transform" },
  characters: { collection: "characters", itemType: "character" },
  fonts: { collection: "fonts", itemType: "font" },
  colors: { collection: "colors", itemType: "color" },
  typography: { collection: "typography", itemType: "typography" },
  layouts: { collection: "layouts", itemType: "layout" },
  variables: { collection: "variables", itemType: null },
  sprites: { collection: null, itemType: "sprite" },
};

const RESOURCE_KEYS_MAP = {
  scenes: SCENE_RESOURCE_KEYS,
  layouts: LAYOUT_RESOURCE_KEYS,
  typography: TYPOGRAPHY_RESOURCE_KEYS,
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

const filterCollectionItemsByIds = (collectionState, ids) => {
  if (!collectionState) return collectionState;
  const items = collectionState.items || {};
  const filteredItems = {};

  for (const id of ids) {
    const item = items[id];
    if (item) {
      filteredItems[id] = item;
    }
  }

  return {
    ...collectionState,
    items: filteredItems,
  };
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

export const collectUsedResourcesForExport = (state) => {
  const usage = createUsageBuckets();
  const index = createResourceIndex(state);
  const layoutQueue = [];
  const typographyQueue = [];
  const characterQueue = [];
  const scannedLayouts = new Set();
  const scannedTypography = new Set();
  const scannedCharacters = new Set();

  const addUsed = (type, id) => {
    if (!usage[type] || !id) return false;
    if (usage[type].has(id)) return false;
    usage[type].add(id);

    if (type === "layouts") {
      layoutQueue.push(id);
    } else if (type === "typography") {
      typographyQueue.push(id);
    } else if (type === "characters") {
      characterQueue.push(id);
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

    if (matchedPreferredType) return;

    const candidateTypes = index.byId.get(value);
    if (!candidateTypes) return;
    for (const type of candidateTypes) {
      addUsed(type, value);
    }
  };

  scanNodeForResourceReferences(state?.scenes, markReference);

  while (layoutQueue.length > 0) {
    const layoutId = layoutQueue.shift();
    if (scannedLayouts.has(layoutId)) continue;
    scannedLayouts.add(layoutId);
    const layout = getCollectionItems(state, "layouts")[layoutId];
    if (!layout || layout.type !== "layout") continue;
    scanNodeForResourceReferences(layout, markReference);
  }

  while (typographyQueue.length > 0) {
    const typographyId = typographyQueue.shift();
    if (scannedTypography.has(typographyId)) continue;
    scannedTypography.add(typographyId);
    const typography = getCollectionItems(state, "typography")[typographyId];
    if (!typography || typography.type !== "typography") continue;
    scanNodeForResourceReferences(typography, markReference);
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

  const fileIds = new Set();
  const addFileId = (fileId) => {
    if (fileId) fileIds.add(fileId);
  };

  const imageItems = getCollectionItems(state, "images");
  for (const id of usage.images) {
    addFileId(imageItems[id]?.fileId);
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
    Object.entries(usage).map(([type, ids]) => [type, Array.from(ids)]),
  );

  return {
    usedIds,
    fileIds: Array.from(fileIds),
  };
};

export const buildFilteredStateForExport = (
  state,
  usage,
  options = { keepAllVariables: true },
) => {
  const usedIds = usage?.usedIds || {};
  const keepAllVariables = options?.keepAllVariables ?? true;

  return {
    ...state,
    images: filterCollectionItemsByIds(state.images, usedIds.images || []),
    videos: filterCollectionItemsByIds(state.videos, usedIds.videos || []),
    sounds: filterCollectionItemsByIds(state.sounds, usedIds.sounds || []),
    tweens: filterCollectionItemsByIds(state.tweens, usedIds.tweens || []),
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
    typography: filterCollectionItemsByIds(
      state.typography,
      usedIds.typography || [],
    ),
    layouts: filterCollectionItemsByIds(
      state.resources?.layouts,
      usedIds.layouts || [],
    ),
    variables: keepAllVariables
      ? state.resources?.variables
      : filterCollectionItemsByIds(
          state.resources?.variables,
          usedIds.variables || [],
        ),
  };
};
