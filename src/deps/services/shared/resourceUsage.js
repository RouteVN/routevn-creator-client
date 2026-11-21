import { collectTransitionMaskImageIds } from "../../../internal/animationMasks.js";
import { collectParticleTextureImageIds } from "../../../internal/particles.js";
import {
  collectReferencedResourceIds,
  projectRepositoryStateToDomainState,
  recursivelyCheckResource,
} from "../../../internal/project/projection.js";
import { scenePartitionFor } from "./collab/partitions.js";
import {
  composeRepositoryState,
  isSceneProjectionCheckpointShapeValid,
  loadSceneProjectionCheckpoint,
} from "./projectRepositoryViews/sceneStateView.js";
import {
  SCENE_VIEW_NAME,
  SCENE_VIEW_VERSION,
  stripSceneLinesFromState,
} from "./projectRepositoryViews/shared.js";

const createEmptyUsage = () => ({
  inProps: {},
  isUsed: false,
  count: 0,
});

const mergeUsage = (left = createEmptyUsage(), right = createEmptyUsage()) => {
  const mergedProps = {};

  for (const [targetName, entries] of Object.entries(left?.inProps ?? {})) {
    mergedProps[targetName] = Array.isArray(entries)
      ? structuredClone(entries)
      : [];
  }

  for (const [targetName, entries] of Object.entries(right?.inProps ?? {})) {
    if (!Array.isArray(entries) || entries.length === 0) {
      continue;
    }

    if (!Array.isArray(mergedProps[targetName])) {
      mergedProps[targetName] = [];
    }

    mergedProps[targetName] = mergedProps[targetName].concat(
      structuredClone(entries),
    );
  }

  const count = Object.values(mergedProps).reduce(
    (sum, entries) => sum + entries.length,
    0,
  );

  return {
    inProps: mergedProps,
    isUsed: count > 0,
    count,
  };
};

const toDomainState = ({ repositoryState, projectId }) =>
  projectRepositoryStateToDomainState({
    repositoryState,
    projectId,
  });

const toSceneProjectionFromCurrentState = ({
  currentRepositoryState,
  sceneId,
}) => {
  const scene = currentRepositoryState?.scenes?.items?.[sceneId];
  if (!scene || scene.type === "folder") {
    return undefined;
  }

  return {
    scenes: {
      items: {
        [sceneId]: structuredClone(scene),
      },
    },
  };
};

const loadSceneRepositoryState = async ({
  store,
  sceneId,
  mainRepositoryState,
  currentRepositoryState,
}) => {
  const checkpoint =
    store && typeof store === "object"
      ? await loadSceneProjectionCheckpoint({
          store,
          sceneId,
        })
      : undefined;
  const checkpointValue = checkpoint?.value;
  const sceneProjection = isSceneProjectionCheckpointShapeValid({
    value: checkpointValue,
    sceneId,
  })
    ? checkpointValue
    : toSceneProjectionFromCurrentState({
        currentRepositoryState,
        sceneId,
      });

  if (!sceneProjection) {
    return undefined;
  }

  return composeRepositoryState({
    mainState: mainRepositoryState,
    activeSceneId: sceneId,
    activeSceneState: sceneProjection,
  });
};

const collectSceneDeletionTargetIds = ({ state, sceneId }) => {
  const sceneItems = state?.scenes ?? {};
  const targetIds = [];
  const pendingParentIds = [sceneId];

  while (pendingParentIds.length > 0) {
    const parentId = pendingParentIds.shift();
    const currentScene = sceneItems[parentId];
    if (currentScene && currentScene.type !== "folder") {
      targetIds.push(parentId);
    }

    for (const [childSceneId, scene] of Object.entries(sceneItems)) {
      if (scene?.parentId !== parentId) {
        continue;
      }

      pendingParentIds.push(childSceneId);
    }
  }

  return targetIds;
};

export const checkSceneDeleteUsage = ({
  state,
  sceneOverviewsById = {},
  sceneId,
}) => {
  const targetSceneIds = collectSceneDeletionTargetIds({
    state,
    sceneId,
  });
  if (targetSceneIds.length === 0) {
    return {
      isUsed: false,
      count: 0,
      reasons: [],
    };
  }

  const targetSceneIdSet = new Set(targetSceneIds);
  const reasons = [];
  const initialSceneId = state?.story?.initialSceneId;

  if (targetSceneIdSet.has(initialSceneId)) {
    reasons.push({
      type: "initial-scene",
      sceneId: initialSceneId,
    });
  }

  for (const [sourceSceneId, overview] of Object.entries(sceneOverviewsById)) {
    const outgoingSceneIds = Array.isArray(overview?.outgoingSceneIds)
      ? overview.outgoingSceneIds
      : [];

    for (const outgoingSceneId of outgoingSceneIds) {
      if (!targetSceneIdSet.has(outgoingSceneId)) {
        continue;
      }

      reasons.push({
        type: "incoming-scene-transition",
        sceneId: outgoingSceneId,
        sourceSceneId,
      });
    }
  }

  return {
    isUsed: reasons.length > 0,
    count: reasons.length,
    reasons,
  };
};

export const checkProjectResourceUsage = async ({
  repository,
  store,
  projectId = "unknown-project",
  itemId,
  checkTargets = [],
}) => {
  if (!repository || typeof repository.getState !== "function") {
    return createEmptyUsage();
  }

  const normalizedTargets = Array.isArray(checkTargets)
    ? checkTargets.filter((target) => typeof target === "string")
    : [];
  if (normalizedTargets.length === 0) {
    return createEmptyUsage();
  }

  const currentRepositoryState = repository.getState();
  const mainRepositoryState = stripSceneLinesFromState(currentRepositoryState);
  const nonSceneTargets = normalizedTargets.filter(
    (target) => target !== "scenes",
  );

  let usage = createEmptyUsage();

  if (nonSceneTargets.length > 0) {
    usage = recursivelyCheckResource({
      state: toDomainState({
        repositoryState: mainRepositoryState,
        projectId,
      }),
      itemId,
      checkTargets: nonSceneTargets,
    });

    if (usage.isUsed) {
      return usage;
    }
  }

  if (!normalizedTargets.includes("scenes")) {
    return usage;
  }

  const sceneItems = mainRepositoryState?.scenes?.items ?? {};
  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    if (!scene || scene.type === "folder") {
      continue;
    }

    const sceneRepositoryState = await loadSceneRepositoryState({
      store,
      sceneId,
      mainRepositoryState,
      currentRepositoryState,
    });
    if (!sceneRepositoryState) {
      continue;
    }

    const sceneUsage = recursivelyCheckResource({
      state: toDomainState({
        repositoryState: sceneRepositoryState,
        projectId,
      }),
      itemId,
      checkTargets: ["scenes"],
    });

    usage = mergeUsage(usage, sceneUsage);
    if (usage.isUsed) {
      return usage;
    }
  }

  return usage;
};

// The scenes read in one go, from storage or through the repository. Reading
// them in batches keeps a large project from holding every scene's lines at
// once.
const IMAGE_USAGE_SCENE_BATCH_SIZE = 20;

// The ids of a collection's items: the ones in its tree, in tree order, then
// any item the tree leaves out. `inTreeCount` is how many came from the tree.
const selectOrderedItemIds = (collection) => {
  const items = collection?.items ?? {};
  const orderedIds = [];
  const seenIds = new Set();
  const visit = (nodes) => {
    for (const node of nodes) {
      const id = typeof node === "string" ? node : node?.id;
      if (typeof id !== "string" || seenIds.has(id)) {
        continue;
      }

      seenIds.add(id);
      if (items[id]) {
        orderedIds.push(id);
      }
      if (Array.isArray(node?.children)) {
        visit(node.children);
      }
    }
  };

  if (Array.isArray(collection?.tree)) {
    visit(collection.tree);
  }
  const inTreeCount = orderedIds.length;
  for (const id of Object.keys(items)) {
    if (!seenIds.has(id)) {
      orderedIds.push(id);
    }
  }

  return { orderedIds, inTreeCount };
};

const selectItemIdsOfType = (collection, type) =>
  new Set(
    Object.entries(collection?.items ?? {})
      .filter(([, item]) => item?.type === type)
      .map(([itemId]) => itemId),
  );

const getImageUsageBucket = (index, imageId) => {
  let bucket = index.usagesByImageId.get(imageId);
  if (!bucket) {
    bucket = {
      scenes: [],
      layouts: [],
      controls: [],
      animations: [],
      particles: [],
    };
    index.usagesByImageId.set(imageId, bucket);
  }

  return bucket;
};

const addMainStateImageUsages = ({
  index,
  repositoryState,
  imageIds,
  particleIds,
  trackedIds,
}) => {
  const imageItems = repositoryState.images?.items ?? {};

  for (const target of ["layouts", "controls"]) {
    const collection = repositoryState[target];
    for (const itemId of selectOrderedItemIds(collection).orderedIds) {
      const item = collection.items[itemId];
      if (item.type === "folder") {
        continue;
      }

      const referencedIds = collectReferencedResourceIds({
        node: item,
        target,
        resourceIds: trackedIds,
      });
      for (const referencedId of referencedIds) {
        if (particleIds.has(referencedId)) {
          index.shownParticleIds.add(referencedId);
          continue;
        }

        getImageUsageBucket(index, referencedId)[target].push({
          id: itemId,
          name: item.name ?? "",
        });
      }
    }
  }

  const animations = repositoryState.animations;
  for (const animationId of selectOrderedItemIds(animations).orderedIds) {
    const item = animations.items[animationId];
    if (item.type !== "animation" || !item.animation) {
      continue;
    }

    const usedImageIds = collectReferencedResourceIds({
      node: item.animation,
      keys: ["imageId"],
      resourceIds: imageIds,
    });
    for (const imageId of collectTransitionMaskImageIds(
      item.animation.mask,
      imageItems,
    )) {
      if (imageIds.has(imageId)) {
        usedImageIds.add(imageId);
      }
    }

    for (const imageId of usedImageIds) {
      getImageUsageBucket(index, imageId).animations.push({
        id: animationId,
        name: item.name ?? "",
      });
    }
  }

  const particles = repositoryState.particles;
  for (const particleId of selectOrderedItemIds(particles).orderedIds) {
    const item = particles.items[particleId];
    if (item.type !== "particle") {
      continue;
    }

    for (const imageId of collectParticleTextureImageIds(item, imageItems)) {
      if (imageIds.has(imageId)) {
        getImageUsageBucket(index, imageId).particles.push({
          id: particleId,
          name: item.name ?? "",
        });
      }
    }
  }
};

// Records where one scene uses the tracked images. `scene` is the scene from
// the main state, which owns its sections. `linesScene` holds the lines.
const addSceneImageUsages = ({
  index,
  scene,
  linesScene,
  particleIds,
  trackedIds,
}) => {
  const usagesByImageId = new Map();
  // A line is listed once for an image, with each of its actions that uses
  // the image. A line's fields and actions are visited one after another, so
  // the line being added to is the last one listed.
  const addUsage = (referencedId, location, actionType) => {
    if (particleIds.has(referencedId)) {
      index.shownParticleIds.add(referencedId);
      return;
    }

    let usage = usagesByImageId.get(referencedId);
    if (!usage) {
      usage = { id: scene.id, name: scene.name ?? "", lines: [] };
      usagesByImageId.set(referencedId, usage);
    }
    if (!location) {
      return;
    }

    let line = usage.lines.at(-1);
    if (line?.lineId !== location.lineId) {
      line = { ...location, actionTypes: [] };
      usage.lines.push(line);
    }
    if (actionType) {
      line.actionTypes.push(actionType);
    }
  };
  const addNodeUsages = (node, location, actionType) => {
    const referencedIds = collectReferencedResourceIds({
      node,
      target: "scenes",
      resourceIds: trackedIds,
    });
    for (const referencedId of referencedIds) {
      addUsage(referencedId, location, actionType);
    }
  };

  const { sections, ...sceneFields } = scene;
  addNodeUsages(sceneFields);

  for (const sectionId of selectOrderedItemIds(sections).orderedIds) {
    const { lines: _lines, ...sectionFields } = sections.items[sectionId];
    if (sectionFields.type === "folder") {
      continue;
    }
    addNodeUsages(sectionFields);

    const lines = linesScene.sections?.items?.[sectionId]?.lines;
    const { orderedIds: lineIds, inTreeCount } = selectOrderedItemIds(lines);
    lineIds.forEach((lineId, lineIndex) => {
      const { actions, ...lineFields } = lines.items[lineId];
      const location = {
        sectionId,
        sectionName: sectionFields.name ?? "",
        lineId,
      };
      // A line the tree leaves out is not shown in the editor and has no
      // number.
      if (lineIndex < inTreeCount) {
        location.lineNumber = lineIndex + 1;
      }

      addNodeUsages(lineFields, location);
      for (const [actionType, action] of Object.entries(actions ?? {})) {
        addNodeUsages({ [actionType]: action }, location, actionType);
      }
    });
  }

  return usagesByImageId;
};

const hasSceneLines = (scene) =>
  Object.values(scene?.sections?.items ?? {}).some(
    (section) => Object.keys(section?.lines?.items ?? {}).length > 0,
  );

const loadStoredSceneSnapshots = async ({ store, sceneIds }) => {
  const checkpoints = await store.loadMaterializedViewCheckpoints({
    viewName: SCENE_VIEW_NAME,
    partitions: sceneIds.map(scenePartitionFor),
  });
  const checkpointByPartition = new Map(
    checkpoints
      .filter(Boolean)
      .map((checkpoint) => [checkpoint.partition, checkpoint]),
  );
  const scenesById = new Map();

  for (const sceneId of sceneIds) {
    const checkpoint = checkpointByPartition.get(scenePartitionFor(sceneId));
    if (
      checkpoint?.viewVersion !== SCENE_VIEW_VERSION ||
      !isSceneProjectionCheckpointShapeValid({
        value: checkpoint.value,
        sceneId,
      })
    ) {
      continue;
    }

    const scene = checkpoint.value.scenes.items[sceneId];
    if (scene) {
      scenesById.set(sceneId, scene);
    }
  }

  return scenesById;
};

// Finds every place the project's images are used: scene lines, layouts,
// controls, animations and particles. Look an image up in the result with
// `selectImageUsage`.
//
// The repository state holds the lines of the open scene only, so the other
// scenes' lines come from their stored snapshots, as in
// `checkProjectResourceUsage`. A scene with no usable snapshot is loaded
// through the repository.
export const buildImageUsageIndex = async ({ repository, store }) => {
  const repositoryState = repository.getState();
  const imageIds = selectItemIdsOfType(repositoryState.images, "image");
  const particleIds = selectItemIdsOfType(
    repositoryState.particles,
    "particle",
  );
  const trackedIds = new Set([...imageIds, ...particleIds]);
  const index = {
    usagesByImageId: new Map(),
    shownParticleIds: new Set(),
    // The images and their folders as they were when the index was built.
    images: repositoryState.images,
  };

  addMainStateImageUsages({
    index,
    repositoryState,
    imageIds,
    particleIds,
    trackedIds,
  });

  const scenes = repositoryState.scenes;
  const sceneIds = selectOrderedItemIds(scenes).orderedIds.filter(
    (sceneId) => scenes.items[sceneId].type !== "folder",
  );
  const sceneUsagesBySceneId = new Map();
  const unloadedSceneIds = [];
  const addScene = (sceneId, linesScene) => {
    sceneUsagesBySceneId.set(
      sceneId,
      addSceneImageUsages({
        index,
        scene: scenes.items[sceneId],
        linesScene,
        particleIds,
        trackedIds,
      }),
    );
  };

  for (
    let start = 0;
    start < sceneIds.length;
    start += IMAGE_USAGE_SCENE_BATCH_SIZE
  ) {
    const batchSceneIds = sceneIds.slice(
      start,
      start + IMAGE_USAGE_SCENE_BATCH_SIZE,
    );
    // The open scene's lines in the repository state are the newest.
    const storedSceneIds = batchSceneIds.filter(
      (sceneId) => !hasSceneLines(scenes.items[sceneId]),
    );
    const storedScenesById =
      storedSceneIds.length > 0
        ? await loadStoredSceneSnapshots({ store, sceneIds: storedSceneIds })
        : new Map();

    for (const sceneId of batchSceneIds) {
      const scene = scenes.items[sceneId];
      if (hasSceneLines(scene)) {
        addScene(sceneId, scene);
        continue;
      }

      const storedScene = storedScenesById.get(sceneId);
      if (storedScene) {
        addScene(sceneId, storedScene);
        continue;
      }

      unloadedSceneIds.push(sceneId);
    }
  }

  // The repository returns the whole project with the lines of the scenes
  // asked for, so these are loaded in batches too.
  for (
    let start = 0;
    start < unloadedSceneIds.length;
    start += IMAGE_USAGE_SCENE_BATCH_SIZE
  ) {
    const batchSceneIds = unloadedSceneIds.slice(
      start,
      start + IMAGE_USAGE_SCENE_BATCH_SIZE,
    );
    const loadedState = await repository.getContextState({
      sceneIds: batchSceneIds,
    });
    for (const sceneId of batchSceneIds) {
      const loadedScene = loadedState.scenes?.items?.[sceneId];
      if (loadedScene) {
        addScene(sceneId, loadedScene);
      }
    }
  }

  for (const sceneId of sceneIds) {
    const sceneUsages = sceneUsagesBySceneId.get(sceneId);
    if (!sceneUsages) {
      continue;
    }

    for (const [imageId, usage] of sceneUsages) {
      getImageUsageBucket(index, imageId).scenes.push(usage);
    }
  }

  return index;
};

// The images in a folder and in the folders inside it, in tree order.
export const selectFolderImageIds = ({ images, folderId }) => {
  const findFolderNode = (nodes = []) => {
    for (const node of nodes) {
      if (node.id === folderId) {
        return node;
      }

      const folderNode = findFolderNode(node.children);
      if (folderNode) {
        return folderNode;
      }
    }

    return undefined;
  };
  const imageIds = [];
  const visit = (nodes = []) => {
    for (const node of nodes) {
      if (images.items[node.id]?.type === "image") {
        imageIds.push(node.id);
      }
      visit(node.children);
    }
  };

  visit(findFolderNode(images.tree)?.children);
  return imageIds;
};

// Where one image is used, from an index built by `buildImageUsageIndex`.
// A particle that draws with the image is listed, but it only keeps the image
// from being deleted when a scene, layout or control shows the particle, the
// rule `recursivelyCheckResource` applies.
export const selectImageUsage = ({ index, imageId }) => {
  const bucket = index.usagesByImageId.get(imageId);
  const usages = [];

  if (bucket) {
    for (const scene of bucket.scenes) {
      usages.push({ type: "scene", ...scene });
    }
    for (const layout of bucket.layouts) {
      usages.push({ type: "layout", ...layout });
    }
    for (const control of bucket.controls) {
      usages.push({ type: "control", ...control });
    }
    for (const animation of bucket.animations) {
      usages.push({ type: "animation", ...animation });
    }
    for (const particle of bucket.particles) {
      usages.push({
        type: "particle",
        ...particle,
        isShown: index.shownParticleIds.has(particle.id),
      });
    }
  }

  return {
    usages: structuredClone(usages),
    blocksDelete: usages.some(
      (usage) => usage.type !== "particle" || usage.isShown,
    ),
  };
};
