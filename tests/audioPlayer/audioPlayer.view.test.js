import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("audio player view", () => {
  it("keeps desktop playback controls centered after the title", () => {
    const audioPlayerView = readFileSync(
      new URL(
        "../../src/components/audioPlayer/audioPlayer.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const mobileBranchStart = audioPlayerView.indexOf("$if mobileLayout");
    const desktopBranchStart = audioPlayerView.indexOf(
      "\n                $else:",
      mobileBranchStart,
    );
    const desktopBranch = audioPlayerView.slice(desktopBranchStart);

    expect(desktopBranchStart).toBeGreaterThan(-1);
    expect(desktopBranch).toContain("rtgl-text w=250 ellipsis=true");
    expect(desktopBranch).toContain("rtgl-view d=h av=c g=lg w=1fg ah=c");
    expect(desktopBranch).toContain("rtgl-view#playPauseBtn cur=pointer");
    expect(desktopBranch).toContain(
      "rtgl-view#playerCloser w=24 h=24 av=c ah=c cur=pointer",
    );
    expect(desktopBranch.indexOf("rtgl-view#playPauseBtn")).toBeLessThan(
      desktopBranch.indexOf("${currentTimeFormatted}"),
    );
  });

  it("keeps long titles from overlapping mobile playback controls", () => {
    const audioPlayerView = readFileSync(
      new URL(
        "../../src/components/audioPlayer/audioPlayer.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const mobileBranchStart = audioPlayerView.indexOf("$if mobileLayout");
    const desktopBranchStart = audioPlayerView.indexOf(
      "\n                $else:",
      mobileBranchStart,
    );
    const mobileBranch = audioPlayerView.slice(
      mobileBranchStart,
      desktopBranchStart,
    );

    expect(desktopBranchStart).toBeGreaterThan(-1);
    expect(mobileBranch).toContain(
      'rtgl-text w=1fg ellipsis=true style="min-width: 0;"',
    );
    expect(mobileBranch).toContain(
      'rtgl-view d=h av=c g=md ah=c style="flex: 0 0 auto;"',
    );
    expect(mobileBranch).toContain(
      'rtgl-view d=h av=c g=xs ah=e style="width: 96px; flex: 0 0 96px; white-space: nowrap; font-variant-numeric: tabular-nums;"',
    );
    expect(mobileBranch).toContain(
      'rtgl-view#playerCloser w=32 h=32 av=c ah=c cur=pointer style="flex: 0 0 32px;"',
    );

    expect(mobileBranch.indexOf("${currentTimeFormatted}")).toBeLessThan(
      mobileBranch.indexOf("rtgl-view#playPauseBtn"),
    );
  });
});
