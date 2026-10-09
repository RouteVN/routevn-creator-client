import { afterEach, describe, expect, it, vi } from "vitest";
import { createMobileAudioRuntime } from "../../src/deps/clients/mobileAudioRuntime.js";
import { saveWhenAppGoesInactive } from "../../src/deps/clients/mobileLifecycle.js";

// The real activity runtime on a fake window and document, as the Android and
// iOS setups run it: the native shell calls `routeVNSetAppActive`, and the
// page also reports becoming hidden.
const createHarness = () => {
  const documentTarget = Object.assign(new EventTarget(), { hidden: false });
  const windowTarget = {
    performance: { now: () => Date.now() },
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  const runtime = createMobileAudioRuntime({ windowTarget, documentTarget });
  const appService = { saveBeforeSuspend: vi.fn(async () => {}) };
  const unsubscribe = saveWhenAppGoesInactive({ runtime, appService });
  return {
    appService,
    unsubscribe,
    setNativeActive: (value) => windowTarget.routeVNSetAppActive(value),
    setHidden: (hidden) => {
      documentTarget.hidden = hidden;
      documentTarget.dispatchEvent(new Event("visibilitychange"));
    },
  };
};

afterEach(() => vi.restoreAllMocks());

describe("saving when the mobile app goes inactive", () => {
  it("saves nothing while the app is in the foreground", () => {
    const { appService } = createHarness();

    expect(appService.saveBeforeSuspend).not.toHaveBeenCalled();
  });

  it("saves when the native shell pauses the app, and not when it resumes", () => {
    const { appService, setNativeActive } = createHarness();

    setNativeActive(false);
    expect(appService.saveBeforeSuspend).toHaveBeenCalledTimes(1);
    expect(appService.saveBeforeSuspend).toHaveBeenCalledWith("background");

    setNativeActive(true);
    expect(appService.saveBeforeSuspend).toHaveBeenCalledTimes(1);
  });

  it("saves when the page becomes hidden, and not when it is shown again", () => {
    const { appService, setHidden } = createHarness();

    setHidden(true);
    expect(appService.saveBeforeSuspend).toHaveBeenCalledTimes(1);
    expect(appService.saveBeforeSuspend).toHaveBeenCalledWith("background");

    setHidden(false);
    expect(appService.saveBeforeSuspend).toHaveBeenCalledTimes(1);
  });

  it("saves once when both signals report the same change", () => {
    const { appService, setHidden, setNativeActive } = createHarness();

    setNativeActive(false);
    setHidden(true);

    expect(appService.saveBeforeSuspend).toHaveBeenCalledTimes(1);
  });

  it("saves again on the next time the app goes inactive", () => {
    const { appService, setNativeActive } = createHarness();

    setNativeActive(false);
    setNativeActive(true);
    setNativeActive(false);

    expect(appService.saveBeforeSuspend).toHaveBeenCalledTimes(2);
  });

  it("stops saving once unsubscribed", () => {
    const { appService, unsubscribe, setNativeActive } = createHarness();

    unsubscribe();
    setNativeActive(false);

    expect(appService.saveBeforeSuspend).not.toHaveBeenCalled();
  });
});
