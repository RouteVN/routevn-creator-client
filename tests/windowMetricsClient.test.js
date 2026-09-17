import { describe, expect, it, vi } from "vitest";
import { createWindowMetricsClient } from "../src/deps/clients/windowMetrics.js";

describe("native window metrics", () => {
  it("shares initial loading, follows native changes, and cleans up", async () => {
    const windowTarget = new EventTarget();
    const remove = vi.spyOn(windowTarget, "removeEventListener");
    const loadMetrics = vi.fn(async () => ({ width: 768, height: 1024 }));
    const client = createWindowMetricsClient({ loadMetrics, windowTarget });
    const listener = vi.fn();
    const stop = client.subscribe(listener);
    const stopSecond = client.subscribe(() => {});
    await Promise.resolve();
    expect(loadMetrics).toHaveBeenCalledOnce();
    expect(client.getMetrics()).toEqual({ width: 768, height: 1024 });
    windowTarget.dispatchEvent(
      new CustomEvent("routevn:window-metrics", {
        detail: { width: 1024, height: 768 },
      }),
    );
    expect(listener).toHaveBeenLastCalledWith({ width: 1024, height: 768 });
    stop();
    expect(remove).not.toHaveBeenCalled();
    stopSecond();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("does not apply an initial result that arrives after rotation", async () => {
    const windowTarget = new EventTarget();
    let resolveMetrics;
    const client = createWindowMetricsClient({
      windowTarget,
      loadMetrics: () =>
        new Promise((resolve) => {
          resolveMetrics = resolve;
        }),
    });
    const listener = vi.fn();
    const stop = client.subscribe(listener);
    windowTarget.dispatchEvent(
      new CustomEvent("routevn:window-metrics", {
        detail: { width: 1024, height: 768 },
      }),
    );
    resolveMetrics({ width: 768, height: 1024 });
    await Promise.resolve();
    expect(client.getMetrics()).toEqual({ width: 1024, height: 768 });
    expect(listener).toHaveBeenCalledOnce();
    stop();
  });
});
