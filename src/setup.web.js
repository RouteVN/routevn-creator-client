import { createGlobalUI } from "@rettangoli/ui";

// Infra - Web
import { createDb } from "./deps/infra/web/db.js";
import { createWebFilePicker } from "./deps/infra/web/filePicker.js";

// Services - Web
import { createAppService } from "./deps/services/web/appService.js";
import { createWebProjectServiceWithCollab } from "./deps/services/web/collabBootstrapService.js";
import { createPendingQueueService } from "./deps/services/pendingQueueService.js";

// Shared Services & Dependencies
import { createAudioService } from "./deps/services/audioService.js";
import Subject from "./deps/subject.js";
import Router from "./deps/infra/router.js";
import { createGraphicsService } from "./deps/services/graphicsService.js";

// Initialize app database using web adapter
const appDb = createDb({ path: "app" });
await appDb.init();

// Create instances needed for app service
const router = new Router();
const filePicker = createWebFilePicker();
const globalUIElement = document.querySelector("rtgl-global-ui");
const globalUI = createGlobalUI(globalUIElement);
const audioService = createAudioService();

// Use app version from config (Tauri version comes from API)
const appVersion = "web";

// todo : will remove this later
const updater = {
  checkForUpdates: async () => null,
  startAutomaticChecks: () => {},
  getUpdateInfo: () => null,
  getDownloadProgress: () => 0,
  isUpdateAvailable: () => false,
};

// Create subject for inter-component communication
const subject = new Subject();

// Create project service (web version)
const projectService = await createWebProjectServiceWithCollab({
  router,
  filePicker,
  subject,
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

// Initialize async resources first
const graphicsService = await createGraphicsService({ subject });

// Create dialogue queue service for debounced writes
const dialogueQueueService = createPendingQueueService({ debounceMs: 2000 });

const componentDependencies = {
  subject,
  graphicsService,
  appService,
  projectService,
  audioService,
};

const pageDependencies = {
  subject,
  graphicsService,
  appService,
  projectService,
  updaterService: updater,
  dialogueQueueService,
};

const deps = {
  components: componentDependencies,
  pages: pageDependencies,
};

export { deps };
