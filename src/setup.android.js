import { createGlobalUI } from "@rettangoli/ui";
import { configureAudioRuntime } from "route-graphics";

import { createDb } from "./deps/clients/android/db.js";
import { callAndroidBridge } from "./deps/clients/android/bridge.js";
import { createAndroidFilePicker } from "./deps/clients/android/filePicker.js";
import { createAndroidAudioRuntime } from "./deps/clients/android/audioRuntime.js";
import { createAndroidUpdater } from "./deps/clients/android/updater.js";
import AndroidRouter from "./deps/clients/android/router.js";
import { createBrowserEventsClient } from "./deps/clients/browserEvents.js";

import { createAppService } from "./deps/services/android/appService.js";
import { createProjectService } from "./deps/services/android/projectService.js";
import { createPendingQueueService } from "./deps/services/pendingQueueService.js";
import { createApiService } from "./deps/services/apiService.js";

import { createAudioService } from "./deps/services/audioService.js";
import Subject from "./deps/subject.js";
import { createGraphicsService } from "./deps/services/graphicsService.js";
import { deriveProjectFormatVersionFromAppVersion } from "./internal/projectCompatibility.js";
import { registerPrimitives } from "./primitives/registerPrimitives.js";
import { setAndroidDebugBuild } from "./internal/navigationTiming.js";
import tauriConfig from "../src-tauri/tauri.conf.json";

registerPrimitives();

const androidAudioRuntime = createAndroidAudioRuntime();
configureAudioRuntime(androidAudioRuntime.graphicsRuntime);

let isAndroidDebugBuild = false;
try {
  isAndroidDebugBuild = await callAndroidBridge("isDebugBuild");
} catch {
  // The bridge is absent in browser-only smoke checks.
}
setAndroidDebugBuild(isAndroidDebugBuild);

const uiConfig = {
  id: "touch",
  inputMode: "touch",
  navigation: "bottom",
};
document.documentElement.dataset.rvnUiVersion = uiConfig.id;
document.documentElement.dataset.rvnInputMode = uiConfig.inputMode;

const readAndroidEnv = (key, fallback) => {
  const value = window.env?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

const appDb = createDb({ path: "app.db" });
await appDb.init();

const router = new AndroidRouter({ initialPath: "/projects" });
const filePicker = createAndroidFilePicker();
const globalUIElement = document.querySelector("rtgl-global-ui");
const globalUI = createGlobalUI(globalUIElement);
const audioService = createAudioService({
  createAudioContext: androidAudioRuntime.createAudioContext,
});
const browserEventsClient = createBrowserEventsClient();

const appVersion = tauriConfig.version;
const creatorVersion = deriveProjectFormatVersionFromAppVersion(appVersion);

const updater = await createAndroidUpdater({
  globalUI,
  keyValueStore: appDb,
  browserEventsClient,
  getCopy: () => appService.getAppCopy(),
  beforeInstall: async () => {
    await appService.prepareNavigation({ path: "/projects" });
    await appService.flushUserConfig();
  },
});

const subject = new Subject();
let nativeBackInFlight = false;

const notifyAndroidBackState = () => {
  void callAndroidBridge("updateBackState", {
    canGoBack: router.canGoBack(),
  }).catch(() => {
    // The bridge is absent in browser-only smoke checks.
  });
};

router.setOnStackChange(notifyAndroidBackState);
window.routeVNNativeBack = () => {
  const backRequest = {
    handled: false,
    handle() {
      this.handled = true;
    },
  };

  subject.dispatch("app.nativeBack", backRequest);
  if (backRequest.handled) {
    notifyAndroidBackState();
    return true;
  }

  if (!appService.canGoBack()) {
    notifyAndroidBackState();
    return false;
  }

  if (nativeBackInFlight) {
    return true;
  }

  nativeBackInFlight = true;
  void appService
    .back()
    .catch((error) => {
      console.error("Failed to prepare Android back navigation:", error);
      const copy = appService.getAppCopy();
      appService.showToast({
        title: copy.errorTitle ?? "Error",
        message:
          copy.navigationFailed ?? "Could not go back. Please try again.",
        status: "error",
      });
    })
    .finally(() => {
      nativeBackInFlight = false;
      notifyAndroidBackState();
    });

  return true;
};

const projectService = createProjectService({
  router,
  filePicker,
  db: appDb,
  creatorVersion,
});

const openUrl = async (url) => {
  try {
    await callAndroidBridge("openExternalUrl", { url });
    return;
  } catch {
    window.open(url, "_blank");
  }
};

const appService = createAppService({
  db: appDb,
  router,
  globalUI,
  filePicker,
  openUrl,
  appVersion,
  platform: "android",
  updatesEnabled: Boolean(updater),
  updater,
  audioService,
  projectService,
  subject,
});
await appService.initUserConfig();

const apiService = createApiService({
  baseUrl: readAndroidEnv(
    "ROUTEVN_API_ENDPOINT",
    "https://api.example.invalid",
  ),
});

const graphicsService = await createGraphicsService({ subject });
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
  browserEventsClient,
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

const installAndroidDebugHooks = () => {
  if (!isAndroidDebugBuild) {
    return;
  }

  window.__RVN_DEBUG_APP__ = {
    listProjects: () => appService.loadAllProjects(),
    async openProject(projectId) {
      const projects = await appService.loadAllProjects();
      const project = projects.find((entry) => entry?.id === projectId);
      if (project) {
        appService.setCurrentProjectEntry(project);
      }
      await projectService.ensureProjectCompatibleById(projectId);
      appService.navigate("/project", { p: projectId });
    },
    navigate: (path, payload) => {
      appService.navigate(path, payload);
    },
    getPayload: () => appService.getPayload(),
  };
};

installAndroidDebugHooks();
notifyAndroidBackState();
void callAndroidBridge("markSplashReady").catch(() => {});

export { deps };
