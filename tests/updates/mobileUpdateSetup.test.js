import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import yaml from "js-yaml";
import { parseAndRender } from "jempl";
import { produce } from "immer";
import * as aboutStore from "../../src/pages/about/about.store.js";
import {
  handleBeforeMount as mountAbout,
  handleCheckForUpdates as checkAboutUpdates,
} from "../../src/pages/about/about.handlers.js";
import { ROUTEVN_CREATOR_APP_STORE_URL } from "../../src/internal/routevnUrls.js";
import { handleCreateDialogSubmit } from "../../src/pages/projects/projects.handlers.js";
import { handleDownloadAssetPackageButtonClick } from "../../src/pages/assetPackage/assetPackage.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const offeredPlayUrl =
  "https://play.google.com/store/apps/details?id=com.routevn.creator";
const availableAndroidUpdate = {
  status: "updateAvailable",
  release: {
    version: "1.15.0",
    changelog: "Improved editing",
    publishedAt: "2026-09-01T00:00:00Z",
    installation: { type: "googlePlay", url: offeredPlayUrl, build: "10" },
  },
};
const nativeAndroidInfo = (distribution = "google-play") => ({
  version: "1.14.0",
  arch: "aarch64",
  distribution,
  build: "9",
  model: "Example device",
  osVersion: "18.0",
});
const stubUpdateFetch = (result) => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        status: 200,
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const mocked = vi.hoisted(() => ({
  db: { init: vi.fn(), get: vi.fn(), getOrSet: vi.fn(), set: vi.fn() },
  bridge: vi.fn(),
  globalUI: {
    showConfirm: vi.fn(),
    showAlert: vi.fn(),
    showToast: vi.fn(),
  },
  projectService: {
    getRepositoryState: vi.fn(),
    updateLayoutElement: vi.fn(),
    updateControlElement: vi.fn(),
  },
}));

vi.mock("@rettangoli/ui", () => ({ createGlobalUI: () => mocked.globalUI }));
vi.mock("route-graphics", () => ({ configureAudioRuntime: vi.fn() }));
vi.mock("../../src/primitives/registerPrimitives.js", () => ({
  registerPrimitives: vi.fn(),
}));
vi.mock("../../src/deps/services/graphicsService.js", () => ({
  createGraphicsService: async () => ({}),
}));
vi.mock("../../src/deps/clients/android/audioRuntime.js", () => ({
  createAndroidAudioRuntime: () => ({ graphicsRuntime: {} }),
}));
vi.mock("../../src/deps/clients/mobileAudioRuntime.js", () => ({
  createMobileAudioRuntime: () => ({ graphicsRuntime: {} }),
}));
vi.mock("../../src/deps/clients/ios/graphicsAudioOutput.js", () => ({
  createIOSGraphicsAudioOutput: () => ({ graphicsRuntime: {} }),
}));
vi.mock("../../src/deps/clients/android/db.js", () => ({
  createDb: () => mocked.db,
}));
vi.mock("../../src/deps/clients/ios/db.js", () => ({
  createDb: () => mocked.db,
}));
vi.mock("../../src/deps/clients/android/bridge.js", () => ({
  callAndroidBridge: mocked.bridge,
}));
vi.mock("../../src/deps/clients/ios/bridge.js", () => ({
  callIOSBridge: mocked.bridge,
}));
vi.mock("../../src/deps/services/android/projectService.js", () => ({
  createProjectService: () => mocked.projectService,
}));
vi.mock("../../src/deps/services/ios/projectService.js", () => ({
  createProjectService: () => mocked.projectService,
}));

const bindStore = (module) => {
  let state = module.createInitialState();
  return Object.fromEntries(
    Object.entries(module).map(([name, fn]) => [
      name,
      (payload) => {
        if (name.startsWith("select")) {
          return fn({ state, i18n: EN_I18N }, payload);
        }
        state = produce(state, (draft) => {
          fn({ state: draft, i18n: EN_I18N }, payload);
        });
      },
    ]),
  );
};

let dom;
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocked.db.getOrSet.mockImplementation(async (_key, value) => value);
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://app.example.invalid",
    pretendToBeVisual: true,
  });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocked.globalUI.showConfirm.mockResolvedValue(false);
  mocked.globalUI.showAlert.mockResolvedValue(undefined);
  mocked.bridge.mockImplementation(async (method) => {
    if (method === "getAppUpdateDeviceInfo") return nativeAndroidInfo();
    if (method === "isDebugBuild") return false;
    if (
      ["updateBackState", "markSplashReady", "openExternalUrl"].includes(method)
    )
      return;
    throw new Error(`Unexpected bridge method: ${method}`);
  });
  stubUpdateFetch(availableAndroidUpdate);
});

afterEach(() => {
  dom.window.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const assertNoPlayUpdateBridgeCalls = () => {
  const methods = mocked.bridge.mock.calls.map(([method]) => method);
  expect(methods).not.toContain("getAppUpdateSupport");
  expect(methods).not.toContain("checkAppUpdate");
  expect(methods).not.toContain("startAppUpdate");
  expect(methods).not.toContain("completeAppUpdate");
};

const releaseMessage = EN_I18N.appPage.updateAvailableMessage
  .replace("{version}", "1.15.0")
  .replace("{releaseNotes}", "Improved editing");

describe("Android API update setup", () => {
  it("waits for project creation before showing the API release prompt", async () => {
    const {
      deps: { pages },
    } = await import("../../src/setup.android.js");
    let finishCreation;
    vi.spyOn(pages.appService, "createNewProject").mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCreation = resolve;
        }),
    );
    const store = { closeCreateDialog: vi.fn(), addProject: vi.fn() };
    const creating = handleCreateDialogSubmit(
      { ...pages, store, render: vi.fn(), i18n: EN_I18N },
      {
        _event: {
          detail: {
            values: {
              name: "Project One",
              template: "default",
              resolution: "1920x1080",
            },
          },
        },
      },
    );
    await vi.waitFor(() => expect(finishCreation).toBeTypeOf("function"));
    const checking = pages.updaterService.checkForUpdates(true, {
      copy: EN_I18N.appPage,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mocked.globalUI.showConfirm).not.toHaveBeenCalled();
    finishCreation({ id: "project-1", name: "Project One" });
    await creating;
    await checking;
    expect(store.addProject).toHaveBeenCalledOnce();
    expect(store.addProject.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.globalUI.showConfirm.mock.invocationCallOrder[0],
    );
    expect(mocked.globalUI.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: releaseMessage }),
    );
    assertNoPlayUpdateBridgeCalls();
  });

  it("waits for failed creation feedback to close before prompting", async () => {
    const {
      deps: { pages },
    } = await import("../../src/setup.android.js");
    let rejectCreation;
    vi.spyOn(pages.appService, "createNewProject").mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectCreation = reject;
        }),
    );
    let closeError;
    mocked.globalUI.showAlert.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          closeError = resolve;
        }),
    );
    const creating = handleCreateDialogSubmit(
      {
        ...pages,
        store: { closeCreateDialog: vi.fn(), addProject: vi.fn() },
        render: vi.fn(),
        i18n: EN_I18N,
      },
      {
        _event: {
          detail: { values: { name: "Project One", resolution: "1920x1080" } },
        },
      },
    );
    await vi.waitFor(() => expect(rejectCreation).toBeTypeOf("function"));
    const checking = pages.updaterService.checkForUpdates(true, {
      copy: EN_I18N.appPage,
    });
    rejectCreation(new Error("Template copy failed"));
    await creating;
    await vi.waitFor(() => expect(closeError).toBeTypeOf("function"));
    expect(mocked.globalUI.showConfirm).not.toHaveBeenCalled();
    closeError();
    await checking;
    expect(mocked.globalUI.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: releaseMessage }),
    );
  });

  it("waits for asset package output before showing the API release prompt", async () => {
    const {
      deps: { pages },
    } = await import("../../src/setup.android.js");
    vi.spyOn(pages.appService, "saveFilePicker").mockResolvedValue(
      "/tmp/package.zip",
    );
    let finishBundle;
    const createAssetPackageBundle = vi.fn(
      () =>
        new Promise((resolve) => {
          finishBundle = resolve;
        }),
    );
    let finishWrite;
    const writeFile = vi
      .spyOn(pages.appService, "writeFile")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finishWrite = resolve;
          }),
      );
    const exporting = handleDownloadAssetPackageButtonClick({
      ...pages,
      i18n: EN_I18N,
      projectService: { createAssetPackageBundle },
      store: {
        selectAssetPackageData: () => ({
          files: {
            items: {
              "file-1": {
                id: "file-1",
                mimeType: "image/png",
                source: { url: "./files/file-1" },
              },
            },
          },
          images: {
            items: {
              "image-1": {
                id: "image-1",
                type: "image",
                name: "Image One",
                fileId: "file-1",
              },
            },
            tree: [{ id: "image-1" }],
          },
        }),
      },
    });
    await vi.waitFor(() => expect(finishBundle).toBeTypeOf("function"));
    const checking = pages.updaterService.checkForUpdates(true, {
      copy: EN_I18N.appPage,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mocked.globalUI.showConfirm).not.toHaveBeenCalled();
    finishBundle(new Blob(["package"]));
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf("function"));
    expect(mocked.globalUI.showConfirm).not.toHaveBeenCalled();
    finishWrite("/tmp/package.zip");
    await exporting;
    await checking;
    expect(writeFile).toHaveBeenCalledOnce();
    expect(mocked.globalUI.showAlert.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.globalUI.showConfirm.mock.invocationCallOrder[0],
    );
    expect(mocked.globalUI.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: releaseMessage }),
    );
    assertNoPlayUpdateBridgeCalls();
  });

  it.each([0, 1])(
    "waits for all overlapping progress owners when owner %s closes first",
    async (first) => {
      const {
        deps: { pages },
      } = await import("../../src/setup.android.js");
      const progress = [
        pages.appService.showProgressDialog({ title: "Creating project" }),
        pages.appService.showProgressDialog({ title: "Exporting project" }),
      ];
      const checking = pages.updaterService.checkForUpdates(true, {
        copy: EN_I18N.appPage,
      });
      progress[first].close();
      progress[first].close();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mocked.globalUI.showConfirm).not.toHaveBeenCalled();
      progress[1 - first].close();
      await checking;
      expect(mocked.globalUI.showConfirm).toHaveBeenCalledOnce();
      assertNoPlayUpdateBridgeCalls();
    },
  );

  it("leaves pending user settings untouched when opening the offered store URL", async () => {
    const {
      deps: { pages },
    } = await import("../../src/setup.android.js");
    pages.appService.setUserConfig("appearance.theme", "light");
    mocked.globalUI.showConfirm.mockResolvedValue(true);
    await pages.updaterService.checkForUpdates(false, {
      copy: EN_I18N.appPage,
    });
    expect(mocked.bridge).toHaveBeenCalledWith("openExternalUrl", {
      url: offeredPlayUrl,
    });
    expect(pages.appService.getUserConfig("appearance.theme")).toBe("light");
    await pages.appService.flushUserConfig();
    expect(mocked.db.set).toHaveBeenCalledWith(
      "userConfig",
      expect.objectContaining({ appearance: { theme: "light" } }),
    );
    assertNoPlayUpdateBridgeCalls();
  });

  it("shows the common manual error when iOS update metadata is unavailable", async () => {
    const {
      deps: { pages },
    } = await import("../../src/setup.ios.js");
    const store = bindStore(aboutStore);
    mountAbout({ ...pages, store });
    const view = yaml.load(
      readFileSync(
        new URL("../../src/pages/about/about.view.yaml", import.meta.url),
        "utf8",
      ),
    );
    const template = JSON.stringify(
      parseAndRender(view.template, store.selectViewData()),
    );
    expect(template).toContain("#checkUpdateButton");
    const openUrl = vi
      .spyOn(pages.appService, "openUrl")
      .mockResolvedValue(undefined);
    await checkAboutUpdates({ ...pages, store, render: vi.fn() });
    expect(openUrl).not.toHaveBeenCalled();
    expect(mocked.globalUI.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: EN_I18N.appPage.retrieveUpdateInfoFallback,
      }),
    );
  });
});

describe("mobile update API setup", () => {
  const nativeInfo = (platform, distribution) => {
    const info = {
      version: "1.14.0",
      arch: "aarch64",
      model: "Example device",
      osVersion: "18.0",
    };
    if (platform === "android") {
      info.distribution = distribution;
      info.build = "9";
    }
    return info;
  };

  it.each(["google-play", "direct"])(
    "uses native Android version and %s distribution",
    async (distribution) => {
      const fetchMock = stubUpdateFetch({
        status: "noUpdate",
        reason: "upToDate",
      });
      const original = mocked.bridge.getMockImplementation();
      mocked.bridge.mockImplementation(async (method, params) => {
        if (method === "getAppUpdateDeviceInfo")
          return nativeInfo("android", distribution);
        return original(method, params);
      });
      const {
        deps: { pages },
      } = await import("../../src/setup.android.js");
      expect(pages.appService.getAppVersion()).toBe("1.14.0");
      expect(pages.appService.getDistribution()).toBe(distribution);
      if (distribution === "direct") {
        expect(pages.updaterService).toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
      } else {
        await pages.updaterService.checkForUpdates(false, {
          copy: EN_I18N.appPage,
        });
        expect(fetchMock).toHaveBeenCalledWith(
          "https://api1.routevn.com/system/updates/v1/routevn-creator/mobile",
          expect.objectContaining({
            method: "POST",
            credentials: "omit",
          }),
        );
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
          method: "system.getClientUpdate",
          params: {
            appId: "routevn-creator",
            target: "android",
            distribution: "google-play",
            currentBuild: "9",
            device: {
              id: expect.stringMatching(/^[1-9A-HJ-NP-Za-km-z]{24}$/),
            },
          },
        });
        expect(mocked.globalUI.showConfirm).not.toHaveBeenCalled();
        expect(mocked.globalUI.showAlert).toHaveBeenCalledWith(
          expect.objectContaining({
            message: EN_I18N.appPage.latestVersionMessage,
          }),
        );
      }
      assertNoPlayUpdateBridgeCalls();
    },
  );

  it("leaves an unfamiliar Android architecture without an updater", async () => {
    const fetchMock = stubUpdateFetch({
      status: "noUpdate",
      reason: "upToDate",
    });
    const original = mocked.bridge.getMockImplementation();
    mocked.bridge.mockImplementation(async (method, params) => {
      if (method === "getAppUpdateDeviceInfo") {
        const info = nativeInfo("android", "google-play");
        info.arch = "unknown";
        return info;
      }
      return original(method, params);
    });
    const {
      deps: { pages },
    } = await import("../../src/setup.android.js");
    expect(pages.updaterService).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    assertNoPlayUpdateBridgeCalls();
  });

  it("uses native iOS version and sends About through WebView fetch", async () => {
    const fetchMock = stubUpdateFetch({
      status: "noUpdate",
      reason: "upToDate",
    });
    const original = mocked.bridge.getMockImplementation();
    mocked.bridge.mockImplementation(async (method, params) => {
      if (method === "getAppUpdateDeviceInfo")
        return nativeInfo("ios", "app-store");
      if (method === "getUpdateApiUrlOverride") return undefined;
      return original(method, params);
    });
    const {
      deps: { pages },
    } = await import("../../src/setup.ios.js");
    const store = bindStore(aboutStore);
    mountAbout({ ...pages, store });
    expect(pages.appService.getAppVersion()).toBe("1.14.0");
    expect(pages.appService.getDistribution()).toBe("app-store");
    const openUrl = vi.spyOn(pages.appService, "openUrl");
    await checkAboutUpdates({
      ...pages,
      store,
      render: vi.fn(),
      i18n: EN_I18N,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api1.routevn.com/system/updates/v1/routevn-creator/mobile",
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      method: "system.getClientUpdate",
      params: {
        appId: "routevn-creator",
        target: "ios",
        distribution: "app-store",
        device: {
          id: expect.stringMatching(/^[1-9A-HJ-NP-Za-km-z]{24}$/),
        },
      },
    });
    expect(mocked.globalUI.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: EN_I18N.appPage.latestVersionMessage,
      }),
    );
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("keeps iOS automatic prompts behind appService progress work", async () => {
    stubUpdateFetch({
      status: "updateAvailable",
      release: {
        version: "1.16.0",
        changelog: "Improved editing",
        publishedAt: "2026-09-01T00:00:00Z",
        installation: {
          type: "appStore",
          url: ROUTEVN_CREATOR_APP_STORE_URL,
        },
      },
    });
    const original = mocked.bridge.getMockImplementation();
    mocked.bridge.mockImplementation(async (method, params) => {
      if (method === "getAppUpdateDeviceInfo")
        return nativeInfo("ios", "app-store");
      if (method === "getUpdateApiUrlOverride") return undefined;
      return original(method, params);
    });
    mocked.globalUI.showConfirm.mockResolvedValue(false);
    const {
      deps: { pages },
    } = await import("../../src/setup.ios.js");
    const progress = pages.appService.showProgressDialog({
      title: "Exporting",
    });
    const checking = pages.updaterService.checkForUpdates(true, {
      copy: EN_I18N.appPage,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mocked.globalUI.showConfirm).not.toHaveBeenCalled();
    progress.close();
    await checking;
    expect(mocked.globalUI.showConfirm).toHaveBeenCalledOnce();
  });
});
