import { createAppShellService } from "./appShellService.js";
import { createFileSelectionService } from "./fileSelectionService.js";
import { createProjectEntriesService } from "./projectEntriesService.js";
import { createUserConfigService } from "./userConfigService.js";

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

  return {
    ...projectEntriesService,
    ...fileSelectionService,
    ...appShellService,
    ...userConfigService,
  };
};
