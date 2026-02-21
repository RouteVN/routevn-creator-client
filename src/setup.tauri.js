import { createGlobalUI } from "@rettangoli/ui";

import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

// Infra - Tauri
import { createDb } from "./deps/infra/tauri/db";
import { createTauriFilePicker } from "./deps/infra/tauri/filePicker";
import createUpdater from "./deps/infra/tauri/updater";
import { setupCloseListener } from "./deps/infra/tauri/windowClose";

// Services
import { createAppService } from "./deps/services/appService";
import { createAudioService } from "./deps/services/audioService";
import { createProjectService } from "./deps/services/projectService";
import { createPendingQueueService } from "./deps/services/pendingQueueService";

// Legacy deps (to be migrated)
import Subject from "./deps/subject";
import Router from "./deps/infra/router";
import { createGraphicsService } from "./deps/services/graphicsService";

const guardedRtglConstructors = new WeakSet();
const rtglComponentTags = [
  "rtgl-accordion-item",
  "rtgl-breadcrumb",
  "rtgl-dropdown-menu",
  "rtgl-form",
  "rtgl-global-ui",
  "rtgl-navbar",
  "rtgl-page-outline",
  "rtgl-popover-input",
  "rtgl-select",
  "rtgl-sidebar",
  "rtgl-slider-input",
  "rtgl-table",
  "rtgl-tabs",
  "rtgl-tooltip",
  "rtgl-waveform",
];

const guardRtglAttributeUpdatesBeforeConnect = () => {
  rtglComponentTags.forEach((tagName) => {
    const ctor = customElements.get(tagName);
    if (!ctor || guardedRtglConstructors.has(ctor)) {
      return;
    }

    const originalAttributeChangedCallback =
      ctor.prototype.attributeChangedCallback;
    if (typeof originalAttributeChangedCallback !== "function") {
      guardedRtglConstructors.add(ctor);
      return;
    }

    ctor.prototype.attributeChangedCallback = function (...args) {
      if (!this.isConnected || !this.renderTarget) {
        return;
      }
      return originalAttributeChangedCallback.apply(this, args);
    };

    guardedRtglConstructors.add(ctor);
  });
};

guardRtglAttributeUpdatesBeforeConnect();

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

// Create updater
const updater = createUpdater({ globalUI, keyValueStore: appDb });

// Create subject for inter-component communication
const subject = new Subject();

// Create project service (manages repositories and project operations)
const projectService = createProjectService({
  router,
  db: appDb,
  filePicker,
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

// Initialize async resources first
const graphicsService = await createGraphicsService({ subject });

// Create dialogue queue service for debounced writes
const dialogueQueueService = createPendingQueueService({ debounceMs: 2000 });

setupCloseListener({ globalUI });

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
