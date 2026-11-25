import { interval } from "rxjs";

// Times such as "5 min ago" move on even when no backup runs.
const RELATIVE_TIME_REFRESH_MS = 30_000;

export const handleBeforeMount = (deps) => {
  const { appService, store, render } = deps;
  const subscription = appService.subscribeBackup((status) => {
    store.setStatus({
      status,
      currentProjectId: appService.getCurrentProjectId(),
    });
    render();
  });
  subscription.add(
    interval(RELATIVE_TIME_REFRESH_MS).subscribe(() => render()),
  );
  void appService.refreshBackupStatus();
  return () => subscription.unsubscribe();
};

export const handleSetup = ({ appService }) => {
  appService.navigate("/project-folder-setup", { from: "config" });
};

export const handleBackUpNow = async (deps) => {
  const { appService, store, render, i18n } = deps;
  if (store.selectIsStarting()) return;
  store.setStarting({ starting: true });
  render();
  try {
    await appService.backupNow(store.selectCurrentProjectId());
  } catch {
    appService.showToast({
      status: "error",
      message: i18n.androidBackup.backUpNowError,
    });
  } finally {
    store.setStarting({ starting: false });
    render();
  }
};
