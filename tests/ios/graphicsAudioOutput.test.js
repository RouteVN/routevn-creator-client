import { afterEach, describe, expect, it, vi } from "vitest";
import { createMobileAudioRuntime } from "../../src/deps/clients/mobileAudioRuntime.js";
import { createIOSGraphicsAudioOutput } from "../../src/deps/clients/ios/graphicsAudioOutput.js";

const cleanups = [];
const refusal = () =>
  Object.assign(new Error("The request is not allowed"), {
    name: "NotAllowedError",
  });

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
  const onError = vi.fn();
  const output = createIOSGraphicsAudioOutput({
    runtime,
    documentTarget,
    onError,
  });
  cleanups.push(async () => {
    output.close();
    await runtime.dispose();
  });
  const setActive = (active) => windowTarget.routeVNSetAppActive(active);
  return {
    runtime,
    context,
    output,
    onError,
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

  it("pauses the sink between previews and keeps feeding it silence", async () => {
    const h = createHarness();
    await h.output.resume();
    h.calls.length = 0;
    h.output.close();
    h.output.close();
    expect(h.calls).toEqual(["pause", "pause"]);
    expect(h.elements[0].paused).toBe(true);
    expect(h.elements[0].remove).not.toHaveBeenCalled();
    expect(h.streams[0].stream.getTracks()[0].stop).not.toHaveBeenCalled();
    await h.output.resume();
    expect(h.elements).toHaveLength(1);
    expect(h.output.graphicsRuntime.context.destination).toBe(h.streams[0]);
    expect(h.sources).toHaveLength(1);
    expect(h.sources[0].stop).not.toHaveBeenCalled();
    expect(h.elements[0].paused).toBe(false);
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

  it("replaces the sink after a failed start", async () => {
    const h = createHarness();
    void h.output.graphicsRuntime.context.destination;
    h.elements[0].play.mockRejectedValueOnce(new Error("Playback denied"));
    await expect(h.output.resume()).rejects.toThrow("Playback denied");
    expect(h.elements[0].remove).toHaveBeenCalledOnce();
    expect(h.sources[0].stop).toHaveBeenCalledOnce();
    await h.output.resume();
    expect(h.elements).toHaveLength(2);
    expect(h.output.graphicsRuntime.context.destination).toBe(h.streams[1]);
    expect(h.elements[1].paused).toBe(false);
  });

  it("waits for a tap when WebKit refuses to start without one", async () => {
    const h = createHarness();
    const refused = Object.assign(new Error("The request is not allowed"), {
      name: "NotAllowedError",
    });
    void h.output.graphicsRuntime.context.destination;
    h.elements[0].play.mockRejectedValueOnce(refused);
    await expect(h.output.resume()).resolves.toBeUndefined();
    expect(h.elements[0].paused).toBe(true);
    expect(h.elements[0].remove).not.toHaveBeenCalled();
    h.documentTarget.dispatchEvent(new Event("touchend"));
    await Promise.resolve();
    expect(h.elements[0].paused).toBe(false);
    // Started once, later taps leave it alone.
    h.documentTarget.dispatchEvent(new Event("pointerup"));
    expect(h.elements[0].play).toHaveBeenCalledTimes(2);
  });

  it("waits for a tap when WebKit refuses to start the audio context", async () => {
    const h = createHarness();
    void h.output.graphicsRuntime.context.destination;
    h.context.state = "suspended";
    const resume = vi.spyOn(h.context, "resume");
    resume.mockRejectedValueOnce(refusal());
    await expect(h.output.resume()).resolves.toBeUndefined();
    expect(h.context.state).toBe("suspended");
    h.documentTarget.dispatchEvent(new Event("touchend"));
    expect(resume).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    expect(h.context.state).toBe("running");
    expect(h.elements[0].paused).toBe(false);
  });

  it("reports a failure on the tap once and replaces the sink", async () => {
    const h = createHarness();
    void h.output.graphicsRuntime.context.destination;
    const failure = new Error("Media stream ended");
    h.elements[0].play
      .mockRejectedValueOnce(refusal())
      .mockRejectedValueOnce(failure);
    await h.output.resume();
    // One tap sends several activation events.
    h.documentTarget.dispatchEvent(new Event("pointerup"));
    h.documentTarget.dispatchEvent(new Event("touchend"));
    await vi.waitFor(() => expect(h.onError).toHaveBeenCalledOnce());
    expect(h.onError).toHaveBeenCalledWith(failure);
    expect(h.elements[0].play).toHaveBeenCalledTimes(2);
    expect(h.elements[0].remove).toHaveBeenCalledOnce();
    expect(h.sources[0].stop).toHaveBeenCalledOnce();
    h.documentTarget.dispatchEvent(new Event("touchend"));
    expect(h.elements[0].play).toHaveBeenCalledTimes(2);
    await h.output.resume();
    expect(h.elements).toHaveLength(2);
    expect(h.elements[1].paused).toBe(false);
  });

  it("keeps waiting when the tap is refused too", async () => {
    const h = createHarness();
    void h.output.graphicsRuntime.context.destination;
    h.elements[0].play
      .mockRejectedValueOnce(refusal())
      .mockRejectedValueOnce(refusal());
    await h.output.resume();
    h.documentTarget.dispatchEvent(new Event("touchend"));
    expect(h.elements[0].play).toHaveBeenCalledTimes(2);
    // Let the refused tap settle before the next one.
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.documentTarget.dispatchEvent(new Event("touchend"));
    expect(h.elements[0].play).toHaveBeenCalledTimes(3);
    await Promise.resolve();
    expect(h.elements[0].paused).toBe(false);
    expect(h.onError).not.toHaveBeenCalled();
  });

  it("treats an interrupted start of the open preview as a failure", async () => {
    const h = createHarness();
    void h.output.graphicsRuntime.context.destination;
    h.elements[0].play.mockRejectedValueOnce(
      Object.assign(new Error("Interrupted"), { name: "AbortError" }),
    );
    await expect(h.output.resume()).rejects.toThrow("Interrupted");
    expect(h.elements[0].remove).toHaveBeenCalledOnce();
  });

  it("does not start the sink on taps when nothing needs audio", async () => {
    const h = createHarness();
    void h.output.graphicsRuntime.context.destination;
    h.documentTarget.dispatchEvent(new Event("touchend"));
    expect(h.elements[0].play).not.toHaveBeenCalled();
    h.elements[0].play.mockRejectedValueOnce(
      Object.assign(new Error("Refused"), { name: "NotAllowedError" }),
    );
    await h.output.resume();
    h.output.close();
    h.documentTarget.dispatchEvent(new Event("touchend"));
    expect(h.elements[0].play).toHaveBeenCalledOnce();
  });

  it("leaves the sink paused for a preview that closed while starting", async () => {
    const h = createHarness();
    void h.output.graphicsRuntime.context.destination;
    h.context.state = "suspended";
    let finishResume;
    vi.spyOn(h.context, "resume").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishResume = () => {
            h.context.state = "running";
            resolve();
          };
        }),
    );
    const pending = h.output.resume();
    h.output.close();
    finishResume();
    await pending;
    expect(h.elements[0].paused).toBe(true);
    expect(h.onError).not.toHaveBeenCalled();
  });

  it("keeps the next preview playing when a closed one's start is interrupted", async () => {
    const h = createHarness();
    void h.output.graphicsRuntime.context.destination;
    let interrupt;
    h.elements[0].play.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          interrupt = () =>
            reject(
              Object.assign(new Error("Interrupted by pause"), {
                name: "AbortError",
              }),
            );
        }),
    );
    const closedPreview = h.output.resume();
    h.output.close();
    await h.output.resume();
    interrupt();
    await expect(closedPreview).resolves.toBeUndefined();
    expect(h.elements[0].paused).toBe(false);
    expect(h.sources.at(-1).stop).not.toHaveBeenCalled();
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
