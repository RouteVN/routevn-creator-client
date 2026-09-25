import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

const checkMock = vi.hoisted(() => vi.fn());
const invokeMock = vi.hoisted(() => vi.fn());
const deviceInfoMock = vi.hoisted(() => vi.fn());
const relaunchMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

vi.mock("@tauri-apps/plugin-updater", () => ({
  Update: class {
    constructor(metadata) {
      Object.assign(this, metadata);
    }
  },
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
  close = vi.fn(() => Promise.resolve()),
} = {}) => ({
  version,
  date,
  body,
  downloadAndInstall,
  close,
});

const expectedDevice = {
  deviceId: "123456789ABC",
  deviceModel: "Example Model",
  osVersion: "Linux 6.8",
};

const createKeyValueStore = (entries = [["deviceId", "123456789ABC"]]) => {
  const values = new Map(entries);
  return {
    get: vi.fn(async (key) => values.get(key)),
    getOrSet: vi.fn(async (key, value) => {
      if (!values.has(key)) values.set(key, value);
      return values.get(key);
    }),
  };
};

const createUpdaterClient = ({
  globalUI = createGlobalUI(),
  update = createUpdate(),
  keyValueStore = createKeyValueStore(),
} = {}) => {
  checkMock.mockResolvedValue(update);

  const updater = createUpdater({
    globalUI,
    keyValueStore,
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
    invokeMock.mockReset();
    deviceInfoMock.mockReset();
    deviceInfoMock.mockResolvedValue({
      deviceModel: "Example Model",
      osVersion: "Linux 6.8",
    });
    invokeMock.mockImplementation((command) => {
      if (command === "get_update_device_info") return deviceInfoMock();
      if (command === "check_client_update") return checkMock();
      throw new Error(`Unexpected command: ${command}`);
    });
    relaunchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows a delayed accessible check dialog and closes it before the result", async () => {
    vi.useFakeTimers();
    const document = setupDocument();
    const globalUI = createGlobalUI();
    globalUI.showAlert.mockImplementation(async () => {
      expect(document.getElementById("routevn-update-check-dialog")).toBeNull();
    });
    const { updater } = createUpdaterClient({ globalUI, update: null });
    let finishCheck;
    checkMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCheck = resolve;
        }),
    );

    const checking = updater.checkForUpdates(false, {
      copy: { checkingForUpdates: "Checking for updates..." },
    });
    await vi.advanceTimersByTimeAsync(199);
    expect(document.getElementById("routevn-update-check-dialog")).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    const dialog = document.getElementById("routevn-update-check-dialog");
    expect(dialog?.textContent).toContain("Checking for updates...");
    expect(
      dialog?.querySelector('[role="status"]')?.getAttribute("aria-atomic"),
    ).toBe("true");
    expect(dialog?.querySelector('[role="progressbar"]')).not.toBeNull();

    finishCheck(null);
    await checking;
    expect(document.getElementById("routevn-update-check-dialog")).toBeNull();
    expect(globalUI.showAlert).toHaveBeenCalledOnce();
  });

  it("skips the check dialog for fast and automatic checks", async () => {
    vi.useFakeTimers();
    const document = setupDocument();
    const { updater } = createUpdaterClient({ update: null });

    await updater.checkForUpdates(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(document.getElementById("routevn-update-check-dialog")).toBeNull();

    let finishCheck;
    checkMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCheck = resolve;
        }),
    );
    const checking = updater.checkForUpdates(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(document.getElementById("routevn-update-check-dialog")).toBeNull();
    finishCheck(null);
    await checking;
  });

  it("reuses an automatic check when manually requested and closes the dialog on error", async () => {
    vi.useFakeTimers();
    const document = setupDocument();
    const globalUI = createGlobalUI();
    globalUI.showAlert.mockImplementation(async () => {
      expect(document.getElementById("routevn-update-check-dialog")).toBeNull();
    });
    const { updater } = createUpdaterClient({ globalUI, update: null });
    let failCheck;
    checkMock.mockImplementation(
      () =>
        new Promise((_, reject) => {
          failCheck = reject;
        }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const automatic = updater.checkForUpdates(true);
      const manual = updater.checkForUpdates(false);
      const repeated = updater.checkForUpdates(false);
      expect(manual).toBe(automatic);
      expect(repeated).toBe(automatic);
      await vi.advanceTimersByTimeAsync(200);
      expect(
        document.getElementById("routevn-update-check-dialog"),
      ).not.toBeNull();
      expect(checkMock).toHaveBeenCalledOnce();

      failCheck(new Error("Update service unavailable"));
      await automatic;
      expect(document.getElementById("routevn-update-check-dialog")).toBeNull();
      expect(globalUI.showAlert).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

  it("downloads and installs Linux updates through the Tauri updater", async () => {
    vi.stubGlobal("navigator", {
      platform: "Linux x86_64",
      userAgent: "RouteVN Creator Linux",
    });

    const globalUI = createGlobalUI();
    const downloadAndInstall = vi.fn(() => Promise.resolve());
    const close = vi.fn(() => Promise.resolve());
    const { updater } = createUpdaterClient({
      globalUI,
      update: createUpdate({ downloadAndInstall, close }),
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
    expect(invokeMock).toHaveBeenCalledWith(
      "check_client_update",
      expectedDevice,
    );
    expect(globalUI.showConfirm).toHaveBeenCalledWith({
      message: "Update 1.7.3 is available.\nFix packaging.",
      title: "Update Available",
      confirmText: "Update Now",
      cancelText: "Later",
    });
    expect(downloadAndInstall).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 600_000,
      headers: {},
    });
    expect(relaunchMock).toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("releases the checked update when installation is postponed", async () => {
    const globalUI = createGlobalUI();
    globalUI.showConfirm.mockResolvedValue(false);
    const close = vi.fn(() => Promise.resolve());
    const { updater } = createUpdaterClient({
      globalUI,
      update: createUpdate({ close }),
    });

    await updater.checkForUpdates(false);

    expect(close).toHaveBeenCalledOnce();
    expect(relaunchMock).not.toHaveBeenCalled();
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
    const progressTrack = dialog?.querySelector('[role="progressbar"]');
    const progressFill = progressTrack?.querySelector("[data-progress-fill]");
    expect(progressTrack?.tagName.toLowerCase()).toBe("rtgl-view");
    expect(progressTrack?.getAttribute("aria-valuenow")).toBe("45");
    expect(progressFill?.getAttribute("style")).toContain("width: 45%");

    finishDownload();
    await updatePromise;

    expect(
      document.getElementById("routevn-update-progress-dialog"),
    ).toBeNull();
    expect(downloadAndInstall).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 600_000,
      headers: {},
    });
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

    expect(result).toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith(
      "check_client_update",
      expectedDevice,
    );
    expect(globalUI.showConfirm).not.toHaveBeenCalled();
    expect(globalUI.showAlert).toHaveBeenCalledWith({
      message: "You are already on the latest version",
      title: "Up to Date",
    });
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it("clears stale release metadata when the server returns no update", async () => {
    const globalUI = createGlobalUI();
    globalUI.showConfirm.mockResolvedValue(false);
    const { updater } = createUpdaterClient({ globalUI });
    await updater.checkForUpdates(true);
    expect(updater.isUpdateAvailable()).toBe(true);
    checkMock.mockResolvedValueOnce(null);
    await updater.checkForUpdates(true);
    expect(updater.isUpdateAvailable()).toBe(false);
    expect(updater.getUpdateInfo()).toBeUndefined();
    expect(globalUI.showAlert).not.toHaveBeenCalled();
  });

  it("does not report a failed server check as up to date", async () => {
    const globalUI = createGlobalUI();
    const { updater } = createUpdaterClient({ globalUI });
    checkMock.mockRejectedValueOnce(new Error("503 private diagnostic"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await updater.checkForUpdates(false);
      expect(globalUI.showAlert).toHaveBeenCalledWith({
        title: "Error",
        message: "Could not retrieve update information.",
      });
      expect(updater.isUpdateAvailable()).toBe(false);
      expect(globalUI.showConfirm).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("persists an installation ID across updater clients and sends native metadata", async () => {
    const keyValueStore = createKeyValueStore([]);
    const globalUI = createGlobalUI();
    globalUI.showConfirm.mockResolvedValue(false);
    deviceInfoMock.mockResolvedValue({
      deviceModel: "メーカー Model / Pro",
      osVersion: "Windows 24H2 (build 26100)",
    });
    const first = createUpdaterClient({ keyValueStore, globalUI });
    await first.updater.checkForUpdates(true);
    const second = createUpdaterClient({ keyValueStore, globalUI });
    await second.updater.checkForUpdates(true);
    const checks = invokeMock.mock.calls.filter(
      ([command]) => command === "check_client_update",
    );
    const firstDevice = checks[0][1];
    expect(firstDevice.deviceId).toMatch(/^[1-9A-HJ-NP-Za-km-z]{12}$/);
    expect(firstDevice.deviceModel).toBe("メーカー Model / Pro");
    expect(firstDevice.osVersion).toBe("Windows 24H2 (build 26100)");
    expect(checks[1][1]).toEqual(firstDevice);
    expect(keyValueStore.getOrSet).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("get_update_device_info");
  });

  it("uses unknown for unavailable native metadata without blocking update checks", async () => {
    const { updater } = createUpdaterClient({ update: null });
    deviceInfoMock.mockResolvedValueOnce({
      deviceModel: "Model",
      osVersion: "bad\nheader",
    });
    await updater.checkForUpdates(true);
    const checks = () =>
      invokeMock.mock.calls.filter(
        ([command]) => command === "check_client_update",
      );
    expect(checks()[0][1]).toEqual({
      deviceId: "123456789ABC",
      deviceModel: "Model",
      osVersion: "unknown",
    });
    deviceInfoMock.mockRejectedValueOnce(
      new Error("Native metadata unavailable"),
    );
    await updater.checkForUpdates(true);
    expect(checks()[1][1]).toEqual({
      deviceId: "123456789ABC",
      deviceModel: "unknown",
      osVersion: "unknown",
    });
  });

  it("passes device data to the native check without extra selectors", async () => {
    const { updater } = createUpdaterClient();

    await updater.checkForUpdates(true);

    expect(invokeMock).toHaveBeenCalledWith(
      "check_client_update",
      expectedDevice,
    );
  });
});
