import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIOSProjectFolderSetup } from "../../src/deps/clients/ios/projectFolderSetup.js";
import * as actions from "../../src/pages/projectFolderSetup/projectFolderSetup.store.js";
import * as handlers from "../../src/pages/projectFolderSetup/projectFolderSetup.handlers.js";
import {
  selectViewData as selectAppViewData,
  createInitialState as createAppState,
} from "../../src/pages/app/app.store.js";
import IOSRouter from "../../src/deps/clients/ios/router.js";

const i18n = yaml.load(
  readFileSync(new URL("../../src/i18n/en.yaml", import.meta.url), "utf8"),
);
const folder = {
  name: "My Projects",
  displayPath: "On My iPhone/My Projects",
};
const candidate = { ...folder, uri: "routevn-folder://selected/folder-1" };

const installBridge = (respond) => {
  const calls = [];
  vi.stubGlobal("window", {
    webkit: {
      messageHandlers: {
        RouteVNIOS: {
          postMessage(message) {
            calls.push(message);
            Promise.resolve().then(() => {
              const result = respond(message);
              window.__routeVNIOSBridgeResult({ id: message.id, ...result });
            });
          },
        },
      },
    },
  });
  return calls;
};

const createDeps = () => {
  const state = actions.createInitialState();
  const store = {};
  for (const [name, fn] of Object.entries(actions)) {
    store[name] = (payload) => fn({ state, i18n }, payload);
  }
  const appService = {
    getPayload: vi.fn(() => ({})),
    canGoBack: vi.fn(() => false),
    back: vi.fn(),
    getProjectFolderSetup: vi.fn(() => ({ configured: false })),
    pickProjectFolderSetup: vi.fn(async () => candidate),
    confirmProjectFolderSetup: vi.fn(async () => ({
      configured: true,
      folder,
    })),
    showToast: vi.fn(),
    navigate: vi.fn(),
  };
  return { state, store, appService, i18n, render: vi.fn() };
};

afterEach(() => vi.unstubAllGlobals());

describe("iOS project folder setup client", () => {
  it("previews the opaque picker URI without saving anything before Confirm", async () => {
    const calls = installBridge(() => ({ ok: true, value: candidate }));
    const filePicker = { openFolderPicker: vi.fn(async () => candidate) };
    const client = createIOSProjectFolderSetup({ filePicker });
    expect(await client.pick({ title: "Choose folder" })).toEqual(candidate);
    expect(filePicker.openFolderPicker).toHaveBeenCalledWith({
      title: "Choose folder",
      writable: true,
    });
    expect(calls.map(({ method, payload }) => ({ method, payload }))).toEqual([
      { method: "previewProjectFolderSetup", payload: { uri: candidate.uri } },
    ]);
    expect(client.getStatus().configured).toBe(false);
  });

  it("treats picker cancellation as no selection", async () => {
    const calls = installBridge(() => {
      throw new Error("Unexpected native call");
    });
    const client = createIOSProjectFolderSetup({
      filePicker: { openFolderPicker: async () => undefined },
    });
    expect(await client.pick({ title: "Choose folder" })).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("keeps a previously confirmed choice when confirming a replacement fails", async () => {
    installBridge(({ method }) =>
      method === "getProjectFolderSetup"
        ? { ok: true, value: { configured: true, folder } }
        : { ok: false, error: { code: "access", message: "Access denied" } },
    );
    const client = createIOSProjectFolderSetup({ filePicker: {} });
    await client.load();
    await expect(client.confirm({ uri: candidate.uri })).rejects.toThrow(
      "Access denied",
    );
    expect(client.getStatus()).toEqual({ configured: true, folder });
  });

  it("loads the native bookmark status in a new client instance", async () => {
    const saved = { configured: true, folder };
    installBridge(() => ({ ok: true, value: saved }));
    const first = createIOSProjectFolderSetup({ filePicker: {} });
    await first.confirm({ uri: candidate.uri });
    const reopened = createIOSProjectFolderSetup({ filePicker: {} });
    expect(await reopened.load()).toEqual(saved);
  });

  it("surfaces an old native shell as unavailable instead of skipping setup", async () => {
    installBridge(() => ({ ok: false, error: { message: "Unknown method" } }));
    const filePicker = { openFolderPicker: vi.fn() };
    const client = createIOSProjectFolderSetup({ filePicker });
    expect(await client.load()).toEqual({
      configured: false,
      reason: "unavailable",
    });
    await expect(client.pick({ title: "Choose folder" })).rejects.toMatchObject(
      {
        code: "unavailable",
      },
    );
    expect(filePicker.openFolderPicker).not.toHaveBeenCalled();
  });
});

describe("project folder onboarding", () => {
  it("shows the actual selected path and waits for confirmation", async () => {
    const deps = createDeps();
    handlers.handleBeforeMount(deps);
    await handlers.handleSetup(deps);
    const view = deps.store.selectViewData();
    expect(view.displayPath).toBe(folder.displayPath);
    expect(view.hasCandidate).toBe(true);
    expect(deps.appService.confirmProjectFolderSetup).not.toHaveBeenCalled();
    await handlers.handleConfirm(deps);
    expect(deps.appService.confirmProjectFolderSetup).toHaveBeenCalledWith({
      uri: candidate.uri,
    });
    expect(deps.store.selectViewData().hasSavedFolder).toBe(true);
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("keeps the previous candidate when Change folder is cancelled", async () => {
    const deps = createDeps();
    await handlers.handleSetup(deps);
    deps.appService.pickProjectFolderSetup.mockResolvedValue(undefined);
    await handlers.handleSetup(deps);
    expect(deps.store.selectCandidate()).toEqual(candidate);
    expect(deps.state.isBusy).toBe(false);
    expect(deps.appService.showToast).not.toHaveBeenCalled();
  });

  it("blocks duplicate taps while the native picker is open", async () => {
    const deps = createDeps();
    let resolve;
    deps.appService.pickProjectFolderSetup.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = handlers.handleSetup(deps);
    await handlers.handleSetup(deps);
    expect(deps.appService.pickProjectFolderSetup).toHaveBeenCalledTimes(1);
    resolve(candidate);
    await pending;
  });

  it("rejects an app folder with a stable localized message", async () => {
    const deps = createDeps();
    deps.appService.pickProjectFolderSetup.mockRejectedValue(
      Object.assign(new Error("native details"), { code: "appFolder" }),
    );
    await handlers.handleSetup(deps);
    expect(deps.store.selectCandidate()).toBeUndefined();
    expect(deps.store.selectViewData().errorMessage).toBe(
      "This folder belongs to an app. Choose a separate folder under On My iPhone.",
    );
    expect(deps.appService.showToast).toHaveBeenCalledTimes(1);
  });

  it.each(["en", "ja", "zh-hans"])(
    "uses the native iPad name in %s setup instructions and errors",
    async (locale) => {
      const messages = yaml.load(
        readFileSync(
          new URL(`../../src/i18n/${locale}.yaml`, import.meta.url),
          "utf8",
        ),
      );
      const deps = createDeps();
      deps.appService.getProjectFolderSetup.mockReturnValue({
        configured: false,
        deviceName: "iPad",
      });
      handlers.handleBeforeMount(deps);
      const copy = actions.selectCopy({ state: deps.state, i18n: messages });
      for (const key of ["description", "appFolderError", "localFolderError"]) {
        expect(copy[key]).toContain("iPad");
        expect(copy[key]).not.toContain("iPhone");
        expect(copy[key]).not.toContain("{deviceName}");
      }
      deps.appService.pickProjectFolderSetup.mockRejectedValue(
        Object.assign(new Error("native details"), { code: "localFolder" }),
      );
      await handlers.handleSetup(deps);
      expect(deps.appService.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("On My iPad"),
        }),
      );
    },
  );

  it("keeps the candidate and error visible if Confirm fails", async () => {
    const deps = createDeps();
    await handlers.handleSetup(deps);
    deps.appService.confirmProjectFolderSetup.mockRejectedValue(
      new Error("Disk full"),
    );
    await handlers.handleConfirm(deps);
    expect(deps.state.isBusy).toBe(false);
    expect(deps.store.selectCandidate()).toEqual(candidate);
    expect(deps.store.selectViewData().errorMessage).toBe(
      i18n.projectFolderSetupPage.confirmError,
    );
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("only continues after the native confirmation is saved", () => {
    const deps = createDeps();
    handlers.handleContinue(deps);
    expect(deps.appService.navigate).not.toHaveBeenCalled();
    deps.appService.getProjectFolderSetup.mockReturnValue({
      configured: true,
      folder,
    });
    handlers.handleContinue(deps);
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/projects",
      undefined,
      { historyMode: "replace" },
    );
  });

  it("shows reconnect feedback without forgetting the saved folder", () => {
    const deps = createDeps();
    deps.appService.getProjectFolderSetup.mockReturnValue({
      configured: false,
      reason: "reconnect",
    });
    handlers.handleBeforeMount(deps);
    expect(deps.store.selectViewData().errorMessage).toBe(
      i18n.projectFolderSetupPage.reconnectError,
    );
  });

  it("returns to the previous Config page with its project context", () => {
    const deps = createDeps();
    const router = new IOSRouter({ resetStack: true });
    router.redirect("/project/config", { p: "project-1" });
    router.redirect("/project-folder-setup", { from: "config" });
    deps.appService.getProjectFolderSetup.mockReturnValue({
      configured: true,
      folder,
    });
    deps.appService.getPayload.mockImplementation(router.getPayload);
    deps.appService.canGoBack.mockImplementation(router.canGoBack);
    deps.appService.back.mockImplementation(router.back);
    handlers.handleContinue(deps);
    expect(deps.appService.back).toHaveBeenCalledOnce();
    expect(deps.appService.navigate).not.toHaveBeenCalled();
    expect(router.getPathName()).toBe("/project/config");
    expect(router.getPayload()).toEqual({ p: "project-1" });
  });

  it("uses Projects when a Config setup link has no previous page", () => {
    const deps = createDeps();
    deps.appService.getProjectFolderSetup.mockReturnValue({
      configured: true,
      folder,
    });
    deps.appService.getPayload.mockReturnValue({ from: "config" });
    handlers.handleContinue(deps);
    expect(deps.appService.back).not.toHaveBeenCalled();
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/projects",
      undefined,
      { historyMode: "replace" },
    );
  });

  it("hides workspace navigation and help on the onboarding route", () => {
    const state = {
      ...createAppState(),
      currentRoute: "/project-folder-setup",
      platform: "ios",
      isTouchMode: true,
    };
    const view = selectAppViewData({ state, i18n });
    expect(view.currentRoutePattern).toBe("/project-folder-setup");
    expect(view.showSidebar).toBe(false);
    expect(view.mountMobileTabBar).toBe(false);
    expect(view.showHelpButton).toBe(false);
  });

  it("clears the old project route history when setup is required", () => {
    const router = new IOSRouter();
    router.redirect("/project", { p: "project-1" });
    router.reset("/project-folder-setup");
    expect(router.canGoBack()).toBe(false);
    expect(router.getPathName()).toBe("/project-folder-setup");
    expect(router.getPayload()).toEqual({});
  });
});
