import { afterEach, describe, expect, it, vi } from "vitest";
import Subject from "../../src/deps/subject.js";
import { createAppServiceCore } from "../../src/deps/services/shared/appServiceCore.js";

const DEVICE_ID = "123456789ABC123456789ABC";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const respond = (result) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));

const packResult = {
  assetPack: {
    id: "AsPkPackOne00001",
    data: {
      title: "Pack One",
      pricing: { type: "FREE" },
      assetCounts: { IMAGES: 1 },
    },
  },
  creator: { id: "Cr8rCreatorOne01", name: "Creator One" },
  files: [],
  manifest: { schema: "routevn.import-pack.v3" },
  mediaFiles: [],
};

const downloadResult = {
  versionName: "1.0.0",
  downloadUrl: "https://uploads.example/FiPackPackage001?X-Amz-Signature=abc",
  expiresAt: 1786579800000,
  size: 100,
  directoryOffset: 60,
  directorySize: 40,
};

const answer = async (_url, request) =>
  respond(
    JSON.parse(request.body).method === "assetStore.getAssetPackDownloadUrl"
      ? downloadResult
      : packResult,
  );

// The app as each platform starts it, with the app database already holding
// the device ID it made for update checks.
const startApp = ({ platform, distribution, userAgent }) => {
  const fetchImpl = vi.fn(answer);
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

    await appService.getAssetStorePack({ assetPackId: "AsPkPackOne00001" });

    expect(sent()).toEqual([
      {
        assetPackId: "AsPkPackOne00001",
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

    await appService.getAssetStorePack({ assetPackId: "AsPkPackOne00001" });

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

  it("sends the device when an import starts, which counts one download", async () => {
    const { appService, sent } = startApp({
      platform: "tauri",
      distribution: "direct",
      userAgent: WINDOWS,
    });

    const download = await appService.getAssetStorePackDownload({
      assetPackId: "AsPkPackOne00001",
      countDownload: true,
    });

    expect(download).toMatchObject({ url: downloadResult.downloadUrl });
    expect(sent()).toEqual([
      {
        assetPackId: "AsPkPackOne00001",
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

  it("sends no device when an import only needs a fresh package URL", async () => {
    const { appService, sent } = startApp({
      platform: "web",
      userAgent: IPHONE,
    });

    await appService.getAssetStorePackDownload({
      assetPackId: "AsPkPackOne00001",
    });

    expect(sent()).toEqual([{ assetPackId: "AsPkPackOne00001" }]);
  });
});
