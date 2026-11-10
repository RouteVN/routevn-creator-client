import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  delete globalThis.__ROUTEVN_PLAYER_HOST__;
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("exposes an audio runtime that suspends and defers resumes in the background", async () => {
  const documentTarget = new EventTarget();
  documentTarget.hidden = false;
  class AudioContext extends EventTarget {
    state = "running";
    suspend = vi.fn(async () => {
      this.state = "suspended";
    });
    resume = vi.fn(async () => {
      this.state = "running";
    });
    close = vi.fn(async () => {});
  }
  const windowTarget = {
    AudioContext,
    performance,
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  vi.stubGlobal("window", windowTarget);
  vi.stubGlobal("document", documentTarget);

  await import("../../src/deps/clients/android/playerRuntimeHost.js");
  const host = globalThis.__ROUTEVN_PLAYER_HOST__;
  expect(Object.isFrozen(host)).toBe(true);
  expect(host.audioRuntime).toBeDefined();
  const context = host.audioRuntime.context;
  windowTarget.routeVNSetAppActive(false);
  expect(context.suspend).toHaveBeenCalledOnce();
  await context.resume();
  expect(context.state).toBe("suspended");
  windowTarget.routeVNSetAppActive(true);
  expect(context.state).toBe("running");
});
