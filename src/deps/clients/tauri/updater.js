import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { createProgressDialog } from "../progressDialog.js";
import { isMacosHost } from "./platform.js";

const formatUpdaterCopy = (template, values = {}) => {
  return String(template || "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) =>
    values[key] === undefined ? match : String(values[key]),
  );
};

const resolveUpdaterCopy = (options = {}) => {
  return options.copy ?? options ?? {};
};

const UPDATE_PROGRESS_DIALOG_ID = "routevn-update-progress-dialog";

const createUpdateProgressDialog = (copy = {}) => {
  const progressDialog = createProgressDialog({
    id: UPDATE_PROGRESS_DIALOG_ID,
    title: copy.updateDownloadTitle ?? "Downloading update",
    message:
      copy.updateDownloadMessage ??
      "Keep RouteVN Creator open. It will restart when the update is ready.",
    status: copy.updateDownloadProgressUnknown ?? "Downloading...",
  });

  const update = ({ progress, installing = false } = {}) => {
    if (installing) {
      progressDialog.update({
        status: copy.updateInstallingMessage ?? "Installing update...",
      });
      return;
    }

    if (Number.isFinite(progress)) {
      const percent = Math.max(0, Math.min(100, Math.round(progress)));
      progressDialog.update({
        status: formatUpdaterCopy(
          copy.updateDownloadProgressMessage ?? "{progress}% downloaded",
          { progress: percent },
        ),
      });
      return;
    }

    progressDialog.update({
      status: copy.updateDownloadProgressUnknown ?? "Downloading...",
    });
  };

  return {
    close: progressDialog.close,
    update,
  };
};

const createUpdater = ({ globalUI, keyValueStore }) => {
  let updateAvailable = false;
  let updateInfo = null;
  let downloadProgress = 0;

  const checkForUpdates = async (silent = false, options = {}) => {
    const copy = resolveUpdaterCopy(options);
    try {
      const update = await check(
        isMacosHost()
          ? {
              target: "macos-universal",
            }
          : undefined,
      );

      if (!update) {
        if (!silent && globalUI) {
          await globalUI.showAlert({
            message:
              copy.latestVersionMessage ??
              "You are already on the latest version",
            title: copy.upToDateTitle ?? "Up to Date",
          });
        }
        return null;
      }

      updateAvailable = true;
      updateInfo = {
        version: update.version,
        date: update.date,
        body: update.body,
      };

      if (globalUI) {
        const shouldUpdate = await globalUI.showConfirm({
          message: formatUpdaterCopy(
            copy.updateAvailableMessage ??
              "Update {version} is available!\n\nRelease notes:\n{releaseNotes}",
            {
              version: update.version,
              releaseNotes: update.body ?? "",
            },
          ),
          title: copy.updateAvailableTitle ?? "Update Available",
          confirmText: copy.updateNowButton ?? "Update Now",
          cancelText: copy.laterButton ?? "Later",
        });

        if (shouldUpdate) {
          await downloadAndInstall(update, copy);
        }
      }

      return updateInfo;
    } catch (error) {
      console.error("Failed to check for updates:", error);
      if (!silent && globalUI) {
        const message =
          error?.message ||
          copy.retrieveUpdateInfoFallback ||
          "Could not retrieve update information.";
        await globalUI.showAlert({
          message: formatUpdaterCopy(
            copy.failedCheckUpdatesMessage ??
              "Failed to check for updates: {message}",
            { message },
          ),
          title: copy.errorTitle ?? "Error",
        });
      }
      return null;
    }
  };

  const downloadAndInstall = async (update, copy = {}) => {
    const progressDialog = createUpdateProgressDialog(copy);

    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength || 0;
            progressDialog.update();
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            downloadProgress =
              contentLength > 0
                ? Math.round((downloaded / contentLength) * 100)
                : 0;
            progressDialog.update({
              progress: contentLength > 0 ? downloadProgress : undefined,
            });
            break;
          case "Finished":
            progressDialog.update({ installing: true });
            break;
        }
      });

      await relaunch();
      progressDialog.close();
    } catch (error) {
      progressDialog.close();
      console.error("Failed to download and install update:", error);
      if (globalUI) {
        await globalUI.showAlert({
          message: formatUpdaterCopy(
            copy.failedInstallUpdateMessage ??
              "Failed to install update: {message}",
            { message: error?.message ?? "" },
          ),
          title: copy.errorTitle ?? "Error",
        });
      }
    }
  };

  const startAutomaticChecks = (options = {}) => {
    const getCopy =
      typeof options.getCopy === "function"
        ? options.getCopy
        : () => options.copy ?? {};
    const TEN_MINUTES_IN_MS = 10 * 60 * 1000;
    const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;

    const performCheck = async ({ force = false } = {}) => {
      const lastCheckTime = await keyValueStore.get("lastCheckTime");
      const currentTime = Date.now();

      if (
        force ||
        !lastCheckTime ||
        currentTime - lastCheckTime > TWO_HOURS_IN_MS
      ) {
        try {
          await checkForUpdates(true, { copy: getCopy() });
        } finally {
          await keyValueStore.set("lastCheckTime", currentTime);
        }
      }
    };

    performCheck({ force: true });

    setInterval(performCheck, TEN_MINUTES_IN_MS);
  };

  return {
    checkForUpdates,
    downloadAndInstall,
    startAutomaticChecks,
    getUpdateInfo: () => updateInfo,
    getDownloadProgress: () => downloadProgress,
    isUpdateAvailable: () => updateAvailable,
  };
};

export default createUpdater;
