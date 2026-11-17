import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIOSProjectFolderSetup } from "../../src/deps/clients/ios/projectFolderSetup.js";
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

afterEach(() => vi.unstubAllGlobals());

describe("iOS project folder setup client", () => {
  it("selects a directory without exporting a folder over existing contents", async () => {
    const calls = installBridge(() => ({ ok: true, value: candidate }));
    const filePicker = {
      openFolderPicker: vi.fn(async () => candidate),
    };
    const client = createIOSProjectFolderSetup({ filePicker });
    expect(await client.pick({ title: "Choose folder" })).toEqual(candidate);
    expect(filePicker.openFolderPicker).toHaveBeenCalledWith({
      title: "Choose folder",
      writable: true,
    });
    expect(calls.map(({ method, payload }) => ({ method, payload }))).toEqual([
      {
        method: "previewProjectFolderSetup",
        payload: { uri: candidate.uri },
      },
    ]);
    expect(client.getStatus().configured).toBe(false);
  });

  it("treats picker cancellation as no selection", async () => {
    const calls = installBridge(() => {
      throw new Error("Unexpected native call");
    });
    const client = createIOSProjectFolderSetup({
      filePicker: {
        openFolderPicker: async () => undefined,
      },
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

describe("folder setup route", () => {
  it("hides workspace navigation and help on the Android backup setup route", () => {
    const state = {
      ...createAppState(),
      currentRoute: "/project-folder-setup",
      platform: "android",
      isTouchMode: true,
    };
    const view = selectAppViewData({ state, i18n });
    expect(view.currentRoutePattern).toBe("/project-folder-setup");
    expect(view.showSidebar).toBe(false);
    expect(view.mountMobileTabBar).toBe(false);
    expect(view.showHelpButton).toBe(false);
  });

  it("clears the old project route history when no projects folder can be read", () => {
    const router = new IOSRouter();
    router.redirect("/project", { p: "project-1" });
    router.reset("/projects");
    expect(router.canGoBack()).toBe(false);
    expect(router.getPathName()).toBe("/projects");
    expect(router.getPayload()).toEqual({});
  });
});
