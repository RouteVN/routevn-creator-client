import { createAppShellService } from "./appShellService.js";
import { createFileSelectionService } from "./fileSelectionService.js";
import { createProjectEntriesService } from "./projectEntriesService.js";
import { createUserConfigService } from "./userConfigService.js";
import { getLocalProjectPathFromPayload } from "../../../internal/localProjectRoute.js";
import { normalizeTheme } from "../../../internal/theme.js";

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
  platformAdapter = {},
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
  });

  projectService?.onPersistenceIssue?.((code) => {
    const copy = appShellService.getAppCopy();
    const message =
      code === "partial_write"
        ? (copy.projectPartialSaveNotice ??
          "Only part of this change was saved. Review the project before trying again.")
        : code === "write_outcome_unknown" ||
            code === "write_reconciliation_failed"
          ? (copy.projectUnknownSaveNotice ??
            "We could not confirm the save. Reopen the project to check its saved changes.")
          : (copy.projectViewsRebuildNotice ??
            "Your changes are saved. Some project views will be rebuilt when you reopen.");
    appShellService.showToast({
      title: copy.warningTitle ?? "Notice",
      message,
      status: "warning",
    });
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

    async initUserConfig() {
      const userConfig = await userConfigService.initUserConfig();
      applyTheme(getTheme());
      return userConfig;
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
