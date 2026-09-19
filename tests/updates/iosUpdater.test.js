import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { createIOSUpdater } from "../../src/deps/clients/ios/updater.js";
import { createGlobalUIClient } from "../../src/deps/clients/globalUI.js";
import { ROUTEVN_CREATOR_APP_STORE_URL } from "../../src/internal/routevnUrls.js";
import { EN_I18N } from "../support/i18n.js";

const copy = EN_I18N.appPage;
const available = {
  status: "updateAvailable",
  release: { version: "1.16.0", changelog: "Improved editing" },
};
const setup = ({
  result = available,
  confirmed = false,
  olderShell = false,
} = {}) => {
  const metadataClient = { check: vi.fn().mockResolvedValue(result) };
  const rawUI = {
    showConfirm: vi.fn().mockResolvedValue(confirmed),
    showAlert: vi.fn().mockResolvedValue(undefined),
  };
  const globalUI = createGlobalUIClient({ globalUI: rawUI });
  const openUrl = vi.fn().mockResolvedValue(undefined);
  const isForeground = vi.fn(() => true);
  const updater = createIOSUpdater({
    globalUI,
    keyValueStore: new Map(),
    metadataClient: olderShell ? undefined : metadataClient,
    openUrl,
    getCopy: () => copy,
    isForeground,
  });
  return { updater, metadataClient, rawUI, globalUI, openUrl, isForeground };
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("iOS update prompts", () => {
  it.each([true, false])(
    "opens the configured App Store only with confirmation %s",
    async (confirmed) => {
      const { updater, rawUI, openUrl } = setup({ confirmed });
      await updater.checkForUpdates(true);
      expect(rawUI.showConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: copy.updateAvailableMessage
            .replace("{version}", "1.16.0")
            .replace("{releaseNotes}", "Improved editing"),
        }),
      );
      if (confirmed)
        expect(openUrl).toHaveBeenCalledExactlyOnceWith(
          ROUTEVN_CREATOR_APP_STORE_URL,
        );
      else expect(openUrl).not.toHaveBeenCalled();
    },
  );

  it.each([
    "noCompatibleRelease",
    "unsupportedClient",
    "offline",
    "olderShell",
  ])(
    "retains a manual store fallback for %s without claiming latest",
    async (reason) => {
      const result =
        reason === "unsupportedClient"
          ? { status: reason }
          : { status: "noUpdate", reason };
      const { updater, rawUI, metadataClient, openUrl } = setup({
        result,
        confirmed: true,
        olderShell: reason === "olderShell",
      });
      if (reason === "offline")
        metadataClient.check.mockRejectedValue(new Error("Unavailable"));
      await updater.checkForUpdates(true);
      expect(rawUI.showConfirm).not.toHaveBeenCalled();
      await updater.checkForUpdates(false);
      expect(rawUI.showAlert).not.toHaveBeenCalled();
      expect(rawUI.showConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: copy.retrieveUpdateInfoFallback }),
      );
      expect(openUrl).toHaveBeenCalledWith(ROUTEVN_CREATOR_APP_STORE_URL);
    },
  );

  it("shows latest only for a successful manual upToDate check", async () => {
    const { updater, rawUI } = setup({
      result: { status: "noUpdate", reason: "upToDate" },
    });
    await updater.checkForUpdates(true);
    expect(rawUI.showAlert).not.toHaveBeenCalled();
    await updater.checkForUpdates(false);
    expect(rawUI.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: copy.latestVersionMessage }),
    );
  });

  it("shares an in-flight automatic/manual check and supplies manual feedback", async () => {
    const { updater, rawUI, metadataClient } = setup({
      result: { status: "noUpdate", reason: "upToDate" },
    });
    await Promise.all([
      updater.checkForUpdates(true),
      updater.checkForUpdates(false),
    ]);
    expect(metadataClient.check).toHaveBeenCalledOnce();
    expect(rawUI.showAlert).toHaveBeenCalledOnce();
  });

  it("respects foreground state before checking and after deferred work", async () => {
    const { updater, metadataClient, globalUI, rawUI, isForeground } = setup();
    isForeground.mockReturnValue(false);
    await updater.checkForUpdates(true);
    expect(metadataClient.check).not.toHaveBeenCalled();
    isForeground.mockReturnValue(true);
    let close;
    rawUI.showAlert.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          close = resolve;
        }),
    );
    const editing = globalUI.showAlert({ message: "Editing" });
    const checking = updater.checkForUpdates(true);
    await Promise.resolve();
    expect(rawUI.showConfirm).not.toHaveBeenCalled();
    isForeground.mockReturnValue(false);
    close();
    await Promise.all([editing, checking]);
    expect(rawUI.showConfirm).not.toHaveBeenCalled();
  });

  it("waits for a real progress dialog to close", async () => {
    const dom = new JSDOM("<body></body>");
    vi.stubGlobal("document", dom.window.document);
    const { updater, globalUI, rawUI } = setup();
    const progress = globalUI.showProgressDialog({ title: "Exporting" });
    const checking = updater.checkForUpdates(true);
    await Promise.resolve();
    expect(document.querySelector("#routevn-progress-dialog")).not.toBeNull();
    expect(rawUI.showConfirm).not.toHaveBeenCalled();
    progress.close();
    await checking;
    expect(rawUI.showConfirm).toHaveBeenCalledOnce();
    dom.window.close();
  });

  it("automatically checks on startup and leaves old shells quiet", async () => {
    vi.useFakeTimers();
    const normal = setup();
    normal.updater.startAutomaticChecks();
    await vi.advanceTimersByTimeAsync(0);
    expect(normal.metadataClient.check).toHaveBeenCalledOnce();
    const old = setup({ olderShell: true });
    old.updater.startAutomaticChecks();
    await vi.advanceTimersByTimeAsync(0);
    expect(old.rawUI.showConfirm).not.toHaveBeenCalled();
  });

  it("reports failed store opening using localized feedback", async () => {
    const { updater, rawUI, openUrl } = setup({ confirmed: true });
    openUrl.mockRejectedValue(new Error("No handler"));
    await updater.checkForUpdates(false);
    expect(rawUI.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: copy.failedOpenLink }),
    );
  });
});
