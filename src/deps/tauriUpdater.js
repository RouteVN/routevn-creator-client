import { check } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

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
        // TODO: In future, use custom UI instead of Tauri's built-in dialog
        const shouldUpdate = await ask(
          `Update ${update.version} is available!\n\nRelease notes:\n${update.body}`,
          {
            title: "Update Available",
            okLabel: "Update Now",
            cancelLabel: "Later",
          },
        );

        if (shouldUpdate) {
          await downloadAndInstall(update);
        }
      }

      return updateInfo;
    } catch (error) {
      console.error("Failed to check for updates:", error);
      if (!silent) {
        await ask(`Failed to check for updates: ${error.message}`, {
          title: "Update Check Failed",
          okLabel: "OK",
          cancelLabel: null,
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
      await ask(`Failed to install update: ${error.message}`, {
        title: "Update Failed",
        okLabel: "OK",
        cancelLabel: null,
      });
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
