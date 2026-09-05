import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { parseAndRender } from "jempl";
import Subject from "../../src/deps/subject.js";
import { createAppServiceCore } from "../../src/deps/services/shared/appServiceCore.js";
import { isHelpButtonVisible } from "../../src/internal/ui/helpPreferences.js";
import { handleBeforeMount as mountApp } from "../../src/pages/app/app.handlers.js";
import { handleHelpButtonChange } from "../../src/pages/config/config.handlers.js";
import * as appStore from "../../src/pages/app/app.store.js";
import * as configStore from "../../src/pages/config/config.store.js";
import { EN_I18N, JA_I18N, ZH_HANS_I18N } from "../support/i18n.js";

const bindStore = (module, i18n = EN_I18N) => {
  const state = module.createInitialState();
  return Object.fromEntries(
    Object.entries(module).map(([name, fn]) => [
      name,
      (payload) => fn({ state, i18n }, payload),
    ]),
  );
};

const appView = yaml.load(
  readFileSync(
    new URL("../../src/pages/app/app.view.yaml", import.meta.url),
    "utf8",
  ),
);
const rendersHelpButton = (store) =>
  JSON.stringify(
    parseAndRender(appView.template, store.selectViewData()),
  ).includes("#helpFloatingButton");

afterEach(() => vi.unstubAllGlobals());

describe("global help button preference", () => {
  it.each(["web", "android"])(
    "defaults to shown, updates the mounted %s shell, and persists across reloads",
    async (platform) => {
      const dom = new JSDOM("<!doctype html><body></body>");
      vi.stubGlobal("window", dom.window);
      vi.stubGlobal("document", dom.window.document);
      const values = new Map([["userConfig", { app: { locale: "ja" } }]]);
      const db = {
        get: async (key) => structuredClone(values.get(key)),
        set: async (key, value) => values.set(key, structuredClone(value)),
      };
      const subject = new Subject();
      const projectService = { getEnsuredProjectId: () => undefined };
      const params = {
        db,
        subject,
        projectService,
        router: { getPathName: () => "/projects", getPayload: () => ({}) },
        globalUI: { showToast: vi.fn() },
        platform,
      };
      const appService = createAppServiceCore(params);
      await appService.initUserConfig();
      const store = bindStore(appStore);
      const render = vi.fn();
      const cleanup = mountApp({
        appService,
        subject,
        projectService,
        store,
        render,
        i18n: EN_I18N,
        uiConfig: { id: platform === "android" ? "touch" : "normal" },
      });
      try {
        await vi.waitFor(() => expect(render).toHaveBeenCalled());
        expect(rendersHelpButton(store)).toBe(true);
        const bottom = store.selectViewData().helpButtonBottom;
        const config = bindStore(configStore);

        for (const visible of [false, true, false]) {
          handleHelpButtonChange(
            { appService, store: config, render: vi.fn() },
            { _event: { detail: { value: visible } } },
          );
          expect(rendersHelpButton(store)).toBe(visible);
          expect(config.selectViewData().showHelpButton).toBe(visible);
          expect(store.selectViewData().helpButtonBottom).toBe(bottom);
          store.setCurrentRoute({
            route: "/project/images",
            payload: { p: "project-1" },
          });
          expect(rendersHelpButton(store)).toBe(visible);

          await appService.flushUserConfig();
          expect(values.get("userConfig").app).toEqual({
            locale: "ja",
            showHelpButton: visible,
          });
          const reloaded = createAppServiceCore(params);
          await reloaded.initUserConfig();
          expect(isHelpButtonVisible(reloaded)).toBe(visible);
        }

        render.mockClear();
        appService.setUserConfig("release.assetPackageEnabled", true);
        expect(render).not.toHaveBeenCalled();
        cleanup();
        appService.setUserConfig("app.showHelpButton", true);
        expect(render).not.toHaveBeenCalled();
        expect(rendersHelpButton(store)).toBe(false);
        await appService.flushUserConfig();
      } finally {
        cleanup();
        dom.window.close();
      }
    },
  );

  it.each([
    [EN_I18N, "Help Button", "Hide", "Show"],
    [JA_I18N, "ヘルプボタン", "非表示", "表示"],
    [ZH_HANS_I18N, "帮助按钮", "隐藏", "显示"],
  ])("localizes the visibility choice", (i18n, title, hide, show) => {
    const store = bindStore(configStore, i18n);
    expect(store.selectViewData()).toMatchObject({
      showHelpButton: true,
      helpButtonTitle: title,
      helpButtonOptions: [
        { value: false, label: hide },
        { value: true, label: show },
      ],
    });
  });
});
