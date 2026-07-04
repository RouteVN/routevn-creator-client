import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkMock = vi.hoisted(() => vi.fn());
const relaunchMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: checkMock,
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: relaunchMock,
}));

import createUpdater from "../../src/deps/clients/tauri/updater.js";

const DOWNLOAD_PAGE_URL = "https://routevn.com/en/creator/download/";
const CUSTOM_DOWNLOAD_PAGE_URL = `${DOWNLOAD_PAGE_URL}?from=updater`;

const createGlobalUI = () => ({
  showAlert: vi.fn(() => Promise.resolve()),
  showConfirm: vi.fn(() => Promise.resolve(true)),
});

const createUpdaterClient = ({
  globalUI = createGlobalUI(),
  manifest = {
    version: "1.7.3",
    date: "2026-07-03",
    body: "Fix packaging.",
    manualDownloadUrl: CUSTOM_DOWNLOAD_PAGE_URL,
  },
  openUrl,
} = {}) => {
  const fetchManualUpdateManifest = vi.fn(() => Promise.resolve(manifest));

  const updater = createUpdater({
    globalUI,
    keyValueStore: {
      get: vi.fn(),
      set: vi.fn(),
    },
    appVersion: "1.7.2",
    openUrl: openUrl ?? vi.fn(() => Promise.resolve()),
    fetchManualUpdateManifest,
  });

  return {
    fetchManualUpdateManifest,
    updater,
  };
};

describe("tauri updater", () => {
  beforeEach(() => {
    checkMock.mockReset();
    relaunchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the manual download page on Linux", async () => {
    vi.stubGlobal("navigator", {
      platform: "Linux x86_64",
      userAgent: "RouteVN Creator Linux",
    });

    const globalUI = createGlobalUI();
    const openUrl = vi.fn(() => Promise.resolve());
    const { fetchManualUpdateManifest, updater } = createUpdaterClient({
      globalUI,
      openUrl,
    });

    const result = await updater.checkForUpdates(false, {
      copy: {
        laterButton: "Later",
        manualDownloadUpdateMessage:
          "Update {version} is available.\n{releaseNotes}",
        openDownloadPageButton: "Open Download Page",
        updateAvailableTitle: "Update Available",
      },
    });

    expect(result).toEqual({
      version: "1.7.3",
      date: "2026-07-03",
      body: "Fix packaging.",
    });
    expect(fetchManualUpdateManifest).toHaveBeenCalledWith("1.7.2");
    expect(checkMock).not.toHaveBeenCalled();
    expect(globalUI.showConfirm).toHaveBeenCalledWith({
      message: "Update 1.7.3 is available.\nFix packaging.",
      title: "Update Available",
      confirmText: "Open Download Page",
      cancelText: "Later",
    });
    expect(openUrl).toHaveBeenCalledWith(CUSTOM_DOWNLOAD_PAGE_URL);
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it("does not prompt on Linux when the manifest version is not newer", async () => {
    vi.stubGlobal("navigator", {
      platform: "Linux x86_64",
      userAgent: "RouteVN Creator Linux",
    });

    const globalUI = createGlobalUI();
    const openUrl = vi.fn(() => Promise.resolve());
    const { fetchManualUpdateManifest, updater } = createUpdaterClient({
      globalUI,
      manifest: {
        version: "1.7.2",
        date: "2026-07-03",
        body: "Fix packaging.",
        manualDownloadUrl: CUSTOM_DOWNLOAD_PAGE_URL,
      },
      openUrl,
    });

    const result = await updater.checkForUpdates(false);

    expect(result).toBeNull();
    expect(fetchManualUpdateManifest).toHaveBeenCalledWith("1.7.2");
    expect(globalUI.showConfirm).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
    expect(checkMock).not.toHaveBeenCalled();
  });
});
