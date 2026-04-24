import { createGlobalUI } from "@rettangoli/ui";

// Infra - Web
import { createDb } from "./deps/clients/web/db.js";
import { createWebFilePicker } from "./deps/clients/web/filePicker.js";
import { installVtBridge } from "./deps/clients/web/vtBridge.js";
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
import { deriveProjectFormatVersionFromAppVersion } from "./internal/projectCompatibility.js";
import { registerPrimitives } from "./primitives/registerPrimitives.js";
import tauriConfig from "../src-tauri/tauri.conf.json";

registerPrimitives();

await resetWebAppStateForVisualTests();

const uiVersions = {
  normal: {
    id: "normal",
    inputMode: "pointer",
    navigation: "sidebar",
  },
  touch: {
    id: "touch",
    inputMode: "touch",
    navigation: "bottom",
  },
};

// Hardcoded while the app supports both normal and touch/mobile UI versions.
const activeUiVersion = "touch";
const uiConfig = uiVersions[activeUiVersion];
document.documentElement.dataset.rvnUiVersion = uiConfig.id;
document.documentElement.dataset.rvnInputMode = uiConfig.inputMode;

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
const creatorVersion = deriveProjectFormatVersionFromAppVersion(appVersion);

const updater = {
  checkForUpdates: async () => null,
  startAutomaticChecks: () => {},
  getUpdateInfo: () => null,
  getDownloadProgress: () => 0,
  isUpdateAvailable: () => false,
};

// Create subject for inter-component communication
const subject = new Subject();
installVtBridge({ subject, router });
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
await appService.initUserConfig();

const apiService = createApiService();

// Initialize async resources first
const graphicsService = await createGraphicsService({ subject });

// Create dialogue queue service for debounced writes
const dialogueQueueService = createPendingQueueService({ debounceMs: 2000 });

const componentDependencies = {
  uiConfig,
  subject,
  graphicsService,
  appService,
  apiService,
  projectService,
  audioService,
};

const pageDependencies = {
  uiConfig,
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
