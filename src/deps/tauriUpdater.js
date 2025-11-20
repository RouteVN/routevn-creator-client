import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const createUpdater = ({ globalUI, keyValueStore }) => {
  let updateAvailable = false;
  let updateInfo = null;
  let downloadProgress = 0;

  const checkForUpdates = async (silent = false) => {
    try {
      const update = await check();

      if (!update) {
        if (!silent) {
          console.log("No updates available");
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
          message: `Update ${update.version} is available!\n\nRelease notes:\n${update.body}`,
          title: "Update Available",
          confirmText: "Update Now",
          cancelText: "Later",
        });

        if (shouldUpdate) {
          await downloadAndInstall(update);
        }
      }

      return updateInfo;
    } catch (error) {
      console.error("Failed to check for updates:", error);
      if (!silent && globalUI) {
        await globalUI.showAlert({
          message: `Failed to check for updates: ${error.message}`,
          title: "Error",
        });
      }
      return null;
    }
  };

  const downloadAndInstall = async (update) => {
    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength || 0;
            console.log(`Started downloading update, size: ${contentLength}`);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            downloadProgress =
              contentLength > 0
                ? Math.round((downloaded / contentLength) * 100)
                : 0;
            console.log(`Download progress: ${downloadProgress}%`);
            break;
          case "Finished":
            console.log("Update downloaded successfully");
            break;
        }
      });

      await relaunch();
    } catch (error) {
      console.error("Failed to download and install update:", error);
      if (globalUI) {
        await globalUI.showAlert({
          message: `Failed to install update: ${error.message}`,
          title: "Error",
        });
      }
    }
  };

  const startAutomaticChecks = () => {
    const TEN_MINUTES_IN_MS = 10 * 60 * 1000;
    const SIX_HOURS_IN_MS = 6 * 60 * 60 * 1000;

    const performCheck = async () => {
      const lastCheckTime = await keyValueStore.get("lastCheckTime");
      const currentTime = Date.now();

      if (!lastCheckTime || currentTime - lastCheckTime > SIX_HOURS_IN_MS) {
        try {
          await checkForUpdates(true);
        } finally {
          await keyValueStore.set("lastCheckTime", currentTime);
        }
      }
    };

    performCheck();

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
