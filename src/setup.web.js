import { createGlobalUI } from "@rettangoli/ui";

// Infra - Web
import { createDb } from "./deps/infra/web/db.js";
import { createWebFilePicker } from "./deps/infra/web/filePicker.js";

// Services - Web
import { createAppService } from "./deps/services/web/appService.js";
import { createProjectService } from "./deps/services/web/projectService.js";
import { createPendingQueueService } from "./deps/services/pendingQueueService.js";

// Shared Services & Dependencies
import { createAudioService } from "./deps/services/audioService.js";
import Subject from "./deps/subject.js";
import Router from "./deps/infra/router.js";
import { createGraphicsService } from "./deps/services/graphicsService.js";

const guardedRtglConstructors = new WeakSet();
const rtglComponentTags = [
  "rtgl-button",
  "rtgl-view",
  "rtgl-text",
  "rtgl-image",
  "rtgl-svg",
  "rtgl-input",
  "rtgl-input-date",
  "rtgl-input-time",
  "rtgl-input-datetime",
  "rtgl-input-number",
  "rtgl-textarea",
  "rtgl-color-picker",
  "rtgl-slider",
  "rtgl-checkbox",
  "rtgl-dialog",
  "rtgl-popover",
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

const isFeRuntimeComponent = (instance) => {
  return (
    !!instance &&
    typeof instance === "object" &&
    typeof instance.render === "function" &&
    "template" in instance &&
    ("transformedHandlers" in instance || "store" in instance)
  );
};

const patchRtglAttributeChangedCallback = (tagName) => {
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
    // Only gate FE runtime components. Primitive web components must keep their
    // native attribute updates working.
    if (!isFeRuntimeComponent(this)) {
      return originalAttributeChangedCallback.apply(this, args);
    }

    const isRuntimeReady =
      typeof this?.transformedHandlers?.handleCallStoreAction === "function";
    if (
      !this.isConnected ||
      !this.renderTarget ||
      !isRuntimeReady ||
      !this.patch
    ) {
      return;
    }
    return originalAttributeChangedCallback.apply(this, args);
  };

  guardedRtglConstructors.add(ctor);
};

const guardRtglAttributeUpdatesBeforeConnect = () => {
  rtglComponentTags.forEach((tagName) => {
    patchRtglAttributeChangedCallback(tagName);
    customElements.whenDefined(tagName).then(() => {
      patchRtglAttributeChangedCallback(tagName);
    });
  });
};

guardRtglAttributeUpdatesBeforeConnect();

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
const projectService = createProjectService({
  router,
  filePicker,
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
