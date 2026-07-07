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

const formatUpdaterCopy = (template, values = {}) => {
  return String(template || "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) =>
    values[key] === undefined ? match : String(values[key]),
  );
};

const resolveUpdaterCopy = (options = {}) => {
  return options.copy ?? options ?? {};
};

const UPDATE_PROGRESS_DIALOG_ID = "routevn-update-progress-dialog";

const createRtglElement = (root, tagName, attributes = {}, textContent) => {
  const element = root.createElement(tagName);

  Object.entries(attributes).forEach(([name, value]) => {
    if (value === true) {
      element.setAttribute(name, "");
    } else if (value !== false && value !== undefined) {
      element.setAttribute(name, value);
    }
  });

  if (textContent !== undefined) {
    element.textContent = textContent;
  }

  return element;
};

const createUpdateProgressDialog = (copy = {}) => {
  const root = typeof document === "undefined" ? undefined : document;
  if (!root?.body) {
    return {
      close: () => {},
      update: () => {},
    };
  }

  root.getElementById(UPDATE_PROGRESS_DIALOG_ID)?.remove();

  const dialog = createRtglElement(root, "rtgl-dialog", {
    id: UPDATE_PROGRESS_DIALOG_ID,
    open: true,
    s: "sm",
  });
  dialog.addEventListener("close", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  const content = createRtglElement(root, "rtgl-view", {
    slot: "content",
    g: "lg",
    p: "lg",
  });

  const header = createRtglElement(root, "rtgl-view", { g: "sm", w: "f" });
  const title = createRtglElement(
    root,
    "rtgl-text",
    { s: "lg" },
    copy.updateDownloadTitle ?? "Downloading update",
  );
  const message = createRtglElement(
    root,
    "rtgl-text",
    { c: "mu-fg" },
    copy.updateDownloadMessage ??
      "Keep RouteVN Creator open. It will restart when the update is ready.",
  );
  const statusText = createRtglElement(root, "rtgl-text", { c: "mu-fg" });

  header.append(title, message);
  content.append(header, statusText);
  dialog.append(content);
  root.body.append(dialog);

  const update = ({ progress, installing = false } = {}) => {
    if (installing) {
      statusText.textContent =
        copy.updateInstallingMessage ?? "Installing update...";
      return;
    }

    if (Number.isFinite(progress)) {
      const percent = Math.max(0, Math.min(100, Math.round(progress)));
      statusText.textContent = formatUpdaterCopy(
        copy.updateDownloadProgressMessage ?? "{progress}% downloaded",
        { progress: percent },
      );
      return;
    }

    statusText.textContent =
      copy.updateDownloadProgressUnknown ?? "Downloading...";
  };

  update();

  return {
    close() {
      dialog.removeAttribute("open");
      dialog.remove();
    },
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
