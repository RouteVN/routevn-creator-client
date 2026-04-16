import { createGlobalUI } from "@rettangoli/ui";

import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

// Infra - Tauri
import { createDb } from "./deps/clients/tauri/db";
import { createTauriFilePicker } from "./deps/clients/tauri/filePicker";
import createUpdater from "./deps/clients/tauri/updater";
import { setupCloseListener } from "./deps/clients/tauri/windowClose";

// Services
import { createAppService } from "./deps/services/appService";
import { createAudioService } from "./deps/services/audioService";
import { createProjectService } from "./deps/services/projectService";
import { createPendingQueueService } from "./deps/services/pendingQueueService";
import { createApiService } from "./deps/services/apiService";

import Subject from "./deps/subject";
import Router from "./deps/clients/router";
import { createGraphicsService } from "./deps/services/graphicsService";
import { deriveProjectFormatVersionFromAppVersion } from "./internal/projectCompatibility.js";
import { registerPrimitives } from "./primitives/registerPrimitives";

registerPrimitives();

// Initialize app database
const appDb = createDb({ path: "sqlite:app.db" });
await appDb.init();

// Create instances needed for app service
const router = new Router();
const filePicker = createTauriFilePicker();
const globalUIElement = document.querySelector("rtgl-global-ui");
const globalUI = createGlobalUI(globalUIElement);
const audioService = createAudioService();

// Get app version
const appVersion = await getVersion();
const creatorVersion = deriveProjectFormatVersionFromAppVersion(appVersion);

// Create updater
const updater = createUpdater({ globalUI, keyValueStore: appDb });

// Create subject for inter-component communication
const subject = new Subject();

// Create project service (manages repositories and project operations)
const projectService = createProjectService({
  router,
  db: appDb,
  filePicker,
  creatorVersion,
});

// Create app service
const appService = createAppService({
  db: appDb,
  router,
  globalUI,
  filePicker,
  openUrl,
  appVersion,
  platform: "tauri",
  updater,
  audioService,
  projectService,
  subject,
});
await appService.initUserConfig();

const apiService = createApiService();

// Initialize async resources first
const graphicsService = await createGraphicsService({ subject });

// Create dialogue queue service for debounced writes
const dialogueQueueService = createPendingQueueService({ debounceMs: 2000 });

setupCloseListener({ globalUI });

const componentDependencies = {
  subject,
  graphicsService,
  appService,
  apiService,
  projectService,
  audioService,
};

const pageDependencies = {
  subject,
  graphicsService,
  appService,
  apiService,
  projectService,
  updaterService: updater,
  dialogueQueueService,
};

const deps = {
  components: componentDependencies,
  pages: pageDependencies,
};

export { deps };
