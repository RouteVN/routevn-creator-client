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
  linuxUpdateInstallMode = "appimage",
} = {}) => {
  checkMock.mockResolvedValue(update);

  const updater = createUpdater({
    globalUI,
    keyValueStore: {
      get: vi.fn(),
      set: vi.fn(),
    },
    linuxUpdateInstallMode,
  });

  return {
    updater,
    update,
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

  it("does not self-install package-managed Linux updates", async () => {
    vi.stubGlobal("navigator", {
      platform: "Linux x86_64",
      userAgent: "RouteVN Creator Linux",
    });

    const globalUI = createGlobalUI();
    const downloadAndInstall = vi.fn(() => Promise.resolve());
    const { updater } = createUpdaterClient({
      globalUI,
      linuxUpdateInstallMode: "package-manager",
      update: createUpdate({ downloadAndInstall }),
    });

    const result = await updater.checkForUpdates(false, {
      copy: {
        packageManagedLinuxUpdateMessage:
          "Update {version} is available. Use your package manager.",
        updateAvailableTitle: "Update Available",
      },
    });

    expect(result).toEqual({
      version: "1.7.3",
      date: "2026-07-03",
      body: "Fix packaging.",
    });
    expect(checkMock).toHaveBeenCalledWith(undefined);
    expect(globalUI.showAlert).toHaveBeenCalledWith({
      message: "Update 1.7.3 is available. Use your package manager.",
      title: "Update Available",
    });
    expect(globalUI.showConfirm).not.toHaveBeenCalled();
    expect(downloadAndInstall).not.toHaveBeenCalled();
    expect(relaunchMock).not.toHaveBeenCalled();
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
