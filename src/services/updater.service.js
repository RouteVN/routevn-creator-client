import { check } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

export class UpdaterService {
  constructor() {
    this.updateAvailable = false;
    this.updateInfo = null;
    this.downloadProgress = 0;
  }

  async checkForUpdates(silent = false) {
    try {
      const update = await check();

      if (!update) {
        if (!silent) {
          console.log("No updates available");
        }
        return null;
      }

      this.updateAvailable = true;
      this.updateInfo = {
        version: update.version,
        date: update.date,
        body: update.body,
      };

      if (!silent) {
        const shouldUpdate = await ask(
          `Update ${update.version} is available!\n\nRelease notes:\n${update.body}`,
          {
            title: "Update Available",
            okLabel: "Update Now",
            cancelLabel: "Later",
          },
        );

        if (shouldUpdate) {
          await this.downloadAndInstall(update);
        }
      }

      return this.updateInfo;
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
  }

  async downloadAndInstall(update) {
    try {
      let downloaded = 0;
      let contentLength = 0;

      // Download and install the update
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength || 0;
            console.log(`Started downloading update, size: ${contentLength}`);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            this.downloadProgress =
              contentLength > 0
                ? Math.round((downloaded / contentLength) * 100)
                : 0;
            console.log(`Download progress: ${this.downloadProgress}%`);
            break;
          case "Finished":
            console.log("Update downloaded successfully");
            break;
        }
      });

      // Relaunch the application
      await relaunch();
    } catch (error) {
      console.error("Failed to download and install update:", error);
      await ask(`Failed to install update: ${error.message}`, {
        title: "Update Failed",
        okLabel: "OK",
        cancelLabel: null,
      });
    }
  }

  async checkForUpdatesOnStartup() {
    // Check for updates on startup with notification
    // Delay the check to avoid blocking the app startup
    setTimeout(() => {
      this.checkForUpdates(false).then((updateInfo) => {
        if (updateInfo) {
          console.log("Update available on startup:", updateInfo);
        }
      });
    }, 5000); // Check after 5 seconds
  }
}

// Create a singleton instance
export const updaterService = new UpdaterService();
