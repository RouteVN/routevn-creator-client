import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("audio player view", () => {
  it("keeps long titles from overlapping playback controls", () => {
    const audioPlayerView = readFileSync(
      new URL(
        "../../src/components/audioPlayer/audioPlayer.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(audioPlayerView).toContain(
      'rtgl-text w=1fg ellipsis=true style="min-width: 0;"',
    );
    expect(audioPlayerView).toContain(
      'rtgl-view d=h av=c g=md ah=c style="flex: 0 0 auto;"',
    );
    expect(audioPlayerView).toContain(
      'rtgl-view d=h av=c g=xs ah=e style="width: 96px; flex: 0 0 96px; white-space: nowrap; font-variant-numeric: tabular-nums;"',
    );
    expect(audioPlayerView).toContain(
      'rtgl-view#playerCloser w=32 h=32 av=c ah=c cur=pointer style="flex: 0 0 32px;"',
    );

    expect(audioPlayerView.indexOf("${currentTimeFormatted}")).toBeLessThan(
      audioPlayerView.indexOf("rtgl-view#playPauseBtn"),
    );
  });
});
