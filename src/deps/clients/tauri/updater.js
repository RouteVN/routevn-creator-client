import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const isMacOs = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgentPlatform = navigator.userAgentData?.platform;
  if (typeof userAgentPlatform === "string") {
    return userAgentPlatform === "macOS";
  }

  return /Mac/.test(navigator.platform || "");
};

const isLinux = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgentPlatform = navigator.userAgentData?.platform;
  if (typeof userAgentPlatform === "string") {
    return userAgentPlatform === "Linux";
  }

  return /Linux/.test(navigator.platform || navigator.userAgent || "");
};

const formatUpdaterCopy = (template, values = {}) => {
  return String(template || "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) =>
    values[key] === undefined ? match : String(values[key]),
  );
};

const resolveUpdaterCopy = (options = {}) => {
  return options.copy ?? options ?? {};
};

const createUpdater = ({
  globalUI,
  keyValueStore,
  linuxUpdateInstallMode = "appimage",
}) => {
  let updateAvailable = false;
  let updateInfo = null;
  let downloadProgress = 0;

  const canInstallUpdate = () => {
    return !isLinux() || linuxUpdateInstallMode === "appimage";
  };

  const showPackageManagedLinuxUpdate = async (update, copy = {}) => {
    if (!globalUI) {
      return;
    }

    await globalUI.showAlert({
      message: formatUpdaterCopy(
        copy.packageManagedLinuxUpdateMessage ??
          "Update {version} is available. Please update RouteVN Creator through your package manager.",
        {
          version: update.version,
          releaseNotes: update.body ?? "",
        },
      ),
      title: copy.updateAvailableTitle ?? "Update Available",
    });
  };

  const checkForUpdates = async (silent = false, options = {}) => {
    const copy = resolveUpdaterCopy(options);
    try {
      const update = await check(
        isMacOs()
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

      if (!canInstallUpdate()) {
        if (!silent) {
          await showPackageManagedLinuxUpdate(update, copy);
        }
        return updateInfo;
      }

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
    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength || 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            downloadProgress =
              contentLength > 0
                ? Math.round((downloaded / contentLength) * 100)
                : 0;
            break;
          case "Finished":
            break;
        }
      });

      await relaunch();
    } catch (error) {
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
