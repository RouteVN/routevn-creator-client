import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareIOSVideoForThumbnail } from "../../src/deps/clients/ios/videoFrames.js";

const createVideo = () => {
  const video = {
    readyState: 1,
    paused: true,
    play: vi.fn(async () => {
      video.readyState = 4;
      video.paused = false;
    }),
    pause: vi.fn(() => {
      video.paused = true;
    }),
  };
  return video;
};

afterEach(() => vi.useRealTimers());

describe("iOS thumbnail frame preparation", () => {
  it("starts decoding metadata-only media and pauses before sampling", async () => {
    const video = createVideo();
    await prepareIOSVideoForThumbnail(video);
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.readyState).toBe(4);
    expect(video.paused).toBe(true);
  });

  it("leaves already decoded frames alone", async () => {
    const video = createVideo();
    video.readyState = 2;
    await prepareIOSVideoForThumbnail(video);
    expect(video.play).not.toHaveBeenCalled();
  });

  it("reports decoding rejection and keeps the video paused", async () => {
    const video = createVideo();
    video.play.mockRejectedValueOnce(new Error("Decoder unavailable"));
    await expect(prepareIOSVideoForThumbnail(video)).rejects.toThrow(
      "Decoder unavailable",
    );
    expect(video.paused).toBe(true);
  });

  it("times out a stalled decoder and pauses a late playback completion", async () => {
    vi.useFakeTimers();
    const video = createVideo();
    const pending = Promise.withResolvers();
    video.play.mockImplementationOnce(async () => {
      await pending.promise;
      video.paused = false;
    });
    const prepare = prepareIOSVideoForThumbnail(video);
    const rejected = expect(prepare).rejects.toThrow(
      "Timed out preparing video thumbnail frames",
    );
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(video.paused).toBe(true);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(video.paused).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
