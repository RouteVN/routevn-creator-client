import { afterEach, describe, expect, it, vi } from "vitest";
import { createAndroidAudioRuntime } from "../../src/deps/clients/android/audioRuntime.js";
import { createAudioService } from "../../src/deps/services/audioService.js";

const runtimes = [];

const createHarness = () => {
  vi.useFakeTimers();
  const documentTarget = new EventTarget();
  documentTarget.hidden = false;
  class AudioContext extends EventTarget {
    state = "running";
    destination = {};
    elapsed = 0;
    startedAt = Date.now();
    get currentTime() {
      return (
        (this.elapsed +
          (this.state === "running" ? Date.now() - this.startedAt : 0)) /
        1000
      );
    }
    suspend = vi.fn(async () => {
      if (this.state === "running") this.elapsed += Date.now() - this.startedAt;
      this.state = "suspended";
      this.dispatchEvent(new Event("statechange"));
    });
    resume = vi.fn(async () => {
      this.startedAt = Date.now();
      this.state = "running";
      this.dispatchEvent(new Event("statechange"));
    });
    close = vi.fn(async () => {
      this.state = "closed";
    });
    createGain = () => ({ connect() {}, gain: { value: 1 } });
    createBufferSource = vi.fn(() => ({
      connect() {},
      disconnect() {},
      start: vi.fn(),
      stop: vi.fn(),
    }));
    decodeAudioData = async () => ({ duration: 60 });
  }
  const windowTarget = {
    AudioContext,
    performance: { now: () => Date.now() },
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  const runtime = createAndroidAudioRuntime({ windowTarget, documentTarget });
  runtimes.push(runtime);
  const setHidden = (hidden) => {
    documentTarget.hidden = hidden;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
  };
  return { runtime, windowTarget, setHidden };
};

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Android audio lifecycle", () => {
  it("freezes both preview and sound-player contexts until the app is visible", async () => {
    const { runtime, windowTarget, setHidden } = createHarness();
    const preview = runtime.graphicsRuntime.context;
    const soundPlayer = runtime.createAudioContext();
    await vi.advanceTimersByTimeAsync(300);

    windowTarget.routeVNSetAppActive(false);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(preview.state).toBe("suspended");
    expect(soundPlayer.state).toBe("suspended");
    expect(preview.currentTime).toBe(0.3);
    expect(soundPlayer.currentTime).toBe(0.3);
    expect(preview.suspend).toHaveBeenCalledOnce();

    windowTarget.routeVNSetAppActive(true);
    expect(preview.state).toBe("suspended");
    setHidden(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(preview.currentTime).toBe(0.5);
    expect(soundPlayer.currentTime).toBe(0.5);
  });

  it("blocks delayed resume requests and contexts created in the background", async () => {
    const { runtime, setHidden } = createHarness();
    setHidden(true);
    const context = runtime.createAudioContext();

    await context.resume();
    expect(context.state).toBe("suspended");
    await vi.advanceTimersByTimeAsync(1000);
    expect(context.currentTime).toBe(0);

    setHidden(false);
    expect(context.state).toBe("running");
  });

  it("suspends a previously pending resume if it completes after backgrounding", () => {
    const { runtime, setHidden } = createHarness();
    const context = runtime.createAudioContext();
    setHidden(true);

    context.state = "running";
    context.dispatchEvent(new Event("statechange"));

    expect(context.state).toBe("suspended");
    expect(context.suspend).toHaveBeenCalledTimes(2);
  });

  it("preserves sound delays and intervals without replaying background time", async () => {
    const { runtime, setHidden } = createHarness();
    const clock = runtime.graphicsRuntime;
    const startedAt = clock.nowMs();
    const delayed = vi.fn();
    const repeating = vi.fn();
    const createdWhileHidden = vi.fn();
    clock.setTimeout(delayed, 1000);
    const interval = clock.setInterval(repeating, 200);
    await vi.advanceTimersByTimeAsync(250);
    setHidden(true);
    clock.setTimeout(createdWhileHidden, 500);

    await vi.advanceTimersByTimeAsync(10000);
    expect(clock.nowMs() - startedAt).toBe(250);
    expect(delayed).not.toHaveBeenCalled();
    expect(createdWhileHidden).not.toHaveBeenCalled();
    expect(repeating).toHaveBeenCalledOnce();

    setHidden(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(repeating).toHaveBeenCalledTimes(2);
    clock.clearInterval(interval);
    await vi.advanceTimersByTimeAsync(350);
    expect(createdWhileHidden).toHaveBeenCalledOnce();
    expect(delayed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(delayed).toHaveBeenCalledOnce();
    expect(repeating).toHaveBeenCalledTimes(2);
  });

  it("does not resume a closed or already suspended context", async () => {
    const { runtime, setHidden } = createHarness();
    const closed = runtime.createAudioContext();
    const suspended = runtime.createAudioContext();
    await suspended.suspend();
    setHidden(true);
    await closed.close();
    setHidden(false);

    expect(closed.state).toBe("closed");
    expect(suspended.state).toBe("suspended");
  });

  it("preserves sound-player position and keeps a user-paused track paused", async () => {
    const { runtime, windowTarget, setHidden } = createHarness();
    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );
    const service = createAudioService({
      createAudioContext: runtime.createAudioContext,
    });
    const release = service.acquire();
    try {
      await service.loadAudio("blob:track-one");
      await service.play();
      await vi.advanceTimersByTimeAsync(500);
      setHidden(true);
      await vi.advanceTimersByTimeAsync(5000);
      expect(service.getCurrentTime()).toBe(0.5);
      setHidden(false);
      await vi.advanceTimersByTimeAsync(500);
      expect(service.getCurrentTime()).toBe(1);

      service.pause();
      setHidden(true);
      setHidden(false);
      await vi.advanceTimersByTimeAsync(500);
      expect(service.isPlaying()).toBe(false);
      expect(service.getCurrentTime()).toBe(1);
    } finally {
      release();
    }
  });

  it("clears scheduled work and native hooks when disposed", async () => {
    const { runtime, windowTarget, setHidden } = createHarness();
    const context = runtime.createAudioContext();
    const callback = vi.fn();
    runtime.graphicsRuntime.setTimeout(callback, 100);
    await runtime.dispose();
    setHidden(true);
    await vi.advanceTimersByTimeAsync(1000);

    expect(context.state).toBe("closed");
    expect(callback).not.toHaveBeenCalled();
    expect(windowTarget.routeVNSetAppActive).toBeUndefined();
  });
});
