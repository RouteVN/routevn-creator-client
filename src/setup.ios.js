import { createGlobalUI } from "@rettangoli/ui";

import { callIOSBridge } from "./deps/clients/ios/bridge.js";
import { createDb } from "./deps/clients/ios/db.js";
import { createIOSFilePicker } from "./deps/clients/ios/filePicker.js";
import IOSRouter from "./deps/clients/ios/router.js";

import { createAppService } from "./deps/services/ios/appService.js";
import { createProjectService } from "./deps/services/ios/projectService.js";
import { createPendingQueueService } from "./deps/services/pendingQueueService.js";
import { createApiService } from "./deps/services/apiService.js";

import { createAudioService } from "./deps/services/audioService.js";
import Subject from "./deps/subject.js";
import { createGraphicsService } from "./deps/services/graphicsService.js";
import { createBundleInstructions } from "./deps/services/shared/projectExportService.js";
import { deriveProjectFormatVersionFromAppVersion } from "./internal/projectCompatibility.js";
import { DEFAULT_PROJECT_RESOLUTION } from "./internal/projectResolution.js";
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

const readIOSEnv = (key, fallback) => {
  const value = window.env?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

const readIOSInitialPath = () => {
  const value = window.__ROUTEVN_IOS_INITIAL_PATH__;
  return typeof value === "string" && value.trim() ? value.trim() : "/projects";
};

const appDb = createDb({ path: "app.db" });
await appDb.init();

const initialPath = readIOSInitialPath();
const router = new IOSRouter({
  initialPath,
  resetStack: initialPath !== "/projects",
});
const filePicker = createIOSFilePicker();
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
let nativeBackInFlight = false;

const notifyIOSBackState = () => {
  callIOSBridge("updateBackState", {
    canGoBack: router.canGoBack(),
  }).catch(() => {
    // Native bridge may not be present in browser-based smoke checks.
  });
};

router.setOnStackChange(notifyIOSBackState);
window.routeVNNativeBack = () => {
  const backRequest = {
    handled: false,
    handle() {
      this.handled = true;
    },
  };

  subject.dispatch("app.nativeBack", backRequest);
  if (backRequest.handled) {
    notifyIOSBackState();
    return true;
  }

  if (!appService.canGoBack()) {
    notifyIOSBackState();
    return false;
  }

  if (nativeBackInFlight) {
    return true;
  }

  nativeBackInFlight = true;
  void appService
    .back()
    .catch((error) => {
      console.error("Failed to prepare iOS back navigation:", error);
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
      notifyIOSBackState();
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
    await callIOSBridge("openExternalUrl", { url });
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
  platform: "ios",
  audioService,
  projectService,
  subject,
});
await appService.initUserConfig();

if (window.__ROUTEVN_IOS_SMOKE_TEST__ === true) {
  window.routeVNIOSSmoke = {
    async run() {
      const before = await appService.loadAllProjects();
      const projectName = `iOS Smoke ${Date.now()}`;
      const createdProject = await appService.createNewProject({
        name: projectName,
        description: "Created by the iOS smoke test.",
        language: "en",
        template: "default",
        projectResolution: DEFAULT_PROJECT_RESOLUTION,
      });
      const after = await appService.loadAllProjects();
      appService.setCurrentProjectEntry(createdProject);
      appService.replace("/project", { p: createdProject?.id ?? "" });
      await projectService.ensureRepository();

      const assetFileId = "iosSmokeAsset";
      const assetJson = JSON.stringify({
        ok: true,
        projectId: createdProject?.id ?? "",
      });
      await callIOSBridge("writeProjectFile", {
        projectId: createdProject?.id ?? "",
        fileId: assetFileId,
        mimeType: "application/json",
        base64: btoa(assetJson),
      });

      const exportFilename = `ios-smoke-export-${Date.now()}.zip`;
      const exportPath = await filePicker.saveFilePicker({
        defaultPath: exportFilename,
        mimeType: "application/zip",
      });
      const exportData = createBundleInstructions({
        projectData: {
          screen: {
            width: DEFAULT_PROJECT_RESOLUTION.width,
            height: DEFAULT_PROJECT_RESOLUTION.height,
          },
        },
        bundler: {
          appVersion,
        },
        project: {
          namespace: createdProject?.id ?? "",
        },
      });
      const nativeExportResult = await callIOSBridge(
        "createDistributionZipStreamedToUri",
        {
          projectId: createdProject?.id ?? "",
          uri: exportPath,
          fileEntries: [{ id: assetFileId, mimeType: "application/json" }],
          instructionsJson: JSON.stringify(exportData),
          usePartFile: true,
          indexHtml: "<!doctype html><title>RouteVN Smoke</title>",
          mainJs: "console.log('RouteVN smoke export');",
        },
      );

      return {
        projectName,
        createdProjectId: createdProject?.id ?? "",
        beforeCount: Array.isArray(before) ? before.length : 0,
        afterCount: Array.isArray(after) ? after.length : 0,
        persisted:
          Array.isArray(after) &&
          after.some((entry) => entry?.id === createdProject?.id),
        assetFileId,
        exportedZipUri: nativeExportResult?.uri ?? exportPath,
        nativeZipStats: nativeExportResult?.stats ?? null,
      };
    },
  };
}

const apiService = createApiService({
  baseUrl: readIOSEnv("ROUTEVN_API_ENDPOINT", "https://api.example.invalid"),
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

notifyIOSBackState();

export { deps };
