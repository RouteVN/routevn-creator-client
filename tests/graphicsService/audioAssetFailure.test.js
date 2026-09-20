import { afterEach, expect, it, vi } from "vitest";

vi.mock("route-graphics", () => ({
  default: vi.fn(),
  AudioAsset: {},
  Assets: {},
  createAssetBufferManager: vi.fn(),
}));

import { AudioAsset } from "route-graphics";
import "../../src/deps/services/graphicsService.js";

afterEach(async () => {
  await AudioAsset.reset();
  vi.unstubAllGlobals();
});

it("propagates the failing audio file ID and decoder cause, and allows a later retry", async () => {
  const cause = new Error("Invalid audio bytes");
  const decoded = { duration: 1 };
  const decodeAudioData = vi
    .fn()
    .mockRejectedValueOnce(cause)
    .mockResolvedValueOnce(decoded);
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      decodeAudioData = decodeAudioData;
      close = vi.fn(async () => {});
    },
  );
  await expect(
    AudioAsset.load("sound-file", new ArrayBuffer(8)),
  ).rejects.toMatchObject({
    fileId: "sound-file",
    cause,
  });
  expect(AudioAsset.getAsset("sound-file")).toBeUndefined();
  await expect(AudioAsset.load("sound-file", new ArrayBuffer(8))).resolves.toBe(
    decoded,
  );
});
