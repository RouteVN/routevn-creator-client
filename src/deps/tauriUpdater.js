import { check } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

// Helper to use notification service if available, fallback to Tauri ask
const showDialog = async (
  message,
  title,
  type = "confirm",
  okLabel = "OK",
  cancelLabel = null,
) => {
  // Try to use notification service if available
  if (window.notification && type === "confirm" && cancelLabel) {
    return await window.notification.confirmAsync(
      message,
      title,
      okLabel,
      cancelLabel,
    );
  } else if (window.notification && type === "info") {
    window.notification.info(message, title);
    return true;
  } else if (window.notification && type === "error") {
    window.notification.error(message, title);
    return true;
  }

  // Fallback to Tauri ask dialog
  return await ask(message, {
    title,
    okLabel,
    cancelLabel,
  });
};

const createUpdater = () => {
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

      if (!silent) {
        // Use notification service when available
        const shouldUpdate = await showDialog(
          `Update ${update.version} is available!\n\nRelease notes:\n${update.body}`,
          "Update Available",
          "confirm",
          "Update Now",
          "Later",
        );

        if (shouldUpdate) {
          await downloadAndInstall(update);
        }
      }

      return updateInfo;
    } catch (error) {
      console.error("Failed to check for updates:", error);
      if (!silent) {
        await showDialog(
          `Failed to check for updates: ${error.message}`,
          "Update Check Failed",
          "error",
        );
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
      await showDialog(
        `Failed to install update: ${error.message}`,
        "Update Failed",
        "error",
      );
    }
  };

  const checkForUpdatesOnStartup = () => {
    setTimeout(() => {
      checkForUpdates(false).then((info) => {
        if (info) {
          console.log("Update available on startup:", info);
        }
      });
    }, 5000);
  };

  return {
    checkForUpdates,
    downloadAndInstall,
    checkForUpdatesOnStartup,
    getUpdateInfo: () => updateInfo,
    getDownloadProgress: () => downloadProgress,
    isUpdateAvailable: () => updateAvailable,
  };
};

export const updaterService = createUpdater();
