import { buildSceneOverview } from "../../../../internal/project/sceneOverview.js";
import {
  doesCommittedEventAffectSceneOverview,
  getLatestSceneOverviewRevision,
  isMainPartition,
  isNonEmptyString,
  resolveSceneIdForPartition,
} from "./shared.js";
import { composeRepositoryState } from "./sceneStateView.js";
import {
  deleteSceneOverviewCheckpoint,
  deleteSceneOverviewCheckpointByPartition,
  isSceneOverviewCheckpointFresh,
  loadSceneOverviewCheckpoint,
  loadSceneOverviewCheckpoints,
  saveSceneOverviewCheckpoint,
} from "./sceneOverviewStore.js";

export const createSceneBundleRuntime = ({
  store,
  events,
  now = () => Date.now(),
  getCurrentMainState,
  getActiveSceneId,
  getActiveSceneState,
  loadSceneProjection,
}) => {
  const getSceneStateForOverview = async (sceneId) => {
    const activeSceneId = getActiveSceneId();
    const activeSceneState = getActiveSceneState();
    if (sceneId === activeSceneId && activeSceneState) {
      return activeSceneState;
    }

    return loadSceneProjection(sceneId);
  };

  const buildAndStoreSceneOverview = async ({ sceneId, checkpoint = null }) => {
    if (!isNonEmptyString(sceneId)) {
      return undefined;
    }

    const currentMainState = getCurrentMainState();
    const sceneExists = Boolean(currentMainState?.scenes?.items?.[sceneId]);
    if (!sceneExists) {
      if (checkpoint) {
        await deleteSceneOverviewCheckpoint({ store, sceneId });
      }
      return undefined;
    }

    const sceneState = await getSceneStateForOverview(sceneId);

    const overview = buildSceneOverview({
      repositoryState: composeRepositoryState({
        mainState: currentMainState,
        activeSceneId: sceneId,
        activeSceneState: sceneState,
      }),
      sceneId,
    });

    if (!overview) {
      await deleteSceneOverviewCheckpoint({ store, sceneId });
      return undefined;
    }

    await saveSceneOverviewCheckpoint({
      store,
      sceneId,
      value: overview,
      lastCommittedId: getLatestSceneOverviewRevision({
        events,
        sceneId,
      }),
      updatedAt: now(),
    });

    return structuredClone(overview);
  };

  const ensureSceneOverviewWithCheckpoint = async ({
    sceneId,
    checkpoint = null,
  }) => {
    if (!isNonEmptyString(sceneId)) {
      return undefined;
    }

    const currentMainState = getCurrentMainState();
    const sceneExists = Boolean(currentMainState?.scenes?.items?.[sceneId]);
    if (!sceneExists) {
      if (checkpoint) {
        await deleteSceneOverviewCheckpoint({ store, sceneId });
      }
      return undefined;
    }

    if (sceneId === getActiveSceneId() && getActiveSceneState()) {
      return buildAndStoreSceneOverview({
        sceneId,
        checkpoint,
      });
    }

    const latestRelevantRevision = getLatestSceneOverviewRevision({
      events,
      sceneId,
    });
    if (
      isSceneOverviewCheckpointFresh({
        checkpoint,
        latestRelevantRevision,
      })
    ) {
      return structuredClone(checkpoint.value);
    }

    return buildAndStoreSceneOverview({
      sceneId,
      checkpoint,
    });
  };

  const invalidateInactiveSceneOverviews = async () => {
    const activeSceneId = getActiveSceneId();
    const currentSceneIds = Object.keys(
      getCurrentMainState()?.scenes?.items || {},
    );

    for (const sceneId of currentSceneIds) {
      if (sceneId === activeSceneId) {
        continue;
      }
      await deleteSceneOverviewCheckpoint({ store, sceneId });
    }
  };

  return {
    getSceneOverview(_sceneId) {
      return undefined;
    },

    async ensureSceneBundle(sceneId) {
      return ensureSceneOverviewWithCheckpoint({
        sceneId,
        checkpoint: await loadSceneOverviewCheckpoint({ store, sceneId }),
      });
    },

    async loadSceneOverviews({ sceneIds = [] } = {}) {
      const overviewsBySceneId = {};
      const checkpointsBySceneId = await loadSceneOverviewCheckpoints({
        store,
        sceneIds,
      });

      for (const sceneId of sceneIds) {
        const overview = await ensureSceneOverviewWithCheckpoint({
          sceneId,
          checkpoint: checkpointsBySceneId.get(sceneId),
        });
        if (overview) {
          overviewsBySceneId[sceneId] = overview;
        }
      }

      return overviewsBySceneId;
    },

    async handleCommittedEvents(sourceEvents = []) {
      const committedEvents = Array.isArray(sourceEvents)
        ? sourceEvents.filter(Boolean)
        : [];
      if (committedEvents.length === 0) {
        return;
      }

      const activeSceneId = getActiveSceneId();
      const scenesToRebuild = new Set();
      const inactivePartitionsToDelete = new Set();
      let sawMainEvent = false;

      for (const event of committedEvents) {
        const partition = event?.partition;
        if (!isNonEmptyString(partition)) {
          continue;
        }

        if (isMainPartition(partition)) {
          if (!doesCommittedEventAffectSceneOverview(event)) {
            continue;
          }
          sawMainEvent = true;
          if (activeSceneId) {
            scenesToRebuild.add(activeSceneId);
          }
          continue;
        }

        const sceneId = resolveSceneIdForPartition(
          getCurrentMainState(),
          partition,
        );
        if (sceneId && sceneId === activeSceneId) {
          scenesToRebuild.add(sceneId);
          continue;
        }

        if (partition.startsWith("m:s:") || partition.startsWith("s:")) {
          inactivePartitionsToDelete.add(partition);
        }
      }

      if (sawMainEvent) {
        await invalidateInactiveSceneOverviews();
      }

      for (const partition of inactivePartitionsToDelete) {
        await deleteSceneOverviewCheckpointByPartition({
          store,
          partition,
        });
      }

      for (const sceneId of scenesToRebuild) {
        await buildAndStoreSceneOverview({
          sceneId,
        });
      }
    },

    async flushSceneOverviews() {},

    async clearSceneOverview(sceneId) {
      await deleteSceneOverviewCheckpoint({ store, sceneId });
    },

    async clearAllSceneOverviews() {
      for (const sceneId of Object.keys(
        getCurrentMainState()?.scenes?.items || {},
      )) {
        await deleteSceneOverviewCheckpoint({ store, sceneId });
      }
    },
  };
};
