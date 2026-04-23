import { createAppShellService } from "./appShellService.js";
import { createFileSelectionService } from "./fileSelectionService.js";
import { createProjectEntriesService } from "./projectEntriesService.js";
import { createUserConfigService } from "./userConfigService.js";

const normalizeTheme = (theme) => {
  return theme === "light" ? "light" : "dark";
};

export const createAppServiceCore = ({
  db,
  router,
  globalUI,
  filePicker,
  openUrl,
  appVersion,
  platform,
  updater,
  audioService,
  projectService,
  subject,
  platformAdapter = {},
}) => {
  const getCurrentProjectId = () => {
    return router.getPayload()?.p ?? "";
  };

  const projectEntriesService = createProjectEntriesService({
    db,
    getCurrentProjectId,
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
    updater,
    audioService,
  });

  const userConfigService = createUserConfigService({
    db,
    onLoadError: () => {
      appShellService.showToast({
        title: "Error",
        message: "Failed to load app settings. Using defaults.",
        status: "error",
      });
    },
    onPersistError: () => {
      appShellService.showToast({
        title: "Error",
        message: "Failed to save app settings.",
        status: "error",
      });
    },
  });

  const getTheme = () => {
    return normalizeTheme(userConfigService.getUserConfig("appearance.theme"));
  };

  return {
    ...projectEntriesService,
    ...fileSelectionService,
    ...appShellService,
    ...userConfigService,

    async initUserConfig() {
      const userConfig = await userConfigService.initUserConfig();
      appShellService.applyTheme(getTheme());
      return userConfig;
    },

    getTheme,

    setTheme(theme) {
      const nextTheme = normalizeTheme(theme);
      userConfigService.setUserConfig("appearance.theme", nextTheme);
      appShellService.applyTheme(nextTheme);
      return nextTheme;
    },
  };
};
