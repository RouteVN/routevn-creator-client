import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import yaml from "js-yaml";
import { parseAndRender } from "jempl";
import { produce } from "immer";
import * as layoutStore from "../../src/pages/layoutEditor/layoutEditor.store.js";
import * as aboutStore from "../../src/pages/about/about.store.js";
import { handleBeforeMount as mountAbout } from "../../src/pages/about/about.handlers.js";
import {
  handleBeforeMount as mountLayoutEditor,
  handleLayoutEditorCanvasDragUpdate,
} from "../../src/pages/layoutEditor/layoutEditor.handlers.js";
import { createLayoutEditorRepositoryStoreData } from "../../src/pages/layoutEditor/support/layoutEditorRepositoryState.js";
import { handleCreateDialogSubmit } from "../../src/pages/projects/projects.handlers.js";
import { handleDownloadAssetPackageButtonClick } from "../../src/pages/assetPackage/assetPackage.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const mocked = vi.hoisted(() => ({
  db: { init: vi.fn(), get: vi.fn(), set: vi.fn() },
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
let cleanupEditor;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://app.example.invalid",
    pretendToBeVisual: true,
  });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocked.globalUI.showConfirm.mockResolvedValue(true);
  mocked.globalUI.showAlert.mockResolvedValue(undefined);
  mocked.bridge.mockImplementation(async (method) => {
    if (method === "getAppUpdateSupport") return { status: "supported" };
    if (method === "checkAppUpdate")
      return { status: "downloaded", versionCode: 6 };
    if (method === "completeAppUpdate") return { status: "installing" };
    if (method === "isDebugBuild") return false;
    if (["updateBackState", "markSplashReady"].includes(method)) return;
    throw new Error(`Unexpected bridge method: ${method}`);
  });
});

afterEach(async () => {
  await cleanupEditor?.();
  cleanupEditor = undefined;
  dom.window.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const openEditor = (pages, resourceType) => {
  let repositoryState = {
    project: { resolution: { width: 1920, height: 1080 } },
    [resourceType]: {
      items: {
        "layout-1": {
          elements: {
            tree: [{ id: "item-1" }],
            items: {
              "item-1": {
                type: "container",
                name: "Container One",
                x: 0,
                y: 0,
              },
            },
          },
        },
      },
    },
  };
  mocked.projectService.getRepositoryState.mockImplementation(
    () => repositoryState,
  );
  const updateElement =
    resourceType === "controls"
      ? mocked.projectService.updateControlElement
      : mocked.projectService.updateLayoutElement;
  updateElement.mockImplementation(async ({ data }) => {
    repositoryState = produce(repositoryState, (draft) => {
      Object.assign(
        draft[resourceType].items["layout-1"].elements.items["item-1"],
        data,
      );
    });
    return { valid: true };
  });
  pages.appService.replace("/project/layout-editor", {
    p: "project-1",
    [resourceType === "controls" ? "c" : "l"]: "layout-1",
  });
  const store = bindStore(layoutStore);
  store.syncRepositoryState(
    createLayoutEditorRepositoryStoreData({
      repositoryState,
      layoutId: "layout-1",
      resourceType,
    }),
  );
  const deps = { ...pages, store, render: vi.fn(), refs: {}, i18n: EN_I18N };
  cleanupEditor = mountLayoutEditor(deps);
  handleLayoutEditorCanvasDragUpdate(deps, {
    _event: {
      detail: {
        itemId: "item-1",
        updatedItem: {
          id: "item-1",
          type: "container",
          name: "Container One",
          x: 24,
          y: 0,
        },
      },
    },
  });
  return { store, updateElement };
};

describe("mobile setup update persistence", () => {
  it("waits for project creation to finish before offering restart", async () => {
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
    const updating = pages.updaterService.checkForUpdates(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    try {
      expect(mocked.globalUI.showConfirm).not.toHaveBeenCalled();
      expect(mocked.bridge).not.toHaveBeenCalledWith("completeAppUpdate");
    } finally {
      finishCreation({ id: "project-1", name: "Project One" });
      await creating;
      await updating;
    }
    expect(store.addProject).toHaveBeenCalledOnce();
    expect(store.addProject.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.globalUI.showConfirm.mock.invocationCallOrder[0],
    );
    expect(mocked.bridge).toHaveBeenCalledWith("completeAppUpdate");
  });

  it("releases failed creation progress and waits for its error feedback before prompting", async () => {
    const {
      deps: { pages },
    } = await import("../../src/setup.android.js");
    let rejectCreation;
    vi.spyOn(pages.appService, "createNewProject").mockImplementation(
      () =>
        new Promise((resolve, reject) => {
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
    const updating = pages.updaterService.checkForUpdates(true);
    rejectCreation(new Error("Template copy failed"));
    await creating;
    await new Promise((resolve) => setTimeout(resolve, 10));
    try {
      expect(document.querySelector("#routevn-progress-dialog")).toBeNull();
      expect(closeError).toBeTypeOf("function");
      expect(mocked.globalUI.showConfirm).not.toHaveBeenCalled();
      expect(mocked.bridge).not.toHaveBeenCalledWith("completeAppUpdate");
    } finally {
      closeError();
      await updating;
    }
    expect(mocked.bridge).toHaveBeenCalledWith("completeAppUpdate");
  });

  it("waits for asset package generation and output writing before offering restart", async () => {
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
    const updating = pages.updaterService.checkForUpdates(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    try {
      expect(mocked.globalUI.showConfirm).not.toHaveBeenCalled();
      finishBundle(new Blob(["package"]));
      await vi.waitFor(() => expect(finishWrite).toBeTypeOf("function"));
      expect(mocked.globalUI.showConfirm).not.toHaveBeenCalled();
      expect(mocked.bridge).not.toHaveBeenCalledWith("completeAppUpdate");
    } finally {
      finishBundle(new Blob(["package"]));
      await vi.waitFor(() => expect(finishWrite).toBeTypeOf("function"));
      finishWrite("/tmp/package.zip");
      await exporting;
      await updating;
    }
    expect(writeFile).toHaveBeenCalledOnce();
    expect(mocked.globalUI.showAlert.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.globalUI.showConfirm.mock.invocationCallOrder[0],
    );
    expect(mocked.bridge).toHaveBeenCalledWith("completeAppUpdate");
  });

  it.each([0, 1])(
    "waits for all overlapping progress owners when closing owner %s first",
    async (first) => {
      const {
        deps: { pages },
      } = await import("../../src/setup.android.js");
      const progress = [
        pages.appService.showProgressDialog({ title: "Creating project" }),
        pages.appService.showProgressDialog({ title: "Exporting project" }),
      ];
      const updating = pages.updaterService.checkForUpdates(true);
      progress[first].close();
      progress[first].close();
      await new Promise((resolve) => setTimeout(resolve, 10));
      try {
        expect(mocked.globalUI.showConfirm).not.toHaveBeenCalled();
        expect(mocked.bridge).not.toHaveBeenCalledWith("completeAppUpdate");
      } finally {
        progress[1 - first].close();
        await updating;
      }
      expect(mocked.globalUI.showConfirm).toHaveBeenCalledOnce();
      expect(mocked.bridge).toHaveBeenCalledWith("completeAppUpdate");
    },
  );

  it("rechecks progress work before native restart without waiting on its own progress dialog", async () => {
    const {
      deps: { pages },
    } = await import("../../src/setup.android.js");
    let progress;
    const unregister = pages.appService.registerBeforeNavigation(() => {
      progress = pages.appService.showProgressDialog({
        title: "Exporting project",
      });
    });
    const updating = pages.updaterService.checkForUpdates(false);
    await vi.waitFor(() => expect(progress).toBeDefined());
    try {
      expect(mocked.globalUI.showConfirm).toHaveBeenCalledOnce();
      expect(
        document.querySelector("#routevn-update-progress-dialog[open]"),
      ).not.toBeNull();
      expect(mocked.bridge).not.toHaveBeenCalledWith("completeAppUpdate");
    } finally {
      progress.close();
      unregister();
      await updating;
    }
    expect(mocked.bridge).toHaveBeenCalledWith("completeAppUpdate");
    expect(
      document.querySelector("#routevn-update-progress-dialog"),
    ).toBeNull();
  });

  it.each(["layouts", "controls"])(
    "waits for queued %s edits and settings before installing",
    async (resourceType) => {
      const {
        deps: { pages },
      } = await import("../../src/setup.android.js");
      const { store, updateElement } = openEditor(pages, resourceType);
      const save = updateElement.getMockImplementation();
      let finishSave;
      updateElement.mockImplementationOnce(async (payload) => {
        await new Promise((resolve) => {
          finishSave = resolve;
        });
        return save(payload);
      });
      pages.appService.setUserConfig("appearance.theme", "light");
      const updating = pages.updaterService.checkForUpdates(false);
      try {
        await vi.waitFor(() => expect(finishSave).toBeTypeOf("function"));
        expect(mocked.bridge).not.toHaveBeenCalledWith("completeAppUpdate");
        expect(store.selectPendingPersistPayload()).toBeDefined();
      } finally {
        finishSave?.();
        await updating;
      }
      expect(store.selectPendingPersistPayload()).toBeUndefined();
      expect(mocked.db.set).toHaveBeenCalledWith(
        "userConfig",
        expect.objectContaining({ appearance: { theme: "light" } }),
      );
      expect(mocked.bridge).toHaveBeenCalledWith("completeAppUpdate");
      expect(mocked.db.set.mock.invocationCallOrder.at(-1)).toBeLessThan(
        mocked.bridge.mock.invocationCallOrder.at(-1),
      );

      await cleanupEditor();
      cleanupEditor = undefined;
      const pending = { persistenceRequestId: "unmounted-edit" };
      store.setPendingPersistPayload({ payload: pending });
      await pages.appService.prepareNavigation({ path: "/projects" });
      expect(store.selectPendingPersistPayload()).toEqual(pending);
    },
  );

  it.each(["layouts", "controls"])(
    "aborts installation on a failed %s save and retains the edit for retry",
    async (resourceType) => {
      const {
        deps: { pages },
      } = await import("../../src/setup.android.js");
      pages.appService.setAppCopyProvider(() => EN_I18N.appPage);
      const { store, updateElement } = openEditor(pages, resourceType);
      updateElement.mockResolvedValueOnce({
        valid: false,
        error: { message: "Save failed" },
      });
      await pages.updaterService.checkForUpdates(false);
      expect(mocked.bridge).not.toHaveBeenCalledWith("completeAppUpdate");
      expect(store.selectPendingPersistPayload()).toBeDefined();
      expect(mocked.globalUI.showAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: EN_I18N.appPage.googlePlayUpdateFailed,
        }),
      );
      expect(
        document.querySelector("#routevn-update-progress-dialog"),
      ).toBeNull();

      updateElement.mockRejectedValueOnce(new Error("Database write failed"));
      await pages.updaterService.checkForUpdates(false);
      expect(mocked.bridge).not.toHaveBeenCalledWith("completeAppUpdate");
      expect(store.selectPendingPersistPayload()).toBeDefined();

      await pages.updaterService.checkForUpdates(false);
      expect(store.selectPendingPersistPayload()).toBeUndefined();
      expect(mocked.bridge).toHaveBeenCalledWith("completeAppUpdate");
    },
  );

  it("aborts on a settings write failure and saves retained settings on retry", async () => {
    const {
      deps: { pages },
    } = await import("../../src/setup.android.js");
    pages.appService.setAppCopyProvider(() => EN_I18N.appPage);
    pages.appService.setUserConfig("appearance.theme", "light");
    mocked.db.set.mockRejectedValueOnce(new Error("Database write failed"));
    await pages.updaterService.checkForUpdates(false);
    expect(mocked.bridge).not.toHaveBeenCalledWith("completeAppUpdate");
    expect(mocked.globalUI.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: EN_I18N.appPage.googlePlayUpdateFailed,
      }),
    );
    expect(pages.appService.getUserConfig("appearance.theme")).toBe("light");

    await pages.updaterService.checkForUpdates(false);
    expect(mocked.db.set).toHaveBeenLastCalledWith(
      "userConfig",
      expect.objectContaining({ appearance: { theme: "light" } }),
    );
    expect(mocked.bridge).toHaveBeenCalledWith("completeAppUpdate");
  });

  it("keeps the About update button hidden with the actual iOS setup dependencies", async () => {
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
    expect(template).not.toContain("#checkUpdateButton");
  });
});
