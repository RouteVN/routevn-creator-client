import { createAppShellService } from "./appShellService.js";
import { createFileSelectionService } from "./fileSelectionService.js";
import { createProjectEntriesService } from "./projectEntriesService.js";
import { createRetainedEditHistoryService } from "./retainedEditHistoryService.js";
import { createTouchLayoutService } from "./touchLayoutService.js";
import { createUserConfigService } from "./userConfigService.js";
import { getLocalProjectPathFromPayload } from "../../../internal/localProjectRoute.js";
import { normalizeTheme } from "../../../internal/theme.js";
import { noopErrorTracker } from "../../clients/errorReporting.js";
import { createAssetStoreClient } from "../../clients/assetStoreClient.js";
import { createDeviceFactsClient } from "../../clients/deviceFacts.js";

export const createAppServiceCore = ({
  db,
  router,
  globalUI,
  filePicker,
  openUrl,
  appVersion,
  platform,
  distribution,
  updatesEnabled,
  updater,
  youtubeEmbedsSupported,
  audioService,
  projectService,
  subject,
  errorTracker = noopErrorTracker,
  platformAdapter = {},
  triggerTestCrash,
  windowMetricsClient,
  uiConfig,
  assetStoreClient,
}) => {
  const getCurrentProjectId = () => {
    return router.getPayload()?.p ?? "";
  };

  const getCurrentProjectPath = () => {
    return getLocalProjectPathFromPayload(router.getPayload());
  };

  const projectEntriesService = createProjectEntriesService({
    db,
    getCurrentProjectId,
    getCurrentProjectPath,
    projectService,
    platformAdapter,
  });

  const appShellService = createAppShellService({
    router,
    subject,
    globalUI,
    filePicker,
    openUrl,
    appVersion,
    platform,
    distribution,
    updatesEnabled,
    updater,
    youtubeEmbedsSupported,
    audioService,
    triggerTestCrash,
  });

  const fileSelectionService = createFileSelectionService({
    globalUI,
    filePicker,
    projectService,
    platformAdapter,
    getAppCopy: appShellService.getAppCopy,
  });

  const userConfigService = createUserConfigService({
    db,
    onChange: ({ key }) => {
      subject.dispatch("app.userConfig.changed", { key });
    },
    onLoadError: () => {
      const copy = appShellService.getAppCopy?.() ?? {};
      appShellService.showToast({
        title: copy.errorTitle ?? "Error",
        message:
          copy.failedLoadAppSettings ??
          "Failed to load app settings. Using defaults.",
        status: "error",
      });
    },
    onPersistError: () => {
      const copy = appShellService.getAppCopy?.() ?? {};
      appShellService.showToast({
        title: copy.errorTitle ?? "Error",
        message: copy.failedSaveAppSettings ?? "Failed to save app settings.",
        status: "error",
      });
    },
  });

  // A view or a download of an asset store pack names this device and the
  // app's active language.
  const assetStore =
    assetStoreClient ??
    createAssetStoreClient({
      getDevice: createDeviceFactsClient({
        keyValueStore: db,
        platform,
        distribution,
        appVersion,
        getUiLanguage: () => appShellService.getAppLocaleUsage().uiLanguage,
      }).get,
    });

  const touchLayoutService = createTouchLayoutService({
    windowMetricsClient,
    uiConfig,
  });

  const retainedEditHistoryService = createRetainedEditHistoryService({
    getProjectKey: () => `${getCurrentProjectId()}:${getCurrentProjectPath()}`,
    getProjectState: () => projectService.getRepositoryState(),
  });

  const getTheme = () => {
    return normalizeTheme(userConfigService.getUserConfig("appearance.theme"));
  };

  const applyTheme = (theme) => {
    const nextTheme = appShellService.applyTheme(theme);
    platformAdapter.applyTheme?.(nextTheme);
    return nextTheme;
  };

  return {
    ...projectEntriesService,
    ...fileSelectionService,
    ...appShellService,
    ...userConfigService,
    ...touchLayoutService,
    ...retainedEditHistoryService,

    async initUserConfig() {
      const userConfig = await userConfigService.initUserConfig();
      applyTheme(getTheme());
      return userConfig;
    },

    // Report an already-handled error; this never shows UI.
    reportError(error, context) {
      errorTracker.capture(error, context);
    },

    // Saves what the open page still holds in memory, at the moments the app
    // leaves the user's hands: sent to the background, where the system may end
    // it, or about to quit. Nothing can wait on a failure there, so it is
    // reported, not thrown.
    async saveBeforeSuspend(reason) {
      try {
        await appShellService.prepareNavigation({ reason });
      } catch (error) {
        console.error("[app] Failed to save before suspending", error);
        errorTracker.capture(error, { operation: "app.saveBeforeSuspend" });
      }
    },

    getTheme,
    applyTheme,

    // Sending a project to support needs the desktop app, which packs the
    // project folder; other platforms say no.
    canSendProjectToSupport() {
      return false;
    },

    // Free packs from the RouteVN asset store, newest first.
    listAssetStorePacks({ cursor, query, assetTypes } = {}) {
      return assetStore.listAssetPacks({ cursor, query, assetTypes });
    },

    // An asset store creator's profile (name, avatar, bio and links) and
    // their free packs.
    getAssetStoreCreator({ creatorId } = {}) {
      return assetStore.getCreatorById({ creatorId });
    },

    // One free pack, with its package's manifest and the URLs of its media
    // files. Each read counts one view of the pack.
    getAssetStorePack({ assetPackId } = {}) {
      return assetStore.getAssetPackById({ assetPackId });
    },

    // The signed URL of a pack's package ZIP, which an import reads. With
    // `countDownload`, set when an import starts, it counts one download of
    // the pack.
    getAssetStorePackDownload({ assetPackId, countDownload } = {}) {
      return assetStore.getAssetPackDownload({ assetPackId, countDownload });
    },

    getFileDisplayPath(path) {
      return platformAdapter.getFileDisplayPath?.(path) ?? path;
    },

    setTheme(theme) {
      const nextTheme = normalizeTheme(theme);
      userConfigService.setUserConfig("appearance.theme", nextTheme);
      applyTheme(nextTheme);
      return nextTheme;
    },
  };
};
