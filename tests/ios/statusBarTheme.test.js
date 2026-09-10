import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Subject from "../../src/deps/subject.js";
import { createAppServiceCore } from "../../src/deps/services/shared/appServiceCore.js";
import { createAppService } from "../../src/deps/services/ios/appService.js";
import { handleThemeCardClick } from "../../src/pages/config/config.handlers.js";
import * as configStore from "../../src/pages/config/config.store.js";

const { callIOSBridge } = vi.hoisted(() => ({ callIOSBridge: vi.fn() }));
vi.mock("../../src/deps/clients/ios/bridge.js", () => ({ callIOSBridge }));

const createParams = (theme = "dark") => {
  const values = new Map([["userConfig", { appearance: { theme } }]]);
  return {
    db: {
      get: async (key) => structuredClone(values.get(key)),
      set: async (key, value) => values.set(key, structuredClone(value)),
    },
    router: { getPayload: () => ({}) },
    subject: new Subject(),
    globalUI: { showToast: vi.fn() },
    platform: "ios",
  };
};

let dom;
beforeEach(() => {
  dom = new JSDOM("<!doctype html><body class='dark'></body>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  callIOSBridge.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

describe("iOS status bar follows the app theme", () => {
  it("updates from Config and restores the foreground with the saved theme", async () => {
    const params = createParams();
    const appService = createAppService(params);
    await appService.initUserConfig();
    expect(callIOSBridge).toHaveBeenLastCalledWith("setStatusBarStyle", {
      style: "light",
    });

    const state = configStore.createInitialState();
    const store = {
      selectCurrentTheme: () => configStore.selectCurrentTheme({ state }),
      setCurrentTheme: (payload) =>
        configStore.setCurrentTheme({ state }, payload),
    };
    const render = vi.fn();
    for (const [theme, style] of [
      ["light", "dark"],
      ["dark", "light"],
      ["black", "light"],
      ["catppuccin-mocha", "light"],
    ]) {
      handleThemeCardClick(
        { appService, store, render },
        { _event: { currentTarget: { dataset: { theme } } } },
      );
      expect(store.selectCurrentTheme()).toBe(theme);
      expect(appService.getTheme()).toBe(theme);
      expect(document.body.dataset.rvnTheme).toBe(theme);
      expect(document.documentElement.dataset.rvnTheme).toBe(theme);
      expect(document.body.classList.contains("dark")).toBe(style === "light");
      expect(callIOSBridge).toHaveBeenLastCalledWith("setStatusBarStyle", {
        style,
      });

      await appService.flushUserConfig();
      expect((await params.db.get("userConfig")).appearance.theme).toBe(theme);
      callIOSBridge.mockClear();
      const reloaded = createAppService(params);
      await reloaded.initUserConfig();
      expect(reloaded.getTheme()).toBe(theme);
      expect(callIOSBridge).toHaveBeenCalledExactlyOnceWith(
        "setStatusBarStyle",
        {
          style,
        },
      );
    }
    expect(render).toHaveBeenCalledTimes(4);
    expect(params.globalUI.showToast).not.toHaveBeenCalled();
  });

  it.each([
    ["light-warm", "light", "dark"],
    ["soft-dark", "dark", "light"],
    ["unknown", "dark", "light"],
  ])(
    "normalizes saved %s before updating native appearance",
    async (saved, theme, style) => {
      const appService = createAppService(createParams(saved));
      await appService.initUserConfig();
      expect(appService.getTheme()).toBe(theme);
      expect(document.body.dataset.rvnTheme).toBe(theme);
      expect(callIOSBridge).toHaveBeenLastCalledWith("setStatusBarStyle", {
        style,
      });
    },
  );

  it("reports a native update failure without losing the selected theme", async () => {
    const params = createParams();
    const appService = createAppService(params);
    await appService.initUserConfig();
    callIOSBridge.mockRejectedValueOnce(new Error("Native bridge failed"));
    expect(appService.setTheme("light")).toBe("light");
    await appService.flushUserConfig();
    expect(params.globalUI.showToast).toHaveBeenCalledWith({
      title: "Error",
      message: "Could not update the status bar. Please restart the app.",
      status: "error",
    });
    expect(document.body.dataset.rvnTheme).toBe("light");
    expect((await params.db.get("userConfig")).appearance.theme).toBe("light");
  });

  it.each(["web", "android", "tauri"])(
    "preserves document theme changes without a native adapter on %s",
    async (platform) => {
      const params = createParams();
      params.platform = platform;
      const appService = createAppServiceCore(params);
      await appService.initUserConfig();
      expect(appService.setTheme("light")).toBe("light");
      await appService.flushUserConfig();
      expect(document.body.dataset.rvnTheme).toBe("light");
      expect(callIOSBridge).not.toHaveBeenCalled();
    },
  );
});
