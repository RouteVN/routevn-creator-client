import { afterEach, describe, expect, it, vi } from "vitest";
import { createMobileAudioRuntime } from "../../src/deps/clients/mobileAudioRuntime.js";
import { createIOSGraphicsAudioOutput } from "../../src/deps/clients/ios/graphicsAudioOutput.js";

const cleanups = [];
const createHarness = () => {
  const calls = [];
  const elements = [];
  const streams = [];
  const sources = [];
  const documentTarget = Object.assign(new EventTarget(), {
    hidden: false,
    body: { append: vi.fn() },
    createElement: () => {
      const element = {
        paused: true,
        play: vi.fn(async () => {
          calls.push("play");
          element.paused = false;
        }),
        pause: vi.fn(() => {
          calls.push("pause");
          element.paused = true;
        }),
        remove: vi.fn(),
      };
      elements.push(element);
      return element;
    },
  });
  class AudioContext extends EventTarget {
    state = "running";
    destination = { native: true };
    get currentTime() {
      return 1;
    }
    createGain() {
      expect(this).toBe(context);
      return { connect: vi.fn(), gain: { value: 1 } };
    }
    createMediaStreamDestination() {
      const track = { stop: vi.fn(() => calls.push("track.stop")) };
      const destination = {
        stream: { getTracks: () => [track] },
        disconnect: vi.fn(),
      };
      streams.push(destination);
      return destination;
    }
    createConstantSource() {
      const source = {
        offset: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(() => calls.push("silence.start")),
        stop: vi.fn(() => calls.push("silence.stop")),
      };
      sources.push(source);
      return source;
    }
    async resume() {
      this.state = "running";
      this.dispatchEvent(new Event("statechange"));
    }
    async suspend() {
      calls.push("suspend");
      this.state = "suspended";
      this.dispatchEvent(new Event("statechange"));
    }
    async close() {
      this.state = "closed";
    }
  }
  const windowTarget = {
    AudioContext,
    performance: { now: () => performance.now() },
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  const runtime = createMobileAudioRuntime({ windowTarget, documentTarget });
  const context = runtime.graphicsRuntime.context;
  const output = createIOSGraphicsAudioOutput({ runtime, documentTarget });
  cleanups.push(async () => {
    output.close();
    await runtime.dispose();
  });
  const setActive = (active) => windowTarget.routeVNSetAppActive(active);
  return {
    runtime,
    context,
    output,
    documentTarget,
    calls,
    elements,
    streams,
    sources,
    setActive,
  };
};

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe("iOS scene engine audio output", () => {
  it("routes the engine to media while preserving native node methods and clock", async () => {
    const h = createHarness();
    const engineContext = h.output.graphicsRuntime.context;
    const node = engineContext.createGain();
    node.connect(engineContext.destination);
    expect(node.connect).toHaveBeenCalledWith(h.streams[0]);
    expect(h.context.destination).toEqual({ native: true });
    expect(engineContext.currentTime).toBe(1);
    expect(h.output.graphicsRuntime.nowMs).toBe(
      h.runtime.graphicsRuntime.nowMs,
    );
    expect(h.sources[0].offset.value).toBe(0);
    expect(h.sources[0].connect).toHaveBeenCalledWith(h.streams[0]);
    expect(h.elements[0].paused).toBe(true);
    await h.output.resume();
    expect(h.elements[0].paused).toBe(false);
  });

  it("pauses the sink before disposing producers and recreates it for the next preview", async () => {
    const h = createHarness();
    await h.output.resume();
    h.calls.length = 0;
    h.output.close();
    expect(h.calls.indexOf("pause")).toBeLessThan(
      h.calls.indexOf("silence.stop"),
    );
    expect(h.elements[0].srcObject).toBeNull();
    expect(h.elements[0].remove).toHaveBeenCalledOnce();
    expect(h.streams[0].stream.getTracks()[0].stop).toHaveBeenCalledOnce();
    h.output.close();
    expect(h.sources[0].stop).toHaveBeenCalledOnce();
    await h.output.resume();
    expect(h.elements).toHaveLength(2);
    expect(h.output.graphicsRuntime.context.destination).toBe(h.streams[1]);
    expect(h.elements[1].paused).toBe(false);
  });

  it("pauses before background suspension and only resumes an open preview", async () => {
    const h = createHarness();
    await h.output.resume();
    h.calls.length = 0;
    h.setActive(false);
    expect(h.calls.indexOf("pause")).toBeLessThan(h.calls.indexOf("suspend"));
    expect(h.elements[0].paused).toBe(true);
    h.setActive(true);
    await Promise.resolve();
    expect(h.elements[0].paused).toBe(false);
    h.setActive(false);
    h.output.close();
    h.setActive(true);
    await Promise.resolve();
    expect(h.elements[0].paused).toBe(true);
    expect(h.elements).toHaveLength(1);
  });

  it("keeps a preview created in the background paused until foregrounding", async () => {
    const h = createHarness();
    h.setActive(false);
    await h.output.resume();
    expect(h.elements[0].play).not.toHaveBeenCalled();
    h.setActive(true);
    await Promise.resolve();
    expect(h.elements[0].paused).toBe(false);
  });

  it("cleans up failed playback and allows retrying", async () => {
    const h = createHarness();
    void h.output.graphicsRuntime.context.destination;
    h.elements[0].play.mockRejectedValue(new Error("Playback denied"));
    await expect(h.output.resume()).rejects.toThrow("Playback denied");
    expect(h.elements[0].remove).toHaveBeenCalledOnce();
    expect(h.sources[0].stop).toHaveBeenCalledOnce();
    await h.output.resume();
    expect(h.elements[1].paused).toBe(false);
  });

  it("cannot restart media after a pending play completes for a closed preview", async () => {
    const h = createHarness();
    void h.output.graphicsRuntime.context.destination;
    let finish;
    h.elements[0].play.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => {
            h.elements[0].paused = false;
            resolve();
          };
        }),
    );
    const pending = h.output.resume();
    h.output.close();
    finish();
    await pending;
    expect(h.elements[0].paused).toBe(true);
    expect(h.elements).toHaveLength(1);
  });
});
