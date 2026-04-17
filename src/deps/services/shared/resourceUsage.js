import {
  projectRepositoryStateToDomainState,
  recursivelyCheckResource,
} from "../../../internal/project/projection.js";
import {
  composeRepositoryState,
  isSceneProjectionCheckpointShapeValid,
  loadSceneProjectionCheckpoint,
} from "./projectRepositoryViews/sceneStateView.js";
import { stripSceneLinesFromState } from "./projectRepositoryViews/shared.js";

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
