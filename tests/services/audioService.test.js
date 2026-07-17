import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioService } from "../../src/deps/services/audioService.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

const createAudioContextHarness = () => {
  const contexts = [];

  class MockAudioContext {
    constructor() {
      this.currentTime = 0;
      this.destination = {};
      this.state = "running";
      this.close = vi.fn(() => {
        this.state = "closed";
        return Promise.resolve();
      });
      this.createGain = vi.fn(() => ({
        connect: vi.fn(),
        gain: { value: 1 },
      }));
      this.createBufferSource = vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }));
      this.decodeAudioData = vi.fn(async () => ({ duration: 2 }));
      contexts.push(this);
    }
  }

  return { contexts, MockAudioContext };
};

const createAudioResponse = (buffer = new ArrayBuffer(8)) => ({
  ok: true,
  arrayBuffer: vi.fn(async () => buffer),
});

describe("audio service", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    vi.restoreAllMocks();
  });

  it("keeps the shared context alive while a replacement player owns it", async () => {
    const { contexts, MockAudioContext } = createAudioContextHarness();
    globalThis.window = { AudioContext: MockAudioContext };
    globalThis.fetch = vi.fn(async () => createAudioResponse());
    const audioService = createAudioService();

    const releaseOldPlayer = audioService.acquire();
    const releaseNewPlayer = audioService.acquire();
    releaseOldPlayer();

    await expect(audioService.loadAudio("blob:audio-1")).resolves.toEqual({
      duration: 2,
    });
    await audioService.play();

    expect(contexts).toHaveLength(1);
    expect(contexts[0].close).not.toHaveBeenCalled();
    expect(contexts[0].createBufferSource).toHaveBeenCalledOnce();

    releaseNewPlayer();
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });

  it("ignores a superseded audio load", async () => {
    const { MockAudioContext } = createAudioContextHarness();
    globalThis.window = { AudioContext: MockAudioContext };
    const responses = new Map();
    globalThis.fetch = vi.fn(
      (url) =>
        new Promise((resolve) => {
          responses.set(url, resolve);
        }),
    );
    const audioService = createAudioService();
    const releasePlayer = audioService.acquire();

    const firstLoad = audioService.loadAudio("blob:first");
    const secondLoad = audioService.loadAudio("blob:second");
    responses.get("blob:second")(createAudioResponse());
    await expect(secondLoad).resolves.toEqual({ duration: 2 });
    responses.get("blob:first")(createAudioResponse());
    await expect(firstLoad).resolves.toBeUndefined();

    releasePlayer();
  });
});
