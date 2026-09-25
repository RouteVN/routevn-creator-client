import { Update } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { createProgressDialog } from "../progressDialog.js";
import { createAutomaticUpdateChecks } from "../automaticUpdateChecks.js";
import { getDeviceId, isDeviceMetadataText } from "../deviceIdentity.js";
import { createUpdateCheckProgress } from "../updateCheckProgress.js";

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
    progress: {},
  });

  const update = ({ progress, installing = false } = {}) => {
    if (installing) {
      progressDialog.update({
        status: copy.updateInstallingMessage ?? "Installing update...",
        progress: {},
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
        progress: {
          current: percent,
          total: 100,
        },
      });
      return;
    }

    progressDialog.update({
      status: copy.updateDownloadProgressUnknown ?? "Downloading...",
      progress: {},
    });
  };

  return {
    close: progressDialog.close,
    update,
  };
};

const createUpdater = ({ globalUI, keyValueStore }) => {
  let updateAvailable = false;
  let updateInfo;
  let downloadProgress = 0;
  let checkOperation;
  let checkProgress;
  let checkingMetadata = false;
  let manualCheckRequested = false;
  let activeCopy;

  const closeCheckProgress = () => {
    checkingMetadata = false;
    checkProgress?.close();
    checkProgress = undefined;
  };

  const checkForUpdates = (silent = false, options = {}) => {
    if (!silent) {
      manualCheckRequested = true;
      activeCopy = resolveUpdaterCopy(options);
      if (checkingMetadata && !checkProgress)
        checkProgress = createUpdateCheckProgress(activeCopy);
    }
    if (checkOperation) return checkOperation;

    activeCopy = resolveUpdaterCopy(options);
    checkingMetadata = true;
    if (!silent) checkProgress = createUpdateCheckProgress(activeCopy);
    checkOperation = (async () => {
      try {
        const [deviceId, deviceInfo] = await Promise.all([
          getDeviceId(keyValueStore),
          invoke("get_update_device_info").catch(() => ({})),
        ]);
        const deviceModel = isDeviceMetadataText(deviceInfo?.deviceModel)
          ? deviceInfo.deviceModel
          : "unknown";
        const osVersion = isDeviceMetadataText(deviceInfo?.osVersion)
          ? deviceInfo.osVersion
          : "unknown";
        const checkOptions = {
          deviceId,
          deviceModel,
          osVersion,
        };
        const metadata = await invoke("check_client_update", checkOptions);
        const update = metadata ? new Update(metadata) : undefined;
        closeCheckProgress();
        const copy = activeCopy;

        if (!update) {
          updateAvailable = false;
          updateInfo = undefined;
          downloadProgress = 0;
          if (manualCheckRequested && globalUI) {
            await globalUI.showAlert({
              message:
                copy.latestVersionMessage ??
                "You are already on the latest version",
              title: copy.upToDateTitle ?? "Up to Date",
            });
          }
          return;
        }

        try {
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
        } finally {
          try {
            await update.close();
          } catch (error) {
            console.error("Failed to release update metadata:", error);
          }
        }
      } catch (error) {
        closeCheckProgress();
        updateAvailable = false;
        updateInfo = undefined;
        console.error("Failed to check for updates:", error);
        if (manualCheckRequested && globalUI) {
          const copy = activeCopy;
          await globalUI.showAlert({
            message:
              copy.retrieveUpdateInfoFallback ??
              "Could not retrieve update information.",
            title: copy.errorTitle ?? "Error",
          });
        }
        return;
      }
    })().finally(() => {
      closeCheckProgress();
      checkOperation = undefined;
      manualCheckRequested = false;
      activeCopy = undefined;
    });
    return checkOperation;
  };

  const downloadAndInstall = async (update, copy = {}) => {
    const progressDialog = createUpdateProgressDialog(copy);

    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall(
        (event) => {
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
        },
        // The plugin otherwise reuses check headers for artifact downloads.
        { timeout: 10 * 60 * 1000, headers: {} },
      );

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

  const startAutomaticChecks = createAutomaticUpdateChecks({
    checkForUpdates,
    keyValueStore,
  });

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
