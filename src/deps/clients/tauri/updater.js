import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const LINUX_DOWNLOAD_URL = "https://routevn.com/en/creator/download/";
const UPDATE_MANIFEST_URL =
  "https://static-1.routevn.com/routevn-creator-client/latestv1.json";

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

  return /Linux/.test(
    `${navigator.platform || ""} ${navigator.userAgent || ""}`,
  );
};

const formatUpdaterCopy = (template, values = {}) => {
  return String(template || "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) =>
    values[key] === undefined ? match : String(values[key]),
  );
};

const resolveUpdaterCopy = (options = {}) => {
  return options.copy ?? options ?? {};
};

const normalizeVersion = (version) => {
  return String(version ?? "").replace(/^v/i, "");
};

const getVersionParts = (version) => {
  return normalizeVersion(version)
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
};

const isNewerVersion = (version, currentVersion) => {
  const normalizedVersion = normalizeVersion(version);
  if (!normalizedVersion) {
    return false;
  }

  if (!currentVersion) {
    return true;
  }

  const versionParts = getVersionParts(normalizedVersion);
  const currentParts = getVersionParts(currentVersion);
  const length = Math.max(versionParts.length, currentParts.length);

  for (let index = 0; index < length; index += 1) {
    const versionPart = versionParts[index] ?? 0;
    const currentPart = currentParts[index] ?? 0;
    if (versionPart > currentPart) {
      return true;
    }
    if (versionPart < currentPart) {
      return false;
    }
  }

  return false;
};

const createUpdater = ({
  globalUI,
  keyValueStore,
  openUrl,
  appVersion,
  fetchManualUpdateManifest,
  updateManifestUrl = UPDATE_MANIFEST_URL,
}) => {
  let updateAvailable = false;
  let updateInfo = null;
  let downloadProgress = 0;

  const checkForUpdates = async (silent = false, options = {}) => {
    const copy = resolveUpdaterCopy(options);
    try {
      const linux = isLinux();
      const update = linux
        ? await checkManualDownloadUpdate()
        : await check(
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

      if (globalUI) {
        const shouldUpdate = await globalUI.showConfirm({
          message: formatUpdaterCopy(
            linux
              ? (copy.manualDownloadUpdateMessage ??
                  "Update {version} is available.\n\nUpdates are installed manually. Open the RouteVN Creator download page, download the package for your distribution, and install it over the current version.\n\nRelease notes:\n{releaseNotes}")
              : (copy.updateAvailableMessage ??
                  "Update {version} is available!\n\nRelease notes:\n{releaseNotes}"),
            {
              version: update.version,
              releaseNotes: update.body ?? "",
            },
          ),
          title: copy.updateAvailableTitle ?? "Update Available",
          confirmText: linux
            ? (copy.openDownloadPageButton ?? "Open Download Page")
            : (copy.updateNowButton ?? "Update Now"),
          cancelText: copy.laterButton ?? "Later",
        });

        if (shouldUpdate) {
          if (linux) {
            await openLinuxDownloadPage(copy);
          } else {
            await downloadAndInstall(update, copy);
          }
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

  const checkManualDownloadUpdate = async () => {
    if (typeof fetchManualUpdateManifest !== "function") {
      throw new Error("Manual update manifest fetch is unavailable.");
    }

    const manifest = await fetchManualUpdateManifest(updateManifestUrl);
    const version = normalizeVersion(manifest?.version);
    if (!isNewerVersion(version, appVersion)) {
      return null;
    }

    return {
      version,
      date: manifest?.pub_date ?? manifest?.date,
      body: manifest?.notes ?? manifest?.body,
    };
  };

  const openLinuxDownloadPage = async (copy = {}) => {
    try {
      await openUrl(LINUX_DOWNLOAD_URL);
    } catch (error) {
      console.error("Failed to open manual download page:", error);
      if (globalUI) {
        await globalUI.showAlert({
          message: copy.failedOpenLink ?? "Failed to open link.",
          title: copy.errorTitle ?? "Error",
        });
      }
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
