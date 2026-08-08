import { describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleVideoCanPlay,
} from "../../src/components/resource-import-preview-media/resource-import-preview-media.handlers.js";

const createVideo = () => ({
  defaultMuted: false,
  muted: false,
  play: vi.fn(() => Promise.resolve()),
});

describe("resource-import-preview-media.handlers", () => {
  it("starts the video muted after mount", () => {
    const video = createVideo();
    handleAfterMount({ refs: { video } });

    expect(video.defaultMuted).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it("retries muted playback when the video can play", () => {
    const video = createVideo();
    handleVideoCanPlay({}, { _event: { currentTarget: video } });

    expect(video.muted).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(1);
  });
});
