import { createGlobalUI } from "@rettangoli/ui";

// Infra - Web
import { createDb } from "./deps/clients/web/db.js";
import { createWebFilePicker } from "./deps/clients/web/filePicker.js";
import { resetWebAppStateForVisualTests } from "./deps/clients/web/vtAppStateReset.js";

// Services - Web
import { createAppService } from "./deps/services/web/appService.js";
import { createWebProjectServiceWithCollab } from "./deps/services/web/collabBootstrapService.js";
import { createPendingQueueService } from "./deps/services/pendingQueueService.js";
import { createApiService } from "./deps/services/apiService.js";

// Shared Services & Dependencies
import { createAudioService } from "./deps/services/audioService.js";
import Subject from "./deps/subject.js";
import Router from "./deps/clients/router.js";
import { createGraphicsService } from "./deps/services/graphicsService.js";
import { CREATOR_VERSION } from "./internal/projectCompatibility.js";
import { registerPrimitives } from "./primitives/registerPrimitives.js";
import tauriConfig from "../src-tauri/tauri.conf.json";

registerPrimitives();

await resetWebAppStateForVisualTests();

// Initialize app database using web adapter
const appDb = createDb({ path: "app" });
await appDb.init();

// Create instances needed for app service
const router = new Router();
const filePicker = createWebFilePicker();
const globalUIElement = document.querySelector("rtgl-global-ui");
const globalUI = createGlobalUI(globalUIElement);
const audioService = createAudioService();

const appVersion = tauriConfig.version;
const creatorVersion = CREATOR_VERSION;

const updater = {
  checkForUpdates: async () => null,
  startAutomaticChecks: () => {},
  getUpdateInfo: () => null,
  getDownloadProgress: () => 0,
  isUpdateAvailable: () => false,
};

// Create subject for inter-component communication
const subject = new Subject();
const collabConfig = {
  endpointUrl: "ws://127.0.0.1:8787/sync",
  debugEnabled: false,
};

// Create project service (web version)
const projectService = await createWebProjectServiceWithCollab({
  router,
  filePicker,
  subject,
  db: appDb,
  collabConfig,
  creatorVersion,
});

// Create app service (web version)
const appService = createAppService({
  db: appDb,
  router,
  globalUI,
  filePicker,
  openUrl: (url) => window.open(url, "_blank"),
  appVersion,
  platform: "web",
  audioService,
  projectService,
  subject,
});

const apiService = createApiService();

// Initialize async resources first
const graphicsService = await createGraphicsService({ subject });

// Create dialogue queue service for debounced writes
const dialogueQueueService = createPendingQueueService({ debounceMs: 2000 });

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
