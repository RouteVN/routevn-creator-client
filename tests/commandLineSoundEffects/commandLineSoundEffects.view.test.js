import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commandLineSoundEffects view", () => {
  it("makes the whole channel the editor target", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineSoundEffects/commandLineSoundEffects.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const channelPreviewStart = view.indexOf('  ".sfxChannelPreview":');
    const channelPreviewStyles = view.slice(
      channelPreviewStart,
      view.indexOf(
        '  ".sfxChannelPreview:focus-visible":',
        channelPreviewStart,
      ),
    );

    expect(view).toContain("rtgl-view.sfxChannelHeader d=h w=f:");
    expect(view).toContain(".sfxChannel.sfxChannelPreview");
    expect(view).toContain("role=button");
    expect(channelPreviewStart).toBeGreaterThan(-1);
    expect(channelPreviewStyles).toContain("cursor: pointer");
    expect(view).not.toContain("editChannelButton");
  });
});
