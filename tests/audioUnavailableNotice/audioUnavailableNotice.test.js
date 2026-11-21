import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createDeps = (platform) => ({
  appService: {
    getPlatform: () => platform,
    showAlert: vi.fn(),
  },
  i18n: {
    appPage: {
      errorTitle: "Error",
      audioUnavailable: "Audio is unavailable.",
      audioUnavailableLockdownHint: "Turn off Lockdown Mode.",
      errorDetailsLabel: "Details:",
    },
  },
});

const loadNotice = async () => {
  vi.resetModules();
  return import("../../src/internal/ui/audioUnavailableNotice.js");
};

describe("audio unavailable notice", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds the Lockdown Mode hint only on iOS", async () => {
    const { showAudioUnavailableNotice } = await loadNotice();
    const ios = createDeps("ios");
    const android = createDeps("android");

    showAudioUnavailableNotice(ios);
    showAudioUnavailableNotice(android);

    expect(ios.appService.showAlert.mock.calls[0][0].message).toBe(
      "Audio is unavailable. Turn off Lockdown Mode.\n\nDetails:\nWeb Audio is not available",
    );
    expect(android.appService.showAlert.mock.calls[0][0].message).toBe(
      "Audio is unavailable.\n\nDetails:\nWeb Audio is not available",
    );
  });

  it("warns on every play action but only once for opening previews", async () => {
    const { warnIfAudioUnavailable, warnOnceIfAudioUnavailable } =
      await loadNotice();
    const deps = createDeps("ios");

    warnOnceIfAudioUnavailable(deps);
    warnOnceIfAudioUnavailable(deps);
    expect(deps.appService.showAlert).toHaveBeenCalledTimes(1);

    expect(warnIfAudioUnavailable(deps)).toBe(true);
    expect(warnIfAudioUnavailable(deps)).toBe(true);
    expect(deps.appService.showAlert).toHaveBeenCalledTimes(3);
  });

  it("stays quiet when audio is available", async () => {
    vi.stubGlobal("window", { AudioContext: class {} });
    const { warnIfAudioUnavailable, warnOnceIfAudioUnavailable } =
      await loadNotice();
    const deps = createDeps("ios");

    expect(warnIfAudioUnavailable(deps)).toBe(false);
    warnOnceIfAudioUnavailable(deps);
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });
});
