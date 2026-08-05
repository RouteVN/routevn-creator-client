import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commandLineSoundEffects view", () => {
  it("makes the channel header a full-width pointer target", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineSoundEffects/commandLineSoundEffects.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const channelSelectStart = view.indexOf('  ".sfxChannelSelect":');
    const channelSelectStyles = view.slice(
      channelSelectStart,
      view.indexOf('  ".sfxChannelSelect:hover":', channelSelectStart),
    );

    expect(view).toContain("rtgl-view.sfxChannelHeader w=f:");
    expect(channelSelectStart).toBeGreaterThan(-1);
    expect(channelSelectStyles).toContain("cursor: pointer");
    expect(channelSelectStyles).toContain("width: 100%");
  });
});
