import { createAppShellService } from "./appShellService.js";
import { createFileSelectionService } from "./fileSelectionService.js";
import { createProjectEntriesService } from "./projectEntriesService.js";
import { createTouchLayoutService } from "./touchLayoutService.js";
import { createUserConfigService } from "./userConfigService.js";
import { getLocalProjectPathFromPayload } from "../../../internal/localProjectRoute.js";
import { normalizeTheme } from "../../../internal/theme.js";
import { noopErrorTracker } from "../../clients/errorReporting.js";

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
  audioService,
  projectService,
  subject,
  errorTracker = noopErrorTracker,
  platformAdapter = {},
  triggerTestCrash,
  windowMetricsClient,
  uiConfig,
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

  const fileSelectionService = createFileSelectionService({
    globalUI,
    filePicker,
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
    audioService,
    triggerTestCrash,
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

  const touchLayoutService = createTouchLayoutService({
    windowMetricsClient,
    uiConfig,
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
