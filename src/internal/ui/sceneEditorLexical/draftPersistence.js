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
import { withErrorDetails } from "../../errorDetails.js";
import { isStorageFullError } from "../../storageFullError.js";
import {
  emitSceneEditorTiming,
  getSceneEditorTimingDurationMs,
  getSceneEditorTimingNow,
} from "../sceneEditor/sceneEditorTiming.js";

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

// Saving reports a refusal as a `{ valid: false, error }` result and an
// unexpected failure as a thrown error; both come out as an Error.
const toSaveError = (failure) => {
  if (failure instanceof Error) {
    return failure;
  }

  const error = new Error(failure?.message ?? "Failed to save scene changes");
  error.code = failure?.code;
  return error;
};

// Saves a draft section's lines once and resolves to the Error when that
// failed, or undefined when it succeeded. A failed save is not repeated: a
// failure can come after part of the commands were stored, and saving them
// again would store them twice.
const saveDraftSectionLines = async (deps, { draftSection, snapshotLines }) => {
  try {
    const result = await deps.projectService.syncSectionLinesSnapshot({
      sectionId: draftSection?.sectionId,
      lines: snapshotLines,
      actionLineIds: draftSection?.actionLineIds,
    });
    return result?.valid === false ? toSaveError(result.error) : undefined;
  } catch (error) {
    return toSaveError(error);
  }
};

const notifyDraftSaveFailure = (deps, { error, sceneName, sectionName }) => {
  const { appService, i18n } = deps;
  const copy = selectSceneEditorCopy(i18n);
  // A full device is not a bug in the app: the message tells the user to free
  // up space, and the failure is not reported.
  const storageFull = isStorageFullError(error);
  const message = (
    storageFull
      ? (copy.failedSaveSectionChangesStorageFull ??
        "Your latest changes to section “{sectionName}” in scene “{sceneName}” could not be saved because this device is out of storage space, and they were removed. Free up some space, then enter them again.")
      : (copy.failedSaveSectionChangesDiscarded ??
        "Your latest changes to section “{sectionName}” in scene “{sceneName}” could not be saved and were removed. Please enter them again.")
  )
    .replaceAll("{sectionName}", sectionName)
    .replaceAll("{sceneName}", sceneName);

  console.error("[sceneEditor] Failed to save scene changes", error);
  if (!storageFull) {
    appService.reportError(error, {
      operation: "sceneEditor.saveDraft",
      code: error.code,
    });
  }
  appService.showAlertWhenIdle({
    title: copy.errorTitle ?? "Error",
    message: withErrorDetails(
      message,
      error,
      copy.errorDetailsLabel ?? "Details:",
    ),
  });
};

export const createSceneEditorDraftPersistence = ({
  // Brings a section's draft up to date from the editor showing that section,
  // never from another section's editor.
  syncDraftSectionFromLiveEditor = (deps) => deps.store.selectDraftSection(),
  syncStoreProjectState = () => {},
  reconcileCurrentEditorSession = () => {},
  // Called for a draft section that could not be saved. It must put the
  // section, and the editor showing it, back to the stored lines, so the user
  // does not keep building on lines that were never stored.
  revertFailedDraftSection = async () => {},
  // The names to tell the user which section lost its changes.
  describeDraftSection = () => ({ sceneName: "", sectionName: "" }),
  onDidFlush = async () => {},
  nowMs = defaultNowMs,
  timing = DEFAULT_SCENE_EDITOR_DRAFT_SAVE_TIMING,
} = {}) => {
  const flushSceneEditorDrafts = async (
    deps,
    {
      sectionId,
      showErrorAlert = true,
      rescheduleReason = "text",
      force = false,
      deferIfInFlight = !force,
      enforceMinInterval = !force,
    } = {},
  ) => {
    const { store } = deps;
    const timingFlushStartedAt = getSceneEditorTimingNow();
    const targetSectionId = sectionId || store.selectSelectedSectionId?.();
    clearScheduledDraftFlush(store);
    const initialSyncStartedAt = getSceneEditorTimingNow();
    syncDraftSectionFromLiveEditor(deps, { sectionId: targetSectionId });
    const initialSyncDurationMs =
      getSceneEditorTimingDurationMs(initialSyncStartedAt);

    const pendingDraftSections = selectPendingSceneEditorDraftSections(store);
    if (pendingDraftSections.length === 0) {
      store.setDraftSavePendingSinceAt({ timestamp: 0 });
      emitSceneEditorTiming("draft.flush.skipped", {
        durationMs: getSceneEditorTimingDurationMs(timingFlushStartedAt),
        reason: "no-pending-drafts",
        targetSectionId,
        initialSyncDurationMs,
      });
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
      emitSceneEditorTiming("draft.flush.deferred", {
        durationMs: getSceneEditorTimingDurationMs(timingFlushStartedAt),
        reason: "min-interval",
        targetSectionId,
        draftReason,
        pendingSectionCount: pendingDraftSections.length,
        initialSyncDurationMs,
      });
      return;
    }

    if (deferIfInFlight && store.selectDraftFlushInFlight?.()) {
      scheduleSceneEditorDraftFlush(deps, {
        reason: draftReason,
      });
      emitSceneEditorTiming("draft.flush.deferred", {
        durationMs: getSceneEditorTimingDurationMs(timingFlushStartedAt),
        reason: "in-flight",
        targetSectionId,
        draftReason,
        pendingSectionCount: pendingDraftSections.length,
        initialSyncDurationMs,
      });
      return;
    }

    store.setDraftFlushInFlight?.({ value: true });
    try {
      return await enqueueLatestSceneEditorPersistence({
        owner: deps.projectService,
        key: "draft-flush",
        task: async () => {
          const taskStartedAt = getSceneEditorTimingNow();
          const taskSyncStartedAt = getSceneEditorTimingNow();
          // The editor may have changed while this save waited, or been put
          // back to the stored lines by a failed save, so read it again.
          syncDraftSectionFromLiveEditor(deps, { sectionId: targetSectionId });
          const taskSyncDurationMs =
            getSceneEditorTimingDurationMs(taskSyncStartedAt);
          const taskDraftSections =
            selectPendingSceneEditorDraftSections(store);
          if (taskDraftSections.length === 0) {
            store.setDraftSavePendingSinceAt({ timestamp: 0 });
            emitSceneEditorTiming("draft.flush.skipped", {
              durationMs: getSceneEditorTimingDurationMs(taskStartedAt),
              reason: "no-pending-drafts-in-task",
              targetSectionId,
              taskSyncDurationMs,
            });
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
            emitSceneEditorTiming("draft.flush.deferred", {
              durationMs: getSceneEditorTimingDurationMs(taskStartedAt),
              reason: "task-min-interval",
              targetSectionId,
              draftReason: taskDraftReason,
              pendingSectionCount: taskDraftSections.length,
              taskSyncDurationMs,
            });
            return;
          }

          return saveDraftSections(deps, {
            draftSections: taskDraftSections,
            draftReason: taskDraftReason,
            rescheduleReason,
            showErrorAlert,
            targetSectionId,
            taskStartedAt,
            taskSyncDurationMs,
          });
        },
      });
    } finally {
      store.setDraftFlushInFlight?.({ value: false });
    }
  };

  // Saves each draft section with the lines it has here, in order. A section
  // that cannot be saved is put back to its stored lines and reported, and
  // the others still save. A section whose draft changed meanwhile stays
  // pending and is saved again later.
  const saveDraftSections = async (
    deps,
    {
      draftSections,
      draftReason,
      rescheduleReason,
      showErrorAlert,
      targetSectionId,
      taskStartedAt,
      taskSyncDurationMs,
    },
  ) => {
    const { store } = deps;
    const taskSections = [];
    const flushStartedAt = nowMs();
    const ownerTiming = getDraftFlushTiming(deps.projectService);
    ownerTiming.lastFlushStartedAt = flushStartedAt;
    store.setLastDraftFlushStartedAt({
      timestamp: flushStartedAt,
    });
    store.setDraftSavePendingSinceAt({ timestamp: 0 });

    try {
      let shouldReschedule = false;
      let nextRescheduleReason = draftReason;

      for (const draftSection of draftSections) {
        const sectionTimingStartedAt = getSceneEditorTimingNow();
        const cloneStartedAt = getSceneEditorTimingNow();
        const snapshotLines = cloneSceneEditorLines(draftSection?.lines);
        const cloneDurationMs = getSceneEditorTimingDurationMs(cloneStartedAt);
        if (snapshotLines.length === 0) {
          taskSections.push({
            sectionId: draftSection?.sectionId,
            lineCount: 0,
            cloneDurationMs,
            skipped: true,
          });
          continue;
        }

        const syncSnapshotStartedAt = getSceneEditorTimingNow();
        const saveError = await saveDraftSectionLines(deps, {
          draftSection,
          snapshotLines,
        });
        const syncSnapshotDurationMs = getSceneEditorTimingDurationMs(
          syncSnapshotStartedAt,
        );
        if (saveError) {
          // Fail fast: drop only this section's unsaved changes and say
          // so at once. Other sections still save, and the user carries
          // on from the lines that are stored.
          const { sceneName, sectionName } = describeDraftSection(
            deps,
            draftSection,
          );
          await revertFailedDraftSection(deps, {
            draftSection,
            error: saveError,
          });
          notifyDraftSaveFailure(deps, {
            error: saveError,
            sceneName,
            sectionName,
          });
          taskSections.push({
            sectionId: draftSection?.sectionId,
            lineCount: snapshotLines.length,
            cloneDurationMs,
            syncSnapshotDurationMs,
            failed: true,
            errorCode: saveError.code,
          });
          continue;
        }
        const storeSyncStartedAt = getSceneEditorTimingNow();
        syncStoreProjectState(store, deps.projectService);
        const storeSyncDurationMs =
          getSceneEditorTimingDurationMs(storeSyncStartedAt);
        const currentDraftSection = selectSceneEditorDraftSectionByTarget(
          store,
          draftSection,
        );
        const revision = store.selectRepositoryRevision();
        const isSameDraftTarget =
          currentDraftSection?.sceneId === draftSection?.sceneId &&
          currentDraftSection?.sectionId === draftSection?.sectionId;
        const equalityStartedAt = getSceneEditorTimingNow();
        const didDraftAdvance =
          isSameDraftTarget &&
          !areSceneEditorLinesEqual(currentDraftSection?.lines, snapshotLines);
        const equalityDurationMs =
          getSceneEditorTimingDurationMs(equalityStartedAt);
        taskSections.push({
          sectionId: draftSection?.sectionId,
          lineCount: snapshotLines.length,
          cloneDurationMs,
          syncSnapshotDurationMs,
          storeSyncDurationMs,
          equalityDurationMs,
          didDraftAdvance,
          durationMs: getSceneEditorTimingDurationMs(sectionTimingStartedAt),
        });

        if (didDraftAdvance) {
          nextRescheduleReason = getSceneEditorDraftReason(
            currentDraftSection,
            rescheduleReason,
          );
          store.setDraftSection({
            draftSection: rebaseSceneEditorDraftSection(currentDraftSection, {
              revision,
            }),
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
            currentDraftSection?.sectionId === store.selectSelectedSectionId?.()
          ) {
            reconcileCurrentEditorSession(deps);
          }
        }
      }

      if (shouldReschedule) {
        scheduleSceneEditorDraftFlush(deps, {
          reason: nextRescheduleReason,
        });
        emitSceneEditorTiming("draft.flush.rescheduled", {
          durationMs: getSceneEditorTimingDurationMs(taskStartedAt),
          targetSectionId,
          draftReason,
          pendingSectionCount: draftSections.length,
          taskSyncDurationMs,
          sections: taskSections,
        });
        return;
      }

      await onDidFlush(deps);

      const renderStartedAt = getSceneEditorTimingNow();
      deps.render();
      const renderDurationMs = getSceneEditorTimingDurationMs(renderStartedAt);
      emitSceneEditorTiming("draft.flush.complete", {
        durationMs: getSceneEditorTimingDurationMs(taskStartedAt),
        targetSectionId,
        draftReason,
        pendingSectionCount: draftSections.length,
        taskSyncDurationMs,
        renderDurationMs,
        sections: taskSections,
      });
    } catch (error) {
      if (showErrorAlert) {
        const copy = selectSceneEditorCopy(deps.i18n);
        deps.appService?.showAlert({
          message:
            copy.failedSaveSceneChanges ?? "Failed to save scene changes",
          title: copy.errorTitle ?? "Error",
        });
      }
      throw error;
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
    const scheduleStartedAt = getSceneEditorTimingNow();
    clearScheduledDraftFlush(store);

    const pendingDraftSections = selectPendingSceneEditorDraftSections(store);
    if (pendingDraftSections.length === 0) {
      store.setDraftSavePendingSinceAt({ timestamp: 0 });
      emitSceneEditorTiming("draft.flush.schedule-skipped", {
        durationMs: getSceneEditorTimingDurationMs(scheduleStartedAt),
        reason: "no-pending-drafts",
      });
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
      emitSceneEditorTiming("draft.flush.schedule", {
        durationMs: getSceneEditorTimingDurationMs(scheduleStartedAt),
        immediate: true,
        draftReason,
        pendingSectionCount: pendingDraftSections.length,
      });
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
    emitSceneEditorTiming("draft.flush.schedule", {
      durationMs: getSceneEditorTimingDurationMs(scheduleStartedAt),
      immediate: false,
      draftReason,
      delayMs,
      pendingSectionCount: pendingDraftSections.length,
    });
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

  // Runs `command` in the save queue and resolves to its result. It takes its
  // place in the queue at once, so a later save runs after it and a wait for
  // the queue covers it. When its turn comes, the pending drafts are saved
  // first, without waiting for the save interval, and in the same turn, so
  // that no other save comes between them. When that draft save fails
  // outright, which it reports, the command does not run.
  const runAfterSceneEditorDraftSave = (deps, { sectionId } = {}, command) =>
    enqueueSceneEditorPersistence({
      owner: deps.projectService,
      task: async () => {
        const { store } = deps;
        if (selectPendingSceneEditorDraftSections(store).length > 0) {
          const taskStartedAt = getSceneEditorTimingNow();
          const targetSectionId =
            sectionId || store.selectSelectedSectionId?.();
          syncDraftSectionFromLiveEditor(deps, { sectionId: targetSectionId });
          const draftSections = selectPendingSceneEditorDraftSections(store);
          try {
            await saveDraftSections(deps, {
              draftSections,
              draftReason: getSceneEditorDraftReason(draftSections[0]),
              rescheduleReason: "text",
              showErrorAlert: true,
              targetSectionId,
              taskStartedAt,
              taskSyncDurationMs: 0,
            });
          } catch {
            return undefined;
          }
        }
        return command();
      },
    });

  // Resolves once every save already queued for the project has run, such as
  // a line action still being written.
  const waitForSceneEditorPersistence = (deps) =>
    enqueueSceneEditorPersistence({
      owner: deps.projectService,
      task: async () => {},
    });

  return {
    cancelSceneEditorDraftFlush,
    flushSceneEditorDrafts,
    waitForSceneEditorPersistence,
    getDraftSaveDelayMs: (store, options = {}) =>
      getSceneEditorDraftSaveDelayMs(store, {
        nowMs,
        timing,
        ...options,
      }),
    runAfterSceneEditorDraftSave,
    runSceneEditorPersistence,
    scheduleSceneEditorDraftFlush,
  };
};
