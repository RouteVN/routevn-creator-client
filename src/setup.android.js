import { createGlobalUI } from "@rettangoli/ui";

import { createDb } from "./deps/clients/android/db.js";
import { createAndroidFilePicker } from "./deps/clients/android/filePicker.js";
import AndroidRouter from "./deps/clients/android/router.js";

import { createAppService } from "./deps/services/android/appService.js";
import { createProjectService } from "./deps/services/android/projectService.js";
import { createPendingQueueService } from "./deps/services/pendingQueueService.js";
import { createApiService } from "./deps/services/apiService.js";

import { createAudioService } from "./deps/services/audioService.js";
import Subject from "./deps/subject.js";
import { createGraphicsService } from "./deps/services/graphicsService.js";
import { deriveProjectFormatVersionFromAppVersion } from "./internal/projectCompatibility.js";
import { registerPrimitives } from "./primitives/registerPrimitives.js";
import tauriConfig from "../src-tauri/tauri.conf.json";

registerPrimitives();

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

const subject = new Subject();

const notifyAndroidBackState = () => {
  try {
    window.RouteVNAndroid?.updateBackState?.(router.canGoBack());
  } catch {
    // Android bridge may not be present in browser-based smoke checks.
  }
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

  const didGoBack = router.back();
  if (didGoBack) {
    subject.dispatch("app.route.request", {
      path: router.getPathName(),
      payload: router.getPayload(),
      shouldUpdateHistory: false,
    });
  }
  notifyAndroidBackState();
  return didGoBack;
};

const projectService = createProjectService({
  router,
  filePicker,
  db: appDb,
  creatorVersion,
});

const openUrl = async (url) => {
  if (window.RouteVNAndroid?.openExternalUrl) {
    window.RouteVNAndroid.openExternalUrl(url);
    return;
  }

  window.open(url, "_blank");
};

const appService = createAppService({
  db: appDb,
  router,
  globalUI,
  filePicker,
  openUrl,
  appVersion,
  platform: "android",
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
  let isDebugBuild = false;
  try {
    isDebugBuild = window.RouteVNAndroid?.isDebugBuild?.() === true;
  } catch {
    isDebugBuild = false;
  }

  if (!isDebugBuild) {
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

export { deps };
