import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

const checkMock = vi.hoisted(() => vi.fn());
const relaunchMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: checkMock,
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: relaunchMock,
}));

import createUpdater from "../../src/deps/clients/tauri/updater.js";

const createGlobalUI = () => ({
  showAlert: vi.fn(() => Promise.resolve()),
  showConfirm: vi.fn(() => Promise.resolve(true)),
});

const createUpdate = ({
  version = "1.7.3",
  date = "2026-07-03",
  body = "Fix packaging.",
  downloadAndInstall = vi.fn(() => Promise.resolve()),
} = {}) => ({
  version,
  date,
  body,
  downloadAndInstall,
});

const createUpdaterClient = ({
  globalUI = createGlobalUI(),
  update = createUpdate(),
} = {}) => {
  checkMock.mockResolvedValue(update);

  const updater = createUpdater({
    globalUI,
    keyValueStore: {
      get: vi.fn(),
      set: vi.fn(),
    },
  });

  return {
    updater,
    update,
  };
};

const setupDocument = () => {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body></body></html>",
  );
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  return dom.window.document;
};

describe("tauri updater", () => {
  beforeEach(() => {
    checkMock.mockReset();
    relaunchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads and installs Linux updates through the Tauri updater", async () => {
    vi.stubGlobal("navigator", {
      platform: "Linux x86_64",
      userAgent: "RouteVN Creator Linux",
    });

    const globalUI = createGlobalUI();
    const downloadAndInstall = vi.fn(() => Promise.resolve());
    const { updater } = createUpdaterClient({
      globalUI,
      update: createUpdate({ downloadAndInstall }),
    });

    const result = await updater.checkForUpdates(false, {
      copy: {
        laterButton: "Later",
        updateAvailableMessage:
          "Update {version} is available.\n{releaseNotes}",
        updateAvailableTitle: "Update Available",
        updateNowButton: "Update Now",
      },
    });

    expect(result).toEqual({
      version: "1.7.3",
      date: "2026-07-03",
      body: "Fix packaging.",
    });
    expect(checkMock).toHaveBeenCalledWith(undefined);
    expect(globalUI.showConfirm).toHaveBeenCalledWith({
      message: "Update 1.7.3 is available.\nFix packaging.",
      title: "Update Available",
      confirmText: "Update Now",
      cancelText: "Later",
    });
    expect(downloadAndInstall).toHaveBeenCalledWith(expect.any(Function));
    expect(relaunchMock).toHaveBeenCalled();
  });

  it("shows a blocking Rettangoli dialog while downloading an update", async () => {
    const document = setupDocument();
    const globalUI = createGlobalUI();
    let finishDownload;
    const downloadFinished = new Promise((resolve) => {
      finishDownload = resolve;
    });
    const downloadAndInstall = vi.fn(async (onProgress) => {
      onProgress({
        event: "Started",
        data: { contentLength: 100 },
      });
      onProgress({
        event: "Progress",
        data: { chunkLength: 45 },
      });
      await downloadFinished;
      onProgress({
        event: "Finished",
        data: {},
      });
    });
    const { updater } = createUpdaterClient({ globalUI });

    const updatePromise = updater.downloadAndInstall(
      createUpdate({ downloadAndInstall }),
      {
        updateDownloadMessage: "Keep the app open.",
        updateDownloadProgressMessage: "{progress}% complete",
        updateDownloadTitle: "Downloading update",
        updateInstallingMessage: "Installing update...",
      },
    );

    await Promise.resolve();

    const dialog = document.getElementById("routevn-update-progress-dialog");
    expect(dialog?.tagName.toLowerCase()).toBe("rtgl-dialog");
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.textContent).toContain("Downloading update");
    expect(dialog?.textContent).toContain("Keep the app open.");
    expect(dialog?.textContent).toContain("45% complete");
    expect(dialog?.querySelector('[role="progressbar"]')).toBeNull();

    finishDownload();
    await updatePromise;

    expect(
      document.getElementById("routevn-update-progress-dialog"),
    ).toBeNull();
    expect(downloadAndInstall).toHaveBeenCalledWith(expect.any(Function));
    expect(relaunchMock).toHaveBeenCalled();
    expect(globalUI.showAlert).not.toHaveBeenCalled();
  });

  it("removes the progress dialog before showing update install failures", async () => {
    const document = setupDocument();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const globalUI = createGlobalUI();
    const downloadAndInstall = vi.fn(async (onProgress) => {
      onProgress({
        event: "Started",
        data: { contentLength: 100 },
      });
      throw new Error("network failed");
    });
    const { updater } = createUpdaterClient({ globalUI });

    try {
      await updater.downloadAndInstall(createUpdate({ downloadAndInstall }), {
        failedInstallUpdateMessage: "Install failed: {message}",
        errorTitle: "Error",
      });

      expect(
        document.getElementById("routevn-update-progress-dialog"),
      ).toBeNull();
      expect(globalUI.showAlert).toHaveBeenCalledWith({
        message: "Install failed: network failed",
        title: "Error",
      });
      expect(relaunchMock).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not prompt on Linux when no update is available", async () => {
    vi.stubGlobal("navigator", {
      platform: "Linux x86_64",
      userAgent: "RouteVN Creator Linux",
    });

    const globalUI = createGlobalUI();
    const { updater } = createUpdaterClient({
      globalUI,
      update: null,
    });

    const result = await updater.checkForUpdates(false);

    expect(result).toBeNull();
    expect(checkMock).toHaveBeenCalledWith(undefined);
    expect(globalUI.showConfirm).not.toHaveBeenCalled();
    expect(globalUI.showAlert).toHaveBeenCalledWith({
      message: "You are already on the latest version",
      title: "Up to Date",
    });
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it("keeps using the universal updater target on macOS", async () => {
    vi.stubGlobal("navigator", {
      platform: "MacIntel",
      userAgent: "RouteVN Creator macOS",
    });

    const { updater } = createUpdaterClient();

    await updater.checkForUpdates(true);

    expect(checkMock).toHaveBeenCalledWith({
      target: "macos-universal",
    });
  });
});
