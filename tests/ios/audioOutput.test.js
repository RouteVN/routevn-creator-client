import { afterEach, describe, expect, it, vi } from "vitest";
import { createIOSAudioOutput } from "../../src/deps/clients/ios/audioOutput.js";
import { createMobileAudioRuntime } from "../../src/deps/clients/mobileAudioRuntime.js";
import { createAudioService } from "../../src/deps/services/audioService.js";

const createHarness = () => {
  vi.useFakeTimers();
  const calls = [];
  const elements = [];
  const outputs = [];
  const sources = [];
  let elapsed = 0;
  let startedAt = Date.now();
  const context = Object.assign(new EventTarget(), {
    state: "running",
    destination: {},
    close: vi.fn(async () => {
      context.state = "closed";
    }),
    resume: vi.fn(async () => {
      startedAt = Date.now();
      context.state = "running";
      context.dispatchEvent(new Event("statechange"));
    }),
    suspend: vi.fn(async () => {
      calls.push("context.suspend");
      if (context.state === "running") elapsed += Date.now() - startedAt;
      context.state = "suspended";
      context.dispatchEvent(new Event("statechange"));
    }),
    decodeAudioData: vi.fn(async () => ({ duration: 90 })),
    createGain: vi.fn(() => ({ connect: vi.fn(), gain: { value: 1 } })),
    createBufferSource: vi.fn(() => {
      const source = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(() => calls.push("source.start")),
        stop: vi.fn(() => calls.push("source.stop")),
      };
      sources.push(source);
      return source;
    }),
    createMediaStreamDestination: vi.fn(() => {
      const track = { stop: vi.fn() };
      const output = {
        stream: { getTracks: () => [track] },
        disconnect: vi.fn(),
      };
      outputs.push(output);
      return output;
    }),
  });
  Object.defineProperty(context, "currentTime", {
    get: () =>
      (elapsed + (context.state === "running" ? Date.now() - startedAt : 0)) /
      1000,
  });
  const documentTarget = Object.assign(new EventTarget(), {
    hidden: false,
    body: { append: vi.fn() },
    createElement: vi.fn(() => {
      const element = {
        paused: true,
        play: vi.fn(async () => {
          calls.push("media.play");
          element.paused = false;
        }),
        pause: vi.fn(() => {
          calls.push("media.pause");
          element.paused = true;
        }),
        remove: vi.fn(),
      };
      elements.push(element);
      return element;
    }),
  });
  const windowTarget = {
    AudioContext: function AudioContext() {
      return context;
    },
    performance: { now: () => Date.now() },
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  const runtime = createMobileAudioRuntime({ windowTarget, documentTarget });
  const setHidden = (hidden) => {
    documentTarget.hidden = hidden;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
  };
  vi.stubGlobal("window", windowTarget);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
  const nativeResume = context.resume;
  const nativeClose = context.close;
  const service = createAudioService({
    createAudioContext: runtime.createAudioContext,
    createAudioOutput: (ctx) =>
      createIOSAudioOutput(ctx, {
        documentTarget,
        subscribeActivity: runtime.subscribeActivity,
      }),
  });
  const release = service.acquire();
  return {
    service,
    nativeResume,
    nativeClose,
    release,
    context,
    calls,
    sources,
    elements,
    outputs,
    windowTarget,
    setHidden,
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("iOS media output lifecycle", () => {
  it.each([
    [0, 30],
    [70, 10],
  ])(
    "keeps the seek target from %s to %s while media output resumes",
    async (from, target) => {
      const h = createHarness();
      try {
        await h.service.loadAudio("blob:sound-one");
        await h.service.play(from);
        const pending = Promise.withResolvers();
        h.elements[0].play.mockReturnValueOnce(pending.promise);
        const updates = [];
        h.service.on("timeupdate", (time) => updates.push(time));

        const seeking = h.service.seek(target);
        expect(h.sources[0].onended).toBeNull();
        await vi.advanceTimersByTimeAsync(250);
        expect(h.service.getCurrentTime()).toBe(target);
        expect(updates).toEqual([target]);

        pending.resolve();
        await seeking;
        expect(h.sources.at(-1).start).toHaveBeenCalledWith(0, target);
        await vi.advanceTimersByTimeAsync(100);
        expect(h.service.getCurrentTime()).toBeCloseTo(target + 0.1);
        expect(updates.every((time) => time >= target)).toBe(true);
      } finally {
        h.release();
      }
    },
  );

  it("keeps the latest position when an older seek finishes late", async () => {
    const h = createHarness();
    try {
      await h.service.loadAudio("blob:sound-one");
      await h.service.play();
      const first = Promise.withResolvers();
      const second = Promise.withResolvers();
      h.elements[0].play
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      const oldSeek = h.service.seek(30);
      const newSeek = h.service.seek(60);
      second.resolve();
      await newSeek;
      await vi.advanceTimersByTimeAsync(100);
      first.resolve();
      await oldSeek;
      expect(h.sources).toHaveLength(2);
      expect(h.sources.at(-1).start).toHaveBeenCalledWith(0, 60);
      expect(h.service.getCurrentTime()).toBeCloseTo(60.1);
    } finally {
      h.release();
    }
  });

  it.each(["pause", "stop", "close"])(
    "does not restart a pending seek after %s",
    async (action) => {
      const h = createHarness();
      try {
        await h.service.loadAudio("blob:sound-one");
        await h.service.play();
        const pending = Promise.withResolvers();
        h.elements[0].play.mockReturnValueOnce(pending.promise);
        const seeking = h.service.seek(30);
        if (action === "close") h.release();
        else h.service[action]();
        pending.resolve();
        await seeking;
        await vi.advanceTimersByTimeAsync(500);
        expect(h.sources).toHaveLength(1);
        expect(h.elements[0].paused).toBe(true);
        expect(h.service.isPlaying()).toBe(false);
        expect(h.service.getCurrentTime()).toBe(action === "pause" ? 30 : 0);
      } finally {
        h.release();
      }
    },
  );

  it("routes audio through media and pauses it before stopping the source", async () => {
    const h = createHarness();
    try {
      await h.service.loadAudio("blob:sound-one");
      await h.service.play();
      const element = h.elements[0];
      expect(
        h.context.createGain.mock.results[0].value.connect,
      ).toHaveBeenCalledWith(h.outputs[0]);
      expect(element.srcObject).toBe(h.outputs[0].stream);
      expect(element.paused).toBe(false);

      h.calls.length = 0;
      h.service.pause();
      expect(h.calls).toEqual(["media.pause", "source.stop"]);
      expect(element.paused).toBe(true);
      expect(h.service.isPlaying()).toBe(false);

      await h.service.play();
      await h.service.seek(30);
      expect(h.sources.at(-1).start).toHaveBeenCalledWith(0, 30);
      expect(h.elements).toHaveLength(1);
      expect(element.paused).toBe(false);

      h.calls.length = 0;
      h.service.stop();
      expect(h.calls).toEqual(["media.pause", "source.stop"]);
      expect(element.paused).toBe(true);
      expect(h.service.getCurrentTime()).toBe(0);
    } finally {
      h.release();
    }
  });

  it("stops the media transport at natural end and during a track replacement", async () => {
    const h = createHarness();
    try {
      await h.service.loadAudio("blob:sound-one");
      await h.service.play();
      h.sources[0].onended();
      expect(h.elements[0].paused).toBe(true);
      expect(h.service.isPlaying()).toBe(false);

      await h.service.play();
      await h.service.loadAudio("blob:sound-two");
      expect(h.elements[0].paused).toBe(true);
      await h.service.play();
      expect(h.elements[0].paused).toBe(false);
    } finally {
      h.release();
    }
  });

  it("releases the element and stream only after the last player closes", async () => {
    const h = createHarness();
    const releaseReplacement = h.service.acquire();
    await h.service.loadAudio("blob:sound-one");
    await h.service.play();
    h.release();
    expect(h.elements[0].remove).not.toHaveBeenCalled();
    releaseReplacement();
    expect(h.elements[0].paused).toBe(true);
    expect(h.elements[0].srcObject).toBeNull();
    expect(h.elements[0].remove).toHaveBeenCalledOnce();
    expect(h.outputs[0].stream.getTracks()[0].stop).toHaveBeenCalledOnce();
    expect(h.nativeClose).toHaveBeenCalledOnce();
    releaseReplacement();
    expect(h.elements[0].remove).toHaveBeenCalledOnce();
  });

  it.each(["pause", "stop", "close"])(
    "does not restart audio when pending media playback resolves after %s",
    async (action) => {
      const h = createHarness();
      try {
        await h.service.loadAudio("blob:sound-one");
        const pending = Promise.withResolvers();
        h.elements[0].play.mockImplementationOnce(async () => {
          await pending.promise;
          h.elements[0].paused = false;
        });
        const play = h.service.play();
        if (action === "close") h.release();
        else h.service[action]();
        pending.resolve();
        await play;
        expect(h.elements[0].paused).toBe(true);
        expect(h.sources).toHaveLength(0);
        expect(h.service.isPlaying()).toBe(false);
      } finally {
        h.release();
      }
    },
  );

  it("reports a media playback failure without starting a silent source", async () => {
    const h = createHarness();
    try {
      await h.service.loadAudio("blob:sound-one");
      const error = new Error("Media output rejected");
      h.elements[0].play.mockRejectedValueOnce(error);
      const onError = vi.fn();
      h.service.on("error", onError);
      await h.service.play();
      expect(onError).toHaveBeenCalledWith(error);
      expect(h.sources).toHaveLength(0);
      expect(h.service.isPlaying()).toBe(false);
      expect(h.elements[0].paused).toBe(true);
    } finally {
      h.release();
    }
  });

  it("silences output before background suspension and preserves the playback position", async () => {
    const h = createHarness();
    try {
      await h.service.loadAudio("blob:sound-one");
      await h.service.play();
      await vi.advanceTimersByTimeAsync(500);
      h.calls.length = 0;
      h.windowTarget.routeVNSetAppActive(false);
      h.setHidden(true);
      expect(h.calls).toEqual(["media.pause", "context.suspend"]);
      await vi.advanceTimersByTimeAsync(5000);
      expect(h.elements[0].paused).toBe(true);
      expect(h.service.getCurrentTime()).toBe(0.5);

      h.windowTarget.routeVNSetAppActive(true);
      expect(h.elements[0].paused).toBe(true);
      h.setHidden(false);
      await vi.advanceTimersByTimeAsync(500);
      expect(h.elements[0].paused).toBe(false);
      expect(h.service.getCurrentTime()).toBe(1);
      expect(h.sources).toHaveLength(1);
    } finally {
      h.release();
    }
  });

  it.each(["pause", "stop", "close"])(
    "does not resume a track %s cancelled in the background",
    async (action) => {
      const h = createHarness();
      try {
        await h.service.loadAudio("blob:sound-one");
        await h.service.play();
        h.setHidden(true);
        if (action === "close") h.release();
        else h.service[action]();
        h.setHidden(false);
        await vi.advanceTimersByTimeAsync(500);
        expect(h.elements[0].paused).toBe(true);
        expect(h.service.isPlaying()).toBe(false);
      } finally {
        h.release();
      }
    },
  );

  it("keeps a late media play completion silent until foregrounding", async () => {
    const h = createHarness();
    try {
      await h.service.loadAudio("blob:sound-one");
      const pending = Promise.withResolvers();
      h.elements[0].play.mockImplementationOnce(async () => {
        await pending.promise;
        h.elements[0].paused = false;
      });
      const play = h.service.play();
      h.setHidden(true);
      pending.resolve();
      await play;
      expect(h.elements[0].paused).toBe(true);
      expect(h.context.state).toBe("suspended");
      h.setHidden(false);
      await vi.advanceTimersByTimeAsync(100);
      expect(h.elements[0].paused).toBe(false);
    } finally {
      h.release();
    }
  });

  it("starts media and context resume together within the unlock gesture", async () => {
    const h = createHarness();
    try {
      h.context.state = "suspended";
      const pending = Promise.withResolvers();
      h.nativeResume.mockReturnValueOnce(pending.promise);
      const unlock = h.service.unlock();
      expect(h.nativeResume).toHaveBeenCalledOnce();
      expect(h.elements[0].play).toHaveBeenCalledOnce();
      pending.resolve();
      await unlock;
    } finally {
      h.release();
    }
  });
});
