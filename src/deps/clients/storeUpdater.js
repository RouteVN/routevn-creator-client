import { createAutomaticUpdateChecks } from "./automaticUpdateChecks.js";
import { formatUpdateMessage } from "./clientUpdates.js";
import { createUpdateCheckProgress } from "./updateCheckProgress.js";

export const createStoreUpdater = ({
  globalUI,
  keyValueStore,
  metadataClient,
  openUrl,
  getCopy,
  fallbackStoreUrl,
  isForeground = () => globalThis.document?.visibilityState !== "hidden",
}) => {
  let operation;
  let updateInfo;
  let manualCheckRequested = false;
  let checkingResponse = false;
  let checkProgress;
  const closeCheckProgress = () => {
    checkingResponse = false;
    checkProgress?.close();
    checkProgress = undefined;
  };
  const showWhenIdle = (show) =>
    globalUI.runWhenIdle(() => {
      if (isForeground()) return show();
    });

  const openStore = async (copy, url) => {
    try {
      if (isForeground()) await openUrl(url);
    } catch {
      await showWhenIdle(() =>
        globalUI.showAlert({
          title: copy.errorTitle ?? "Error",
          message: copy.failedOpenLink ?? "Failed to open link.",
        }),
      );
    }
  };

  const offerStoreFallback = async (copy) => {
    if (!fallbackStoreUrl) {
      await showWhenIdle(() =>
        globalUI.showAlert({
          title: copy.errorTitle ?? "Error",
          message:
            copy.retrieveUpdateInfoFallback ??
            "Could not retrieve update information.",
        }),
      );
      return;
    }
    const accepted = await showWhenIdle(() =>
      globalUI.showConfirm({
        title: copy.errorTitle ?? "Error",
        message:
          copy.retrieveUpdateInfoFallback ??
          "Could not retrieve update information.",
        confirmText: copy.updateNowButton ?? "Update Now",
        cancelText: copy.laterButton ?? "Later",
      }),
    );
    if (accepted) await openStore(copy, fallbackStoreUrl);
  };

  const performCheck = async (silent, copy) => {
    updateInfo = undefined;
    try {
      if (!metadataClient) throw new Error("Update metadata is unavailable.");
      updateInfo = await metadataClient.check();
      closeCheckProgress();
    } catch {
      closeCheckProgress();
      if (!silent || manualCheckRequested) await offerStoreFallback(copy);
      return;
    }
    if (updateInfo.status === "updateAvailable") {
      const accepted = await showWhenIdle(() =>
        globalUI.showConfirm({
          title: copy.updateAvailableTitle ?? "Update Available",
          message: formatUpdateMessage(copy, updateInfo.release),
          confirmText: copy.updateNowButton ?? "Update Now",
          cancelText: copy.laterButton ?? "Later",
        }),
      );
      if (accepted) await openStore(copy, updateInfo.release.installation.url);
    } else if (!silent || manualCheckRequested) {
      if (
        updateInfo.status === "noUpdate" &&
        updateInfo.reason === "upToDate"
      ) {
        await showWhenIdle(() =>
          globalUI.showAlert({
            title:
              copy.upToDateTitle ?? copy.updateAvailableTitle ?? "Up to Date",
            message:
              copy.latestVersionMessage ??
              "You are already on the latest version",
          }),
        );
      } else {
        await showWhenIdle(() =>
          globalUI.showAlert({
            title: copy.updateUnavailableTitle ?? "Updates unavailable",
            message:
              updateInfo.status === "unsupportedClient"
                ? (copy.updateUnsupportedMessage ??
                  "Update checks are not supported for this installation.")
                : (copy.noCompatibleUpdateMessage ??
                  "No compatible update is available for this installation."),
          }),
        );
      }
    }
    return updateInfo;
  };

  const checkForUpdates = (silent = false, options = {}) => {
    if (!isForeground()) return Promise.resolve();
    if (!silent) manualCheckRequested = true;
    if (operation) {
      if (!silent && checkingResponse)
        checkProgress ??= createUpdateCheckProgress(options.copy ?? getCopy());
      return operation;
    }
    const copy = options.copy ?? getCopy();
    checkingResponse = true;
    if (!silent) checkProgress = createUpdateCheckProgress(copy);
    operation = performCheck(silent, copy).finally(() => {
      closeCheckProgress();
      operation = undefined;
      manualCheckRequested = false;
    });
    return operation;
  };

  return {
    checkForUpdates,
    startAutomaticChecks: createAutomaticUpdateChecks({
      checkForUpdates,
      keyValueStore,
      shouldCheck: () => Boolean(metadataClient) && isForeground(),
    }),
    isSupported: () => true,
    getUpdateInfo: () => updateInfo,
    isUpdateAvailable: () => updateInfo?.status === "updateAvailable",
  };
};
