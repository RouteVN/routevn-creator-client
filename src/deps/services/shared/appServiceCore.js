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

  const userConfigService = createUserConfigService();

  return {
    ...projectEntriesService,
    ...fileSelectionService,
    ...appShellService,
    ...userConfigService,
    async getSetting(key) {
      return await db.get(`setting:${key}`);
    },
    async setSetting(key, value) {
      await db.set(`setting:${key}`, value);
    },
    async removeSetting(key) {
      await db.remove(`setting:${key}`);
    },
  };
};
