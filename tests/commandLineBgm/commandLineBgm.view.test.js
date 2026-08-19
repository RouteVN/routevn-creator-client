import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const readView = () =>
  readFileSync(
    new URL(
      "../../src/components/commandLineBgm/commandLineBgm.view.yaml",
      import.meta.url,
    ),
    "utf8",
  );

describe("commandLineBgm view", () => {
  it("has valid YAML", () => {
    expect(() => yaml.load(readView())).not.toThrow();
  });

  it("uses the Sounds card treatment in a responsive two-column grid", () => {
    const view = readView();

    expect(view).toContain(
      'rtgl-view d=h w=f wrap g=md style="${resourceSelectorGridStyle}"',
    );
    expect(view).toContain("ph=${resourceSelectorHorizontalPadding}");
    expect(view).toContain("data-group-id=${group.id} w=f g=md");
    expect(view).toContain(
      'rtgl-view br=md pos=rel overflow=hidden style="${resourceSelectorCardStyle}"',
    );
    expect(view).not.toContain("resourceSelectorItemStyle");
    expect(view).not.toContain("resourceSelectorCardWidth");
    expect(view).toContain("aspect-ratio: 16 / 9");
    expect(view).toContain(
      "rvn-waveform-visualizer waveformDataFileId=${item.waveformDataFileId} w=f h=f",
    );
    expect(view).toContain("rtgl-view w=f h=f av=c ah=c bgc=mu-fg");
    expect(view).toContain("rtgl-view w=f p=md");
    expect(view).not.toContain("rtgl-view p=md g=md br=md");
    expect(view).not.toContain(
      "waveformDataFileId=${item.waveformDataFileId} w=200 h=120",
    );
  });
});
