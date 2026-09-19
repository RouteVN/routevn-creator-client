import { createAutomaticUpdateChecks } from "../automaticUpdateChecks.js";
import { formatUpdateMessage } from "../clientUpdates.js";
import { ROUTEVN_CREATOR_APP_STORE_URL } from "../../../internal/routevnUrls.js";

export const createIOSUpdater = ({
  globalUI,
  keyValueStore,
  metadataClient,
  openUrl,
  getCopy,
  isForeground = () => globalThis.document?.visibilityState !== "hidden",
}) => {
  let operation;
  let updateInfo;
  let manualCheckRequested = false;
  const showWhenIdle = (show) =>
    globalUI.runWhenIdle(() => {
      if (isForeground()) return show();
    });

  const openStore = async (copy) => {
    try {
      if (isForeground()) await openUrl(ROUTEVN_CREATOR_APP_STORE_URL);
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
    if (accepted) await openStore(copy);
  };

  const performCheck = async (silent, copy) => {
    updateInfo = undefined;
    try {
      if (!metadataClient)
        throw new Error("Update metadata bridge unavailable.");
      updateInfo = await metadataClient.check();
    } catch {
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
      if (accepted) await openStore(copy);
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
      } else await offerStoreFallback(copy);
    }
    return updateInfo;
  };

  const checkForUpdates = (silent = false, options = {}) => {
    if (!isForeground()) return Promise.resolve();
    if (!silent) manualCheckRequested = true;
    if (operation) return operation;
    operation = performCheck(silent, options.copy ?? getCopy()).finally(() => {
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
