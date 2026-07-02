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
import { selectSceneEditorCopy } from "../sceneEditor/sceneEditorCopy.js";

export const DEFAULT_SCENE_EDITOR_DRAFT_SAVE_TIMING = {
  text: {
    debounceMs: 2000,
    minIntervalMs: 5000,
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

const draftFlushTimingByOwner = new WeakMap();

const getDraftFlushTiming = (owner) => {
  if (!owner || typeof owner !== "object") {
    return {
      lastFlushStartedAt: 0,
    };
  }

  let timing = draftFlushTimingByOwner.get(owner);
  if (!timing) {
    timing = {
      lastFlushStartedAt: 0,
    };
    draftFlushTimingByOwner.set(owner, timing);
  }

  return timing;
};

const getSceneEditorDraftReasonTiming = (reason, timing) => {
  return (
    (timing || DEFAULT_SCENE_EDITOR_DRAFT_SAVE_TIMING)[reason] ||
    DEFAULT_SCENE_EDITOR_DRAFT_SAVE_TIMING.text
  );
};

const getSceneEditorDraftReason = (draftSection, fallbackReason = "text") => {
  if (draftSection?.lastSource === "structure") {
    return "structure";
  }

  if (draftSection?.lastSource === "text") {
    return "text";
  }

  return fallbackReason;
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
  const reasonTiming = getSceneEditorDraftReasonTiming(reason, timing);
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

  const debounceDelayMs = Math.min(reasonTiming.debounceMs, remainingMaxWaitMs);

  return Math.max(remainingThrottleMs, debounceDelayMs);
};

const getSceneEditorDraftFlushThrottleDelayMs = (
  store,
  { owner, reason = "text", nowMs = defaultNowMs, timing } = {},
) => {
  const reasonTiming = getSceneEditorDraftReasonTiming(reason, timing);
  const ownerTiming = getDraftFlushTiming(owner);
  const lastFlushStartedAt = Math.max(
    store.selectLastDraftFlushStartedAt(),
    ownerTiming.lastFlushStartedAt,
  );
  if (lastFlushStartedAt <= 0) {
    return 0;
  }

  return Math.max(
    0,
    reasonTiming.minIntervalMs - (nowMs() - lastFlushStartedAt),
  );
};

const selectPendingSceneEditorDraftSections = (store) => {
  const draftSections = store.selectPendingDraftSections?.();
  if (Array.isArray(draftSections)) {
    return draftSections.filter(hasPendingSceneEditorDraftChanges);
  }

  const draftSection = store.selectDraftSection?.();
  return hasPendingSceneEditorDraftChanges(draftSection) ? [draftSection] : [];
};

const selectSceneEditorDraftSectionByTarget = (store, draftSection) => {
  if (!draftSection?.sectionId) {
    return undefined;
  }

  return (
    store.selectDraftSectionBySectionId?.({
      sectionId: draftSection.sectionId,
    }) ||
    (store.selectDraftSection?.()?.sectionId === draftSection.sectionId
      ? store.selectDraftSection()
      : undefined)
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
  const syncDraftInput = (deps, { liveLines, sectionId } = {}) => {
    if (Array.isArray(liveLines) && liveLines.length > 0) {
      return syncDraftSectionFromLines(deps, liveLines, { sectionId });
    }

    return syncDraftSectionFromLiveEditor(deps, { sectionId });
  };

  const flushSceneEditorDrafts = async (
    deps,
    {
      liveLines,
      sectionId,
      showErrorAlert = true,
      rescheduleReason = "text",
      force = false,
      deferIfInFlight = !force,
      enforceMinInterval = !force,
    } = {},
  ) => {
    const { store } = deps;
    const targetSectionId = sectionId || store.selectSelectedSectionId?.();
    clearScheduledDraftFlush(store);
    syncDraftInput(deps, { liveLines, sectionId: targetSectionId });

    const pendingDraftSections = selectPendingSceneEditorDraftSections(store);
    if (pendingDraftSections.length === 0) {
      store.setDraftSavePendingSinceAt({ timestamp: 0 });
      return;
    }

    const draftReason = getSceneEditorDraftReason(
      pendingDraftSections[0],
      rescheduleReason,
    );

    if (
      enforceMinInterval &&
      getSceneEditorDraftFlushThrottleDelayMs(store, {
        reason: draftReason,
        nowMs,
        owner: deps.projectService,
        timing,
      }) > 0
    ) {
      scheduleSceneEditorDraftFlush(deps, {
        reason: draftReason,
      });
      return;
    }

    if (deferIfInFlight && store.selectDraftFlushInFlight?.()) {
      scheduleSceneEditorDraftFlush(deps, {
        reason: draftReason,
      });
      return;
    }

    store.setDraftFlushInFlight?.({ value: true });
    try {
      return await enqueueLatestSceneEditorPersistence({
        owner: deps.projectService,
        key: "draft-flush",
        task: async () => {
          syncDraftInput(deps, { liveLines, sectionId: targetSectionId });
          const taskDraftSections =
            selectPendingSceneEditorDraftSections(store);
          if (taskDraftSections.length === 0) {
            store.setDraftSavePendingSinceAt({ timestamp: 0 });
            return;
          }

          const taskDraftReason = getSceneEditorDraftReason(
            taskDraftSections[0],
            draftReason,
          );
          if (
            enforceMinInterval &&
            getSceneEditorDraftFlushThrottleDelayMs(store, {
              reason: taskDraftReason,
              nowMs,
              owner: deps.projectService,
              timing,
            }) > 0
          ) {
            scheduleSceneEditorDraftFlush(deps, {
              reason: taskDraftReason,
            });
            return;
          }

          const flushStartedAt = nowMs();
          const ownerTiming = getDraftFlushTiming(deps.projectService);
          ownerTiming.lastFlushStartedAt = flushStartedAt;
          store.setLastDraftFlushStartedAt({
            timestamp: flushStartedAt,
          });
          store.setDraftSavePendingSinceAt({ timestamp: 0 });

          try {
            let shouldReschedule = false;
            let nextRescheduleReason = taskDraftReason;

            for (const draftSection of taskDraftSections) {
              const snapshotLines = cloneSceneEditorLines(draftSection?.lines);
              if (snapshotLines.length === 0) {
                continue;
              }

              await deps.projectService.syncSectionLinesSnapshot({
                sectionId: draftSection?.sectionId,
                lines: snapshotLines,
              });
              syncStoreProjectState(store, deps.projectService);
              const currentDraftSection = selectSceneEditorDraftSectionByTarget(
                store,
                draftSection,
              );
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
                nextRescheduleReason = getSceneEditorDraftReason(
                  currentDraftSection,
                  rescheduleReason,
                );
                store.setDraftSection({
                  draftSection: rebaseSceneEditorDraftSection(
                    currentDraftSection,
                    {
                      revision,
                    },
                  ),
                });
                shouldReschedule = true;
                continue;
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

                if (
                  !store.selectSelectedSectionId ||
                  currentDraftSection?.sectionId ===
                    store.selectSelectedSectionId?.()
                ) {
                  reconcileCurrentEditorSession(deps);
                }
              }
            }

            if (shouldReschedule) {
              scheduleSceneEditorDraftFlush(deps, {
                reason: nextRescheduleReason,
              });
              return;
            }

            deps.render();
          } catch (error) {
            if (showErrorAlert) {
              const copy = selectSceneEditorCopy(deps.i18n);
              deps.appService?.showAlert({
                message:
                  copy.failedSaveSceneChanges ??
                  "Failed to save scene changes",
                title: copy.errorTitle ?? "Error",
              });
            }
            throw error;
          }
        },
      });
    } finally {
      store.setDraftFlushInFlight?.({ value: false });
    }
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

    const pendingDraftSections = selectPendingSceneEditorDraftSections(store);
    if (pendingDraftSections.length === 0) {
      store.setDraftSavePendingSinceAt({ timestamp: 0 });
      return;
    }

    const draftReason = getSceneEditorDraftReason(
      pendingDraftSections[0],
      reason,
    );

    if (store.selectDraftSavePendingSinceAt() <= 0) {
      store.setDraftSavePendingSinceAt({
        timestamp: nowMs(),
      });
    }

    if (immediate) {
      return flushSceneEditorDrafts(deps, {
        rescheduleReason: draftReason,
        force: true,
      });
    }

    const delayMs = getSceneEditorDraftSaveDelayMs(store, {
      reason: draftReason,
      nowMs,
      timing,
    });
    const timerId = setTimeout(() => {
      void flushSceneEditorDrafts(deps, {
        rescheduleReason: draftReason,
      }).catch(() => {});
    }, delayMs);
    store.setDraftSaveTimerId({ timerId });
  };

  const runSceneEditorPersistence = async (deps, task, options = {}) => {
    if (selectPendingSceneEditorDraftSections(deps.store).length > 0) {
      await flushSceneEditorDrafts(deps, {
        deferIfInFlight: true,
        enforceMinInterval: true,
        force: true,
      }).catch(() => {});
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
