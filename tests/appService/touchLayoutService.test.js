import { describe, expect, it, vi } from "vitest";
import { createWindowMetricsClient } from "../../src/deps/clients/windowMetrics.js";
import { createTouchLayoutService } from "../../src/deps/services/shared/touchLayoutService.js";

const resizeWindow = (windowTarget, width, height) =>
  windowTarget.dispatchEvent(
    new CustomEvent("routevn:window-metrics", { detail: { width, height } }),
  );

const createNativeService = ({ width, height, uiConfig = { id: "touch" } }) => {
  const windowTarget = new EventTarget();
  const windowMetricsClient = createWindowMetricsClient({
    windowTarget,
    loadMetrics: async () => ({ width, height }),
  });
  return {
    windowTarget,
    service: createTouchLayoutService({ windowMetricsClient, uiConfig }),
  };
};

describe("touch layout service", () => {
  it("is never touch landscape without window metrics", () => {
    const service = createTouchLayoutService({ uiConfig: { id: "touch" } });
    const listener = vi.fn();

    service.subscribeTouchLandscape(listener)();

    expect(service.isTouchLandscape()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("reports the loaded flag, then only flips", async () => {
    const { windowTarget, service } = createNativeService({
      width: 820,
      height: 1180,
    });
    const listener = vi.fn();

    expect(service.isTouchLandscape()).toBe(false);
    const stop = service.subscribeTouchLandscape(listener);
    await Promise.resolve();
    expect(listener.mock.calls).toEqual([[false]]);

    resizeWindow(windowTarget, 1180, 820);
    resizeWindow(windowTarget, 1366, 1024);
    expect(listener.mock.calls).toEqual([[false], [true]]);
    expect(service.isTouchLandscape()).toBe(true);

    resizeWindow(windowTarget, 590, 820);
    expect(listener.mock.calls).toEqual([[false], [true], [false]]);
    expect(service.isTouchLandscape()).toBe(false);

    stop();
    resizeWindow(windowTarget, 1180, 820);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("keeps the getter current without subscribers", async () => {
    const { windowTarget, service } = createNativeService({
      width: 820,
      height: 1180,
    });
    expect(service.isTouchLandscape()).toBe(false);
    await Promise.resolve();

    resizeWindow(windowTarget, 1180, 820);
    expect(service.isTouchLandscape()).toBe(true);
  });

  it("gives each subscriber the current flag", async () => {
    const { windowTarget, service } = createNativeService({
      width: 1180,
      height: 820,
    });
    const first = vi.fn();
    const stopFirst = service.subscribeTouchLandscape(first);
    await Promise.resolve();

    const second = vi.fn();
    const stopSecond = service.subscribeTouchLandscape(second);
    resizeWindow(windowTarget, 1133, 744);

    expect(first.mock.calls).toEqual([[true]]);
    expect(second.mock.calls).toEqual([[true]]);
    stopFirst();
    stopSecond();
  });

  it("is never touch landscape in the pointer UI", async () => {
    const { service } = createNativeService({
      width: 1440,
      height: 900,
      uiConfig: { id: "normal" },
    });
    const listener = vi.fn();
    const stop = service.subscribeTouchLandscape(listener);
    await Promise.resolve();

    expect(listener.mock.calls).toEqual([[false]]);
    expect(service.isTouchLandscape()).toBe(false);
    stop();
  });
});
