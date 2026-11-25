import { BehaviorSubject } from "rxjs";
import { findBackupProblem } from "../../../internal/backupStatus.js";

// Native code decides when to back up, runs the backups, and pushes status
// updates. This service mirrors that status for the UI and forwards requests;
// it never waits for backup work, so startup and setup are never held up.
export const createBackupService = ({ client }) => {
  // Loading until native status arrives, so the UI never shows an
  // unconfigured state for a configured folder.
  const state = new BehaviorSubject({
    configured: false,
    projects: [],
    loading: true,
  });
  let unsubscribeStatus;

  const publish = (status) => {
    // A reply can arrive after a newer pushed update; keep the newer one.
    if ((status.version ?? 0) < (state.value.version ?? 0)) return state.value;
    state.next(status);
    return status;
  };
  const refresh = async () => {
    try {
      return publish(await client.status());
    } catch {
      return publish({ ...state.value, loading: false });
    }
  };

  return {
    initialize() {
      unsubscribeStatus ??= client.subscribeStatus(publish);
      return refresh();
    },
    getStatus: () => state.value,
    subscribe: (listener) => state.subscribe(listener),
    refresh,
    async configure(payload) {
      const status = await client.configure(payload);
      if (!status.needsExistingConfirmation) publish(status);
      return status;
    },
    async disable() {
      return publish(await client.disable());
    },
    async backupNow(projectId) {
      return publish(await client.request({ projectId, reason: "manual" }));
    },
    // Native code also notices the new project's first writes; this only
    // makes the first backup start a few seconds sooner.
    backupNewProject() {
      void Promise.resolve()
        .then(() => client.request({ reason: "newProject" }))
        .catch(() => {});
    },
    setNotificationCopy(copy) {
      void Promise.resolve()
        .then(() => client.setNotificationCopy(copy))
        .catch(() => {});
    },
    // Calls onProblem once each time backups start needing the user, and
    // again only after the problem has cleared or changed.
    watchProblems(onProblem) {
      let shownError;
      const subscription = state.subscribe((status) => {
        const problem = findBackupProblem(status);
        if (!problem) {
          shownError = undefined;
          return;
        }
        if (problem.error === shownError) return;
        shownError = problem.error;
        onProblem(problem);
      });
      return () => subscription.unsubscribe();
    },
  };
};
