import { afterEach, describe, expect, it, vi } from "vitest";
import Subject from "../../src/deps/subject.js";
import { createAppServiceCore } from "../../src/deps/services/shared/appServiceCore.js";

const DEVICE_ID = "123456789ABC123456789ABC";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const packResponse = () =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: {
        assetPack: {
          id: "AsPkPackOne00001",
          data: {
            title: "Pack One",
            pricing: { type: "FREE" },
            assetCounts: { IMAGES: 1 },
            package: {
              fileId: "FiPackPackage001",
              size: 100,
              directoryOffset: 60,
              directorySize: 40,
            },
          },
        },
        creator: { id: "Cr8rCreatorOne01", name: "Creator One" },
        files: [
          {
            fileId: "FiPackPackage001",
            url: "https://files.example/FiPackPackage001",
          },
        ],
      },
    }),
  );

// The app as each platform starts it, with the app database already holding
// the device ID it made for update checks.
const startApp = ({ platform, distribution, userAgent }) => {
  const fetchImpl = vi.fn(async () => packResponse());
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubGlobal("navigator", {
    languages: ["ja-JP"],
    language: "ja-JP",
    userAgent,
    maxTouchPoints: platform === "web" ? 5 : 0,
  });
  const values = new Map([["deviceId", DEVICE_ID]]);
  const appService = createAppServiceCore({
    db: {
      get: async (key) => values.get(key) ?? null,
      set: async (key, value) => values.set(key, value),
      getOrSet: async (key, value) => {
        if (!values.has(key)) values.set(key, value);
        return values.get(key);
      },
    },
    subject: new Subject(),
    projectService: { getEnsuredProjectId: () => undefined },
    router: { getPathName: () => "/projects", getPayload: () => ({}) },
    globalUI: { showToast: vi.fn() },
    appVersion: "1.22.1",
    platform,
    distribution,
  });
  appService.setAppLocaleUsageProvider(() => ({
    uiLanguage: "en",
    uiLanguageSource: "selected",
  }));
  const sent = () =>
    fetchImpl.mock.calls.map(([, request]) => JSON.parse(request.body).params);
  return { appService, sent };
};

afterEach(() => vi.unstubAllGlobals());

describe("asset store views and downloads", () => {
  it("names the desktop app, its channel and its version on a pack's view", async () => {
    const { appService, sent } = startApp({
      platform: "tauri",
      distribution: "steam",
      userAgent: WINDOWS,
    });

    await appService.getAssetStorePack({
      assetPackId: "AsPkPackOne00001",
      view: true,
    });

    expect(sent()).toEqual([
      {
        assetPackId: "AsPkPackOne00001",
        view: true,
        device: {
          id: DEVICE_ID,
          language: "ja",
          uiLanguage: "en",
          os: "windows",
          formFactor: "desktop",
          client: "desktopApp",
          channel: "steam",
          app: "routevn-creator",
          appVersion: "1.22.1",
        },
      },
    ]);
  });

  it("names the web client, with no channel, on a pack's view", async () => {
    const { appService, sent } = startApp({
      platform: "web",
      userAgent: IPHONE,
    });

    await appService.getAssetStorePack({
      assetPackId: "AsPkPackOne00001",
      view: true,
    });

    expect(sent()[0].device).toEqual({
      id: DEVICE_ID,
      language: "ja",
      uiLanguage: "en",
      os: "ios",
      formFactor: "phone",
      client: "web",
      app: "routevn-creator",
      appVersion: "1.22.1",
    });
  });

  it("sends one download, with the device, when an import starts", async () => {
    const { appService, sent } = startApp({
      platform: "tauri",
      distribution: "direct",
      userAgent: WINDOWS,
    });

    await appService.sendAssetStorePackDownload({
      assetPackId: "AsPkPackOne00001",
    });

    expect(sent()).toEqual([
      {
        assetPackId: "AsPkPackOne00001",
        download: true,
        device: {
          id: DEVICE_ID,
          language: "ja",
          uiLanguage: "en",
          os: "windows",
          formFactor: "desktop",
          client: "desktopApp",
          channel: "direct",
          app: "routevn-creator",
          appVersion: "1.22.1",
        },
      },
    ]);
  });

  it("never fails when the download can't be sent", async () => {
    const { appService } = startApp({
      platform: "web",
      userAgent: IPHONE,
    });
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

    await expect(
      appService.sendAssetStorePackDownload({
        assetPackId: "AsPkPackOne00001",
      }),
    ).resolves.toBeUndefined();
  });
});
