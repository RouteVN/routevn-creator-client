import { interval } from "rxjs";
import { withErrorDetails } from "../../internal/errorDetails.js";

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
  } catch (error) {
    appService.showAlert({
      message: withErrorDetails(
        i18n.androidBackup.backUpNowError,
        error,
        i18n.appPage.errorDetailsLabel,
      ),
    });
  } finally {
    store.setStarting({ starting: false });
    render();
  }
};
