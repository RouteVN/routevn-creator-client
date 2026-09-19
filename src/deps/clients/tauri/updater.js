import { check } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { createProgressDialog } from "../progressDialog.js";
import { isMacosHost } from "./platform.js";
import { createAutomaticUpdateChecks } from "../automaticUpdateChecks.js";
import { getDeviceId, isDeviceMetadataText } from "../deviceIdentity.js";

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

  const checkForUpdates = async (silent = false, options = {}) => {
    const copy = resolveUpdaterCopy(options);
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
        timeout: 10_000,
        headers: {
          "X-RouteVN-Device-Id": deviceId,
          "X-RouteVN-Device-Model": encodeURIComponent(deviceModel),
          "X-RouteVN-OS-Version": encodeURIComponent(osVersion),
        },
      };
      if (isMacosHost()) checkOptions.target = "macos-universal";
      const update = await check(checkOptions);

      if (!update) {
        updateAvailable = false;
        updateInfo = undefined;
        downloadProgress = 0;
        if (!silent && globalUI) {
          await globalUI.showAlert({
            message:
              copy.latestVersionMessage ??
              "You are already on the latest version",
            title: copy.upToDateTitle ?? "Up to Date",
          });
        }
        return;
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
      updateAvailable = false;
      updateInfo = undefined;
      console.error("Failed to check for updates:", error);
      if (!silent && globalUI) {
        const message =
          copy.retrieveUpdateInfoFallback ??
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
      return;
    }
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
