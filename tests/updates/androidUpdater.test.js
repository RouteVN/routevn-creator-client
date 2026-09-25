import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { createAndroidUpdater } from "../../src/deps/clients/android/updater.js";
import { createGlobalUIClient } from "../../src/deps/clients/globalUI.js";
import { ROUTEVN_CREATOR_PLAY_STORE_URL } from "../../src/internal/routevnUrls.js";
import { EN_I18N } from "../support/i18n.js";

const copy = EN_I18N.appPage;
const storeUrl = `${ROUTEVN_CREATOR_PLAY_STORE_URL}&hl=en`;
const available = {
  status: "updateAvailable",
  release: {
    version: "1.17.0",
    changelog: "Improved editing",
    installation: { type: "googlePlay", build: "20", url: storeUrl },
  },
};

const setup = ({
  result = available,
  confirmed = false,
  distribution = "google-play",
} = {}) => {
  const metadataClient = { check: vi.fn().mockResolvedValue(result) };
  const rawUI = {
    showConfirm: vi.fn().mockResolvedValue(confirmed),
    showAlert: vi.fn().mockResolvedValue(undefined),
  };
  const globalUI = createGlobalUIClient({ globalUI: rawUI });
  const openUrl = vi.fn().mockResolvedValue(undefined);
  const isForeground = vi.fn(() => true);
  const updater = createAndroidUpdater({
    distribution,
    globalUI,
    keyValueStore: { get: vi.fn(), set: vi.fn() },
    metadataClient,
    openUrl,
    getCopy: () => copy,
    isForeground,
  });
  return { updater, metadataClient, rawUI, globalUI, openUrl, isForeground };
};

let dom;
afterEach(() => {
  dom?.window.close();
  dom = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Android API-owned updates", () => {
  it.each(["direct", "unknown"])(
    "does not offer Play Store updates for %s distributions",
    (distribution) => {
      const { updater, metadataClient } = setup({ distribution });
      expect(updater).toBeUndefined();
      expect(metadataClient.check).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    "uses the API release and opens its Store URL only after confirmation %s",
    async (confirmed) => {
      const { updater, metadataClient, rawUI, openUrl } = setup({ confirmed });

      await updater.checkForUpdates(false);

      expect(metadataClient.check).toHaveBeenCalledExactlyOnceWith();
      expect(rawUI.showConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: copy.updateAvailableMessage
            .replace("{version}", "1.17.0")
            .replace("{releaseNotes}", "Improved editing"),
        }),
      );
      expect(updater.getUpdateInfo()).toEqual(available);
      expect(updater.isUpdateAvailable()).toBe(true);
      if (confirmed) expect(openUrl).toHaveBeenCalledExactlyOnceWith(storeUrl);
      else expect(openUrl).not.toHaveBeenCalled();
    },
  );

  it("uses only a successful API upToDate decision to report the latest version", async () => {
    const { updater, metadataClient, rawUI } = setup();
    await updater.checkForUpdates(true);
    metadataClient.check.mockResolvedValue({
      status: "noUpdate",
      reason: "upToDate",
    });
    await updater.checkForUpdates(true);
    expect(rawUI.showAlert).not.toHaveBeenCalled();
    expect(updater.isUpdateAvailable()).toBe(false);

    await updater.checkForUpdates(false);
    expect(rawUI.showAlert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: copy.latestVersionMessage,
      }),
    );
  });

  it.each(["offline", "noCompatibleRelease", "unsupportedClient"])(
    "does not invent an update when API decision is %s",
    async (reason) => {
      const { updater, metadataClient, rawUI, openUrl } = setup({
        confirmed: false,
      });
      if (reason === "offline")
        metadataClient.check.mockRejectedValue(new Error("Offline"));
      else if (reason === "unsupportedClient")
        metadataClient.check.mockResolvedValue({ status: reason });
      else
        metadataClient.check.mockResolvedValue({ status: "noUpdate", reason });

      await updater.checkForUpdates(true);
      expect(rawUI.showConfirm).not.toHaveBeenCalled();
      await updater.checkForUpdates(false);

      expect(rawUI.showConfirm).not.toHaveBeenCalled();
      expect(rawUI.showAlert).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          title: copy.errorTitle,
          message: copy.retrieveUpdateInfoFallback,
        }),
      );
      expect(openUrl).not.toHaveBeenCalled();
      expect(updater.isUpdateAvailable()).toBe(false);
    },
  );

  it("clears stale availability after an API error", async () => {
    const { updater, metadataClient } = setup();
    await updater.checkForUpdates(true);
    metadataClient.check.mockRejectedValue(new Error("Offline"));
    await updater.checkForUpdates(true);
    expect(updater.getUpdateInfo()).toBeUndefined();
    expect(updater.isUpdateAvailable()).toBe(false);
  });

  it("shares one pending API request and closes its loading dialog before the result", async () => {
    dom = new JSDOM("<body></body>");
    vi.stubGlobal("document", dom.window.document);
    vi.useFakeTimers();
    const { updater, metadataClient, rawUI } = setup();
    let resolveCheck;
    metadataClient.check.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    rawUI.showAlert.mockImplementation(async () => {
      expect(document.querySelector("#routevn-update-check-dialog")).toBeNull();
    });

    const automatic = updater.checkForUpdates(true);
    const manual = updater.checkForUpdates(false);
    expect(manual).toBe(automatic);
    await vi.advanceTimersByTimeAsync(200);
    expect(
      document.querySelector("#routevn-update-check-dialog"),
    ).not.toBeNull();
    expect(metadataClient.check).toHaveBeenCalledExactlyOnceWith();
    resolveCheck({ status: "noUpdate", reason: "upToDate" });
    await manual;
    expect(rawUI.showAlert).toHaveBeenCalledOnce();
    expect(document.querySelector("#routevn-update-check-dialog")).toBeNull();
  });

  it("reports a failed Store handoff without reporting an API failure", async () => {
    const { updater, openUrl, rawUI } = setup({ confirmed: true });
    openUrl.mockRejectedValue(new Error("Store unavailable"));

    await updater.checkForUpdates(false);

    expect(rawUI.showAlert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: copy.failedOpenLink,
      }),
    );
  });
});
