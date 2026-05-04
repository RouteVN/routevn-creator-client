import {
  areSceneEditorLinesEqual,
  cloneSceneEditorLines,
  hasPendingSceneEditorDraftChanges,
  markSceneEditorDraftSectionClean,
  rebaseSceneEditorDraftSection,
} from "./draftSection.js";
import {
  enqueueLatestSceneEditorPersistence,
  enqueueSceneEditorPersistence,
} from "../sceneEditor/persistenceQueue.js";

export const DEFAULT_SCENE_EDITOR_DRAFT_SAVE_TIMING = {
  text: {
    debounceMs: 2000,
    minIntervalMs: 4000,
    maxIntervalMs: 10000,
  },
  structure: {
    debounceMs: 900,
    minIntervalMs: 1000,
    maxIntervalMs: 3000,
  },
};

const defaultNowMs = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

export const clearScheduledDraftFlush = (store) => {
  const timerId = store.selectDraftSaveTimerId();
  if (timerId !== undefined) {
    clearTimeout(timerId);
    store.clearDraftSaveTimer();
  }
};

export const getSceneEditorDraftSaveDelayMs = (
  store,
  { reason = "text", nowMs = defaultNowMs, timing } = {},
) => {
  const reasonTiming =
    (timing || DEFAULT_SCENE_EDITOR_DRAFT_SAVE_TIMING)[reason] ||
    DEFAULT_SCENE_EDITOR_DRAFT_SAVE_TIMING.text;
  const lastFlushStartedAt = store.selectLastDraftFlushStartedAt();
  const pendingSinceAt = store.selectDraftSavePendingSinceAt();
  const now = nowMs();
  const remainingThrottleMs =
    lastFlushStartedAt > 0
      ? Math.max(0, reasonTiming.minIntervalMs - (now - lastFlushStartedAt))
      : 0;
  const remainingMaxWaitMs =
    pendingSinceAt > 0
      ? Math.max(0, reasonTiming.maxIntervalMs - (now - pendingSinceAt))
      : Number.POSITIVE_INFINITY;

  return Math.min(
    Math.max(reasonTiming.debounceMs, remainingThrottleMs),
    remainingMaxWaitMs,
  );
};

export const createSceneEditorDraftPersistence = ({
  syncDraftSectionFromLines = (deps) => deps.store.selectDraftSection(),
  syncDraftSectionFromLiveEditor = (deps) => deps.store.selectDraftSection(),
  syncStoreProjectState = () => {},
  reconcileCurrentEditorSession = () => {},
  nowMs = defaultNowMs,
  timing = DEFAULT_SCENE_EDITOR_DRAFT_SAVE_TIMING,
} = {}) => {
  const flushSceneEditorDrafts = async (
    deps,
    { liveLines, showErrorAlert = true } = {},
  ) => {
    const { store } = deps;
    clearScheduledDraftFlush(store);
    if (Array.isArray(liveLines) && liveLines.length > 0) {
      syncDraftSectionFromLines(deps, liveLines);
    } else {
      syncDraftSectionFromLiveEditor(deps);
    }

    if (!hasPendingSceneEditorDraftChanges(store.selectDraftSection())) {
      store.setDraftSavePendingSinceAt({ timestamp: 0 });
      return;
    }

    return enqueueLatestSceneEditorPersistence({
      owner: deps.projectService,
      key: "draft-flush",
      task: async () => {
        const draftSection =
          Array.isArray(liveLines) && liveLines.length > 0
            ? syncDraftSectionFromLines(deps, liveLines) ||
              store.selectDraftSection()
            : syncDraftSectionFromLiveEditor(deps) ||
              store.selectDraftSection();
        const snapshotLines =
          Array.isArray(liveLines) && liveLines.length > 0
            ? cloneSceneEditorLines(liveLines)
            : cloneSceneEditorLines(draftSection?.lines);
        if (snapshotLines.length === 0) {
          return;
        }

        const flushStartedAt = nowMs();
        store.setLastDraftFlushStartedAt({
          timestamp: flushStartedAt,
        });
        store.setDraftSavePendingSinceAt({ timestamp: 0 });

        try {
          await deps.projectService.syncSectionLinesSnapshot({
            sectionId: draftSection?.sectionId,
            lines: snapshotLines,
          });
          syncStoreProjectState(store, deps.projectService);
          const currentDraftSection = store.selectDraftSection();
          const revision = store.selectRepositoryRevision();
          const isSameDraftTarget =
            currentDraftSection?.sceneId === draftSection?.sceneId &&
            currentDraftSection?.sectionId === draftSection?.sectionId;
          const didDraftAdvance =
            isSameDraftTarget &&
            !areSceneEditorLinesEqual(
              currentDraftSection?.lines,
              snapshotLines,
            );

          if (didDraftAdvance) {
            store.setDraftSection({
              draftSection: rebaseSceneEditorDraftSection(currentDraftSection, {
                revision,
              }),
            });
            setTimeout(() => {
              void flushSceneEditorDrafts(deps).catch(() => {});
            }, 0);
            return;
          }

          if (isSameDraftTarget) {
            store.setDraftSection({
              draftSection: markSceneEditorDraftSectionClean(
                currentDraftSection,
                {
                  revision,
                },
              ),
            });
            reconcileCurrentEditorSession(deps);
          }

          deps.render();
        } catch (error) {
          if (showErrorAlert) {
            deps.appService?.showAlert({
              message: "Failed to save scene changes",
              title: "Error",
            });
          }
          throw error;
        }
      },
    });
  };

  const cancelSceneEditorDraftFlush = (deps) => {
    clearScheduledDraftFlush(deps.store);
  };

  const scheduleSceneEditorDraftFlush = (
    deps,
    { immediate = false, reason = "text" } = {},
  ) => {
    const { store } = deps;
    clearScheduledDraftFlush(store);

    const draftSection = store.selectDraftSection();
    if (!hasPendingSceneEditorDraftChanges(draftSection)) {
      store.setDraftSavePendingSinceAt({ timestamp: 0 });
      return;
    }

    if (store.selectDraftSavePendingSinceAt() <= 0) {
      store.setDraftSavePendingSinceAt({
        timestamp: nowMs(),
      });
    }

    if (immediate) {
      return flushSceneEditorDrafts(deps);
    }

    const delayMs = getSceneEditorDraftSaveDelayMs(store, {
      reason,
      nowMs,
      timing,
    });
    const timerId = setTimeout(() => {
      void flushSceneEditorDrafts(deps).catch(() => {});
    }, delayMs);
    store.setDraftSaveTimerId({ timerId });
  };

  const runSceneEditorPersistence = async (deps, task, options = {}) => {
    if (hasPendingSceneEditorDraftChanges(deps.store.selectDraftSection())) {
      await flushSceneEditorDrafts(deps).catch(() => {});
    }

    return enqueueSceneEditorPersistence({
      owner: deps.projectService,
      task,
      ...options,
    });
  };

  return {
    cancelSceneEditorDraftFlush,
    flushSceneEditorDrafts,
    getDraftSaveDelayMs: (store, options = {}) =>
      getSceneEditorDraftSaveDelayMs(store, {
        nowMs,
        timing,
        ...options,
      }),
    runSceneEditorPersistence,
    scheduleSceneEditorDraftFlush,
  };
};
