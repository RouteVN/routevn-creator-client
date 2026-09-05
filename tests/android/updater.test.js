import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { createAndroidUpdater } from "../../src/deps/clients/android/updater.js";
import { createGlobalUIClient } from "../../src/deps/clients/globalUI.js";
import { resolveUpdatesEnabled } from "../../src/internal/updates.js";
import { EN_I18N } from "../support/i18n.js";

const setup = async ({
  status = "up-to-date",
  support = "supported",
  confirmed = false,
} = {}) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("document", dom.window.document);
  const globalUI = {
    showConfirm: vi.fn(async () => confirmed),
    showAlert: vi.fn(async () => {}),
  };
  const bridge = vi.fn(async (method) => {
    if (method === "getAppUpdateSupport") return { status: support };
    if (method === "checkAppUpdate") return { status, versionCode: 5 };
    if (method === "startAppUpdate")
      return { status: "downloading", versionCode: 5 };
    if (method === "completeAppUpdate")
      return { status: "installing", versionCode: 5 };
    throw new Error(`Unexpected method: ${method}`);
  });
  let listener;
  const beforeInstall = vi.fn(async () => {});
  const isForeground = vi.fn(() => true);
  const deps = {
    globalUI: createGlobalUIClient({ globalUI }),
    bridge,
    beforeInstall,
    isForeground,
    getCopy: () => EN_I18N.appPage,
    keyValueStore: { get: vi.fn(), set: vi.fn() },
    browserEventsClient: {
      subscribeWindowEvent: vi.fn((subscription) => {
        listener = subscription.listener;
      }),
    },
  };
  const updater = await createAndroidUpdater(deps);
  return {
    updater,
    deps,
    bridge,
    globalUI,
    beforeInstall,
    isForeground,
    emit: (detail) => listener({ detail }),
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Android Google Play updater", () => {
  it("disables updates for unsupported installations without calling Play", async () => {
    const { updater, bridge, deps } = await setup({ support: "unsupported" });
    expect(updater).toBeUndefined();
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(
      deps.browserEventsClient.subscribeWindowEvent,
    ).not.toHaveBeenCalled();
    expect(
      resolveUpdatesEnabled({
        appService: { getPlatform: () => "android" },
        updaterService: updater,
      }),
    ).toBe(false);
  });

  it("keeps old shells working when the update bridge is unavailable", async () => {
    expect(
      await createAndroidUpdater({
        bridge: vi
          .fn()
          .mockRejectedValue(new Error("Unsupported bridge method")),
      }),
    ).toBeUndefined();
  });

  it("shows the latest-version message only for manual checks", async () => {
    const { updater, globalUI } = await setup();
    await updater.checkForUpdates(true);
    expect(globalUI.showAlert).not.toHaveBeenCalled();
    await updater.checkForUpdates(false);
    expect(globalUI.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: EN_I18N.appPage.latestVersionMessage,
      }),
    );
  });

  it("prompts automatically but respects Later", async () => {
    const { updater, globalUI, bridge } = await setup({ status: "available" });
    await updater.checkForUpdates(true);
    expect(globalUI.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: EN_I18N.appPage.googlePlayUpdateAvailable,
      }),
    );
    expect(bridge).not.toHaveBeenCalledWith("startAppUpdate");
  });

  it("starts a flexible update only after confirmation", async () => {
    const { updater, bridge, beforeInstall } = await setup({
      status: "available",
      confirmed: true,
    });
    await updater.checkForUpdates(false);
    expect(bridge).toHaveBeenCalledWith("startAppUpdate");
    expect(beforeInstall).not.toHaveBeenCalled();
    expect(bridge).not.toHaveBeenCalledWith("completeAppUpdate");
  });

  it("allows cancellation in the Google Play dialog", async () => {
    const { updater, bridge, globalUI } = await setup({
      status: "available",
      confirmed: true,
    });
    bridge
      .mockResolvedValueOnce({ status: "available" })
      .mockResolvedValueOnce({ status: "cancelled" });
    await updater.checkForUpdates(false);
    expect(globalUI.showAlert).not.toHaveBeenCalled();
  });

  it("does not report errors as being up to date", async () => {
    const { updater, bridge, globalUI } = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    bridge.mockRejectedValue(new Error("Play offline"));
    await updater.checkForUpdates(true);
    expect(globalUI.showAlert).not.toHaveBeenCalled();
    await updater.checkForUpdates(false);
    expect(globalUI.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: EN_I18N.appPage.googlePlayUpdateFailed,
      }),
    );
  });

  it.each(["not-allowed", "unknown", "failed"])(
    "reports unavailable update state %s on manual checks",
    async (status) => {
      const { updater, globalUI } = await setup({ status });
      await updater.checkForUpdates(false);
      expect(globalUI.showAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: EN_I18N.appPage.googlePlayUpdateFailed,
        }),
      );
    },
  );

  it("disables future checks when Play reports an unsupported installation", async () => {
    const { updater, globalUI, bridge } = await setup({
      status: "unsupported",
    });
    await updater.checkForUpdates(false);
    expect(updater.isSupported()).toBe(false);
    expect(globalUI.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: EN_I18N.appPage.googlePlayUpdatesUnavailable,
      }),
    );
    bridge.mockClear();
    await updater.checkForUpdates(true);
    expect(bridge).not.toHaveBeenCalled();
  });

  it("keeps manual checks visible and retryable when Play is unavailable on debug", async () => {
    const { updater, globalUI, bridge } = await setup({
      status: "unavailable",
    });
    await updater.checkForUpdates(true);
    expect(globalUI.showAlert).not.toHaveBeenCalled();
    await updater.checkForUpdates(false);
    expect(globalUI.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: EN_I18N.appPage.googlePlayUpdatesUnavailable,
      }),
    );
    expect(
      resolveUpdatesEnabled({
        appService: { getPlatform: () => "android" },
        updaterService: updater,
      }),
    ).toBe(true);
    expect(updater.isUpdateAvailable()).toBe(false);
    expect(bridge).not.toHaveBeenCalledWith("startAppUpdate");
    expect(bridge).not.toHaveBeenCalledWith("completeAppUpdate");

    bridge.mockResolvedValueOnce({ status: "up-to-date" });
    await updater.checkForUpdates(false);
    expect(globalUI.showAlert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: EN_I18N.appPage.latestVersionMessage,
      }),
    );
  });

  it("coalesces concurrent checks so prompts cannot stack", async () => {
    const { updater, bridge, globalUI } = await setup({ status: "available" });
    await Promise.all([
      updater.checkForUpdates(true),
      updater.checkForUpdates(false),
    ]);
    expect(
      bridge.mock.calls.filter(([method]) => method === "checkAppUpdate"),
    ).toHaveLength(1);
    expect(globalUI.showConfirm).toHaveBeenCalledTimes(1);
  });

  it("gives manual feedback when joining an automatic check", async () => {
    const { updater, globalUI } = await setup();
    await Promise.all([
      updater.checkForUpdates(true),
      updater.checkForUpdates(false),
    ]);
    expect(globalUI.showAlert).toHaveBeenCalledTimes(1);
    expect(globalUI.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: EN_I18N.appPage.latestVersionMessage,
      }),
    );
  });

  it("saves before completing a downloaded update and blocks editing while saving", async () => {
    const { updater, bridge, beforeInstall } = await setup({
      status: "downloaded",
      confirmed: true,
    });
    let finishSave;
    beforeInstall.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        }),
    );
    const updating = updater.checkForUpdates(false);
    await vi.waitFor(() => expect(beforeInstall).toHaveBeenCalled());
    expect(
      document.querySelector("#routevn-update-progress-dialog[open]"),
    ).not.toBeNull();
    expect(bridge).not.toHaveBeenCalledWith("completeAppUpdate");
    finishSave();
    await updating;
    expect(bridge).toHaveBeenCalledWith("completeAppUpdate");
    expect(
      document.querySelector("#routevn-update-progress-dialog"),
    ).toBeNull();
  });

  it("does not restart if saving fails", async () => {
    const { updater, bridge, beforeInstall, globalUI } = await setup({
      status: "downloaded",
      confirmed: true,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    beforeInstall.mockRejectedValue(new Error("Save failed"));
    await updater.checkForUpdates(false);
    expect(bridge).not.toHaveBeenCalledWith("completeAppUpdate");
    expect(globalUI.showAlert).toHaveBeenCalled();
  });

  it("handles downloaded events once and leaves Later accessible through manual checks", async () => {
    const { updater, globalUI, emit } = await setup({ status: "downloaded" });
    emit({ status: "downloaded", versionCode: 5 });
    await vi.waitFor(() =>
      expect(globalUI.showConfirm).toHaveBeenCalledTimes(1),
    );
    await updater.checkForUpdates(true);
    emit({ status: "downloaded", versionCode: 5 });
    expect(globalUI.showConfirm).toHaveBeenCalledTimes(1);
    await updater.checkForUpdates(false);
    expect(globalUI.showConfirm).toHaveBeenCalledTimes(2);
  });

  it("waits for the Play consent result before showing a download completion prompt", async () => {
    const { updater, bridge, globalUI, emit } = await setup({
      status: "available",
      confirmed: true,
    });
    let acceptPlay;
    bridge
      .mockResolvedValueOnce({ status: "available", versionCode: 5 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            acceptPlay = resolve;
          }),
      );
    const checking = updater.checkForUpdates(false);
    await vi.waitFor(() => expect(acceptPlay).toBeTypeOf("function"));
    emit({ status: "downloaded", versionCode: 5 });
    expect(globalUI.showConfirm).toHaveBeenCalledTimes(1);
    acceptPlay({ status: "downloading" });
    await checking;
    await vi.waitFor(() =>
      expect(globalUI.showConfirm).toHaveBeenCalledTimes(2),
    );
  });

  it("does not check or prompt in the background", async () => {
    const { updater, bridge, globalUI, isForeground, emit } = await setup();
    isForeground.mockReturnValue(false);
    bridge.mockClear();
    await updater.checkForUpdates(true);
    emit({ status: "downloaded", versionCode: 5 });
    expect(bridge).not.toHaveBeenCalled();
    expect(globalUI.showConfirm).not.toHaveBeenCalled();
  });
});
