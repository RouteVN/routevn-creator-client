import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ROUTEVN_CONTACT_URL } from "../../src/internal/routevnUrls.js";
import {
  handleClickContactButton,
  handleCheckForUpdates,
  handleBeforeMount,
} from "../../src/pages/about/about.handlers.js";
import {
  createInitialState,
  selectViewData,
} from "../../src/pages/about/about.store.js";
import { EN_I18N } from "../support/i18n.js";

const defaultCapability = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../src-tauri/capabilities/default.json", import.meta.url),
    ),
    "utf8",
  ),
);

describe("about handlers", () => {
  it.each([true, false])(
    "exposes Android update support %s and runs a manual check",
    async (supported) => {
      const updaterService = {
        isSupported: () => supported,
        checkForUpdates: vi.fn(),
      };
      const store = {
        setUiConfig: vi.fn(),
        setUpdatesEnabled: vi.fn(),
        setAppVersion: vi.fn(),
        setPlatform: vi.fn(),
      };
      const deps = {
        appService: {
          getPlatform: () => "android",
          getAppVersion: () => "1.12.3",
        },
        store,
        render: vi.fn(),
        updaterService,
        i18n: { appPage: { latestVersionMessage: "Current" } },
      };
      handleBeforeMount(deps);
      expect(store.setUpdatesEnabled).toHaveBeenCalledWith({
        updatesEnabled: supported,
      });
      await handleCheckForUpdates(deps);
      if (supported)
        expect(updaterService.checkForUpdates).toHaveBeenCalledWith(false, {
          copy: deps.i18n.appPage,
        });
      else expect(updaterService.checkForUpdates).not.toHaveBeenCalled();
    },
  );

  it("opens the RouteVN contact page", () => {
    const appService = {
      openUrl: vi.fn(),
    };

    handleClickContactButton({ appService });

    expect(appService.openUrl).toHaveBeenCalledWith(ROUTEVN_CONTACT_URL);
  });

  it("allows RouteVN pages through the Tauri opener", () => {
    const openerPermission = defaultCapability.permissions.find(
      (permission) => permission.identifier === "opener:allow-open-url",
    );

    expect(openerPermission.allow).toContainEqual({
      url: "https://routevn.com/*",
    });
    expect(openerPermission.allow).toContainEqual({
      url: "http://localhost:3003/*",
    });
  });

  it("allows every social link through the Tauri opener", () => {
    const { allow } = defaultCapability.permissions.find(
      (permission) => permission.identifier === "opener:allow-open-url",
    );
    const isAllowed = (href) =>
      allow.some(({ url }) =>
        url.endsWith("*") ? href.startsWith(url.slice(0, -1)) : href === url,
      );
    const { social } = selectViewData({
      state: createInitialState(),
      i18n: EN_I18N,
    });

    expect(
      social.map(({ href }) => href).filter((href) => !isAllowed(href)),
    ).toEqual([]);
  });
});
