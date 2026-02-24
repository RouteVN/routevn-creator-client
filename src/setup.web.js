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

const guardedRtglConstructors = new WeakSet();
const patchedRtglFormConstructors = new WeakSet();
const rtglFeComponentTags = [
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

const hasRequiredRefHandlers = (instance) => {
  const refs = instance?.refs;
  if (!refs || typeof refs !== "object") {
    return true;
  }

  const handlers = instance?.transformedHandlers;
  if (!handlers || typeof handlers !== "object") {
    return false;
  }

  for (const refConfig of Object.values(refs)) {
    const eventListeners = refConfig?.eventListeners;
    if (!eventListeners || typeof eventListeners !== "object") {
      continue;
    }

    for (const eventConfig of Object.values(eventListeners)) {
      const handlerName = eventConfig?.handler;
      if (
        handlerName &&
        typeof handlerName === "string" &&
        typeof handlers[handlerName] !== "function"
      ) {
        return false;
      }
    }
  }

  return true;
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
    const isRuntimeReady =
      typeof this?.transformedHandlers?.handleCallStoreAction === "function";
    if (
      !this.isConnected ||
      !this.renderTarget ||
      !isRuntimeReady ||
      !this.patch ||
      !hasRequiredRefHandlers(this)
    ) {
      return;
    }
    return originalAttributeChangedCallback.apply(this, args);
  };

  guardedRtglConstructors.add(ctor);
};

const guardRtglAttributeUpdatesBeforeConnect = () => {
  rtglFeComponentTags.forEach((tagName) => {
    patchRtglAttributeChangedCallback(tagName);
    customElements.whenDefined(tagName).then(() => {
      patchRtglAttributeChangedCallback(tagName);
    });
  });
};

const normalizeLegacyFormSchema = (schema) => {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const normalizeField = (field) => {
    if (!field || typeof field !== "object") {
      return field;
    }

    const normalizedField = { ...field };

    if (!normalizedField.type && normalizedField.inputType) {
      normalizedField.type = normalizedField.inputType;
    }

    if (Array.isArray(normalizedField.fields)) {
      normalizedField.fields = normalizedField.fields.map(normalizeField);
    }

    return normalizedField;
  };

  const normalizedSchema = { ...schema };

  if (Array.isArray(schema.fields)) {
    normalizedSchema.fields = schema.fields.map(normalizeField);
  }

  const buttons = schema.actions?.buttons;
  if (Array.isArray(buttons)) {
    normalizedSchema.actions = {
      ...schema.actions,
      buttons: buttons.map((button) => {
        if (!button || typeof button !== "object") {
          return button;
        }

        const normalizedButton = { ...button };
        if (!normalizedButton.label && normalizedButton.content) {
          normalizedButton.label = normalizedButton.content;
        }

        return normalizedButton;
      }),
    };
  }

  return normalizedSchema;
};

const patchRtglFormCompatibility = () => {
  const ctor = customElements.get("rtgl-form");
  if (!ctor || patchedRtglFormConstructors.has(ctor)) {
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, "form");
  if (!descriptor || typeof descriptor.set !== "function") {
    patchedRtglFormConstructors.add(ctor);
    return;
  }

  Object.defineProperty(ctor.prototype, "form", {
    get: descriptor.get,
    set(value) {
      return descriptor.set.call(this, normalizeLegacyFormSchema(value));
    },
    enumerable: descriptor.enumerable,
    configurable: descriptor.configurable,
  });

  patchedRtglFormConstructors.add(ctor);
};

const rtglPatchesEnabled = (() => {
  const params = new URLSearchParams(window.location.search);
  const flag = params.get("rtglCompat");
  if (flag === "0" || flag === "false") return false;
  return true;
})();

if (rtglPatchesEnabled) {
  console.info(
    "[routevn.boot] rtgl compatibility patches enabled (append ?rtglCompat=0 to disable)",
  );
  guardRtglAttributeUpdatesBeforeConnect();
  patchRtglFormCompatibility();
  customElements.whenDefined("rtgl-form").then(() => {
    patchRtglFormCompatibility();
  });
} else {
  console.info("[routevn.boot] rtgl compatibility patches disabled");
}

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
