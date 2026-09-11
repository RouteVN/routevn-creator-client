import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeAudioBuffer } from "../../src/deps/clients/audioDecoder.js";
import { extractWaveformDataFromArrayBuffer } from "../../src/deps/clients/web/fileProcessors.js";
import { createAudioService } from "../../src/deps/services/audioService.js";

const readTone = (codec) => {
  const bytes = readFileSync(
    new URL(`../fixtures/audio/tone-${codec}.ogg`, import.meta.url),
  );
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
};

const createBuffer = (numberOfChannels, length, sampleRate) => {
  const channels = Array.from(
    { length: numberOfChannels },
    () => new Float32Array(length),
  );
  return {
    numberOfChannels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (index) => channels[index],
  };
};

describe("audio decoder", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses native decoding when supported and preserves the source bytes", async () => {
    const arrayBuffer = readTone("vorbis");
    const audioBuffer = { duration: 2 };
    const audioContext = {
      decodeAudioData: vi.fn(async (input) => {
        structuredClone(input, { transfer: [input] });
        return audioBuffer;
      }),
      createBuffer: vi.fn(),
    };

    expect(await decodeAudioBuffer({ audioContext, arrayBuffer })).toBe(
      audioBuffer,
    );
    expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    expect(audioContext.createBuffer).not.toHaveBeenCalled();
  });

  it.each(["vorbis", "opus"])(
    "decodes real OGG %s after native rejection/detachment, without MIME metadata",
    async (codec) => {
      const arrayBuffer = readTone(codec);
      const audioContext = {
        decodeAudioData: vi.fn(async (input) => {
          structuredClone(input, { transfer: [input] });
          throw new Error("Decoding failed");
        }),
        createBuffer,
      };

      const buffer = await decodeAudioBuffer({ audioContext, arrayBuffer });

      expect(buffer.duration).toBeCloseTo(2, 1);
      expect(buffer.sampleRate).toBe(48000);
      expect(buffer.numberOfChannels).toBe(2);
      expect(buffer.getChannelData(0).some((value) => value > 0.01)).toBe(true);
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    },
  );

  it("keeps the native error for unsupported or unrecognized data", async () => {
    const error = new Error("Invalid audio");
    const audioContext = {
      decodeAudioData: vi.fn().mockRejectedValue(error),
      createBuffer: vi.fn(),
    };

    await expect(
      decodeAudioBuffer({ audioContext, arrayBuffer: new ArrayBuffer(8) }),
    ).rejects.toBe(error);
    expect(audioContext.createBuffer).not.toHaveBeenCalled();
  });

  it("rejects an OGG file with headers but no audio samples", async () => {
    const audioContext = {
      decodeAudioData: vi.fn().mockRejectedValue(new Error("Decoding failed")),
      createBuffer: vi.fn(),
    };

    await expect(
      decodeAudioBuffer({
        audioContext,
        arrayBuffer: readTone("vorbis").slice(0, 100),
      }),
    ).rejects.toThrow();
    expect(audioContext.createBuffer).not.toHaveBeenCalled();
  });

  it.each(["vorbis", "opus"])(
    "uses the fallback for %s upload waveforms and the sound preview player",
    async (codec) => {
      const contexts = [];
      class AudioContext {
        state = "running";
        currentTime = 0;
        decodeAudioData = vi
          .fn()
          .mockRejectedValue(new Error("Decoding failed"));
        createBuffer = createBuffer;
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
        constructor() {
          contexts.push(this);
        }
      }
      vi.stubGlobal("window", { AudioContext });
      const arrayBuffer = readTone(codec);

      const waveform = await extractWaveformDataFromArrayBuffer(arrayBuffer);
      expect(waveform.duration).toBe(2);
      expect(waveform.amplitudes).toHaveLength(1000);
      expect(waveform.amplitudes.every(Number.isFinite)).toBe(true);
      expect(Math.max(...waveform.amplitudes)).toBe(1);
      expect(contexts[0].close).toHaveBeenCalledOnce();

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, arrayBuffer: async () => arrayBuffer })),
      );
      const service = createAudioService();
      const release = service.acquire();
      try {
        expect(await service.loadAudio("blob:audio-1")).toEqual({
          duration: 2,
        });
        await service.play();
        const source = contexts[1].createBufferSource.mock.results[0].value;
        expect(source.buffer.numberOfChannels).toBe(2);
        expect(source.buffer.getChannelData(0).some((v) => v > 0.01)).toBe(
          true,
        );
        expect(source.start).toHaveBeenCalledWith(0, 0);
        service.stop();
        expect(source.stop).toHaveBeenCalledOnce();
        expect(service.isPlaying()).toBe(false);
      } finally {
        release();
      }
      expect(contexts[1].close).toHaveBeenCalledOnce();
    },
  );
});
