import { callAndroidBridge } from "./bridge.js";
import { createAutomaticUpdateChecks } from "../automaticUpdateChecks.js";
import { createProgressDialog } from "../progressDialog.js";

export const createAndroidUpdater = async ({
  globalUI,
  keyValueStore,
  browserEventsClient,
  beforeInstall,
  getCopy,
  bridge = callAndroidBridge,
  isForeground = () => globalThis.document?.visibilityState !== "hidden",
}) => {
  try {
    const support = await bridge("getAppUpdateSupport");
    if (support.status !== "supported") return;
  } catch {
    // Older shells and installations without Play keep working without an updater.
    return;
  }

  let supported = true;
  let operation;
  let updateInfo;
  let pendingReady;
  let lastReadyPromptVersion;
  let manualCheckRequested = false;

  const showWhenIdle = (show) =>
    globalUI.runWhenIdle(() => {
      if (isForeground()) return show();
    });
  const showAlert = (options) =>
    showWhenIdle(() => globalUI.showAlert(options));
  const showConfirm = (options) =>
    showWhenIdle(() => globalUI.showConfirm(options));

  const showError = (copy) =>
    showAlert({
      title: copy.errorTitle ?? "Error",
      message:
        copy.googlePlayUpdateFailed ??
        "Could not update through Google Play. Please try again.",
    });

  const promptInstall = async (info, copy) => {
    const install = await showWhenIdle(() => {
      lastReadyPromptVersion = info.versionCode;
      return globalUI.showConfirm({
        title: copy.updateAvailableTitle ?? "Update Available",
        message:
          copy.googlePlayUpdateReady ??
          "The update is ready. Restart RouteVN Creator to install it?",
        confirmText: copy.restartToUpdateButton ?? "Restart and Update",
        cancelText: copy.laterButton ?? "Later",
      });
    });
    if (!install || !isForeground()) return;
    const progress = createProgressDialog({
      id: "routevn-update-progress-dialog",
      title: copy.updateInstallingMessage ?? "Installing update...",
    });
    try {
      await beforeInstall();
      // Work can start after confirmation while editor/settings saves drain.
      // The updater's own progress dialog intentionally is not a work blocker.
      await globalUI.runWhenIdle(async () => {
        if (!isForeground()) return;
        const result = await bridge("completeAppUpdate");
        if (result.status !== "installing")
          throw new Error("Update installation did not start.");
      });
    } finally {
      progress.close();
    }
  };

  const performCheck = async (silent, copy) => {
    let userAccepted = false;
    try {
      updateInfo = await bridge("checkAppUpdate");
      if (!isForeground()) return updateInfo;
      const { status } = updateInfo;
      if (status === "unsupported") {
        supported = false;
        if (!silent || manualCheckRequested)
          await showAlert({
            title: copy.updateAvailableTitle ?? "Update Available",
            message:
              copy.googlePlayUpdatesUnavailable ??
              "Google Play updates are unavailable for this installation.",
          });
      } else if (status === "downloaded") {
        // Errors after offering installation should be visible even on automatic checks.
        userAccepted = true;
        await promptInstall(updateInfo, copy);
      } else if (status === "available") {
        userAccepted = await showConfirm({
          title: copy.updateAvailableTitle ?? "Update Available",
          message:
            copy.googlePlayUpdateAvailable ??
            "A new version of RouteVN Creator is available on Google Play.",
          confirmText: copy.updateNowButton ?? "Update Now",
          cancelText: copy.laterButton ?? "Later",
        });
        if (userAccepted && isForeground()) {
          updateInfo = await bridge("startAppUpdate");
          if (updateInfo.status === "downloaded")
            await promptInstall(updateInfo, copy);
          else if (
            !["downloading", "cancelled", "up-to-date"].includes(
              updateInfo.status,
            )
          ) {
            throw new Error("Google Play could not start the update.");
          }
        }
      } else if (!silent || manualCheckRequested) {
        if (status === "up-to-date")
          await showAlert({
            title: copy.upToDateTitle ?? "Up to Date",
            message:
              copy.latestVersionMessage ??
              "You are already on the latest version",
          });
        else if (status === "downloading" || status === "installing")
          await showAlert({
            title: copy.updateDownloadTitle ?? "Downloading update",
            message:
              copy.googlePlayUpdateInProgress ??
              "Google Play is updating RouteVN Creator. You can continue working while it downloads.",
          });
        else await showError(copy);
      }
      return updateInfo;
    } catch (error) {
      console.error("Google Play update failed:", error);
      if (!silent || manualCheckRequested || userAccepted)
        await showError(copy);
    }
  };

  const checkForUpdates = (silent = false, options = {}) => {
    if (!supported || !isForeground()) return Promise.resolve();
    if (!silent) manualCheckRequested = true;
    if (operation) return operation;
    operation = performCheck(silent, options.copy ?? getCopy()).finally(() => {
      operation = undefined;
      manualCheckRequested = false;
      const ready = pendingReady;
      pendingReady = undefined;
      if (ready && ready.versionCode !== lastReadyPromptVersion)
        handleUpdateState(ready);
    });
    return operation;
  };

  const handleUpdateState = (info) => {
    if (!isForeground() || !supported) return;
    if (
      info.status === "downloaded" &&
      info.versionCode !== lastReadyPromptVersion
    ) {
      if (operation) {
        pendingReady = info;
        return;
      }
      operation = promptInstall(info, getCopy())
        .catch(() => showError(getCopy()))
        .finally(() => {
          operation = undefined;
        });
    } else if (info.status === "failed") {
      void showError(getCopy());
    }
  };

  browserEventsClient.subscribeWindowEvent({
    type: "routevn:android-update",
    listener: ({ detail }) => handleUpdateState(detail),
  });

  return {
    checkForUpdates,
    startAutomaticChecks: createAutomaticUpdateChecks({
      checkForUpdates,
      keyValueStore,
      shouldCheck: isForeground,
    }),
    isSupported: () => supported,
    getUpdateInfo: () => updateInfo,
    isUpdateAvailable: () =>
      ["available", "downloaded"].includes(updateInfo?.status),
  };
};
