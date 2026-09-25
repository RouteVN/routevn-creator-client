import { BehaviorSubject } from "rxjs";

export const BACKUP_INTERVAL_MS = 5 * 60 * 1000;
export const BACKUP_RESUME_DELAY_MS = 5 * 1000;

export const createBackupService = ({
  client,
  backupProject,
  beforeBackup,
  notify,
  schedule = setTimeout,
  unschedule = clearTimeout,
  now = Date.now,
}) => {
  // Loading until native status arrives, so the UI never shows an
  // unconfigured state for a configured folder.
  const state = new BehaviorSubject({
    configured: false,
    projects: [],
    loading: true,
  });
  let operation;
  let disableOperation;
  let cleanup;
  let lastWarning;
  let timer;
  // A new project waiting for a pass that skips the cooldown.
  let newProjectPending = false;
  let lastLocalAttemptAt = 0;
  let getCopy = () => ({});

  const remainingCooldown = () => {
    const previous = Math.max(
      state.value.lastAttemptAt ?? 0,
      lastLocalAttemptAt,
    );
    const elapsed = now() - previous;
    if (!previous || elapsed < 0) return 0;
    return Math.max(0, BACKUP_INTERVAL_MS - elapsed);
  };
  const cancelTimer = () => {
    if (timer !== undefined) unschedule(timer);
    timer = undefined;
  };
  const scheduleNext = (minimumDelay = 0) => {
    cancelTimer();
    if (
      !cleanup ||
      operation ||
      disableOperation ||
      !state.value.configured ||
      !client.isActive()
    )
      return;
    timer = schedule(
      () => {
        timer = undefined;
        void run(newProjectPending);
      },
      Math.max(minimumDelay, newProjectPending ? 0 : remainingCooldown()),
    );
  };

  const publish = (status) => {
    state.next(status);
    return status;
  };
  const refresh = async () => {
    try {
      return publish(await client.status());
    } catch {
      return publish({
        ...state.value,
        loading: false,
        error: "failed",
        running: false,
      });
    }
  };
  const initialize = async () => {
    const status = await refresh();
    // Startup does not wait for native status; schedule once it arrives.
    scheduleNext(BACKUP_RESUME_DELAY_MS);
    return status;
  };
  const warn = (error) => {
    if (error === lastWarning) return;
    lastWarning = error;
    if (error) {
      const copy = getCopy();
      notify({
        message: copy.errors?.[error] ?? copy.errors?.failed,
        status: "error",
      });
    }
  };
  const run = (manual = false) => {
    if (disableOperation) return Promise.resolve();
    if (operation) return operation;
    if (!state.value.configured || (!manual && !client.isActive()))
      return Promise.resolve();
    if (!manual && remainingCooldown() > 0) {
      scheduleNext();
      return Promise.resolve();
    }
    cancelTimer();
    // Keep failures throttled even if the bridge cannot persist/read the claim.
    lastLocalAttemptAt = now();
    operation = (async () => {
      let passError;
      try {
        const { due } = await client.beginPass(manual);
        if (!due) return;
        if (disableOperation || !client.isActive()) return;
        await beforeBackup();
        if (disableOperation || !client.isActive()) return;
        // This listing includes any new project; a pass that stops earlier
        // keeps the new project waiting for the next one.
        newProjectPending = false;
        const { projectIds } = await client.pendingProjects();
        if (projectIds.length) {
          publish({ ...state.value, running: true });
          for (const projectId of projectIds) {
            // A suspended WebView resumes at the next checkpoint. Finish the current
            // native publication, but do not start another project in the background.
            if (disableOperation || !client.isActive()) break;
            try {
              await backupProject(projectId);
            } catch (error) {
              passError = error.code ?? "failed";
            }
          }
        }
      } catch (error) {
        passError = error.code ?? "failed";
        // A failed pass falls back to the interval instead of retrying at once.
        newProjectPending = false;
      } finally {
        const status = await refresh();
        const error =
          passError ??
          status.error ??
          status.projects.find((project) => project.error)?.error;
        if (passError) publish({ ...status, error: passError });
        if (!disableOperation) warn(error);
      }
    })().finally(() => {
      operation = undefined;
      scheduleNext();
    });
    return operation;
  };

  return {
    initialize,
    getStatus: () => state.value,
    subscribe: (listener) => state.subscribe(listener),
    refresh,
    run,
    async configure(payload) {
      if (disableOperation) await disableOperation;
      if (operation) await operation;
      const status = await client.configure(payload);
      if (status.needsExistingConfirmation) return status;
      publish(status);
      void run(true);
      return status;
    },
    // Back up a newly created or imported project after the screen settles,
    // without waiting for the interval. A running pass may have listed its
    // projects already, so the follow-up pass starts when it finishes.
    backupNewProject() {
      newProjectPending = true;
      scheduleNext(BACKUP_RESUME_DELAY_MS);
    },
    disable() {
      if (disableOperation) return disableOperation;
      cancelTimer();
      disableOperation = (async () => {
        // Finish publication of the current project safely; skip the rest of
        // the pass before forgetting its destination.
        if (operation) await operation;
        const status = await client.disable();
        newProjectPending = false;
        lastLocalAttemptAt = 0;
        lastWarning = undefined;
        return publish(status);
      })().finally(() => {
        disableOperation = undefined;
        scheduleNext();
      });
      return disableOperation;
    },
    start(copyProvider) {
      if (cleanup) return cleanup;
      getCopy = copyProvider;
      const unsubscribe = client.subscribeActive((active) => {
        if (active) scheduleNext(BACKUP_RESUME_DELAY_MS);
        else cancelTimer();
      });
      cleanup = () => {
        cancelTimer();
        unsubscribe();
        cleanup = undefined;
      };
      // Never start backup I/O in the opening/resuming event itself. Allow the
      // screen to paint first, without making navigation await this work.
      scheduleNext(BACKUP_RESUME_DELAY_MS);
      return cleanup;
    },
  };
};
