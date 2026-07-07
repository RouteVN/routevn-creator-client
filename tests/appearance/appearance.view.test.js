import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("appearance view", () => {
  it("fills the mobile shell and uses an images-style theme grid", () => {
    const appearanceView = readFileSync(
      new URL(
        "../../src/pages/appearance/appearance.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(appearanceView).toContain(
      'rtgl-view d=h w=f h=f style="min-width: 0; min-height: 0;"',
    );
    expect(appearanceView).toContain(
      'rtgl-grid w=f mt=lg g=md cols="${themeGridColumns}"',
    );
    expect(appearanceView).toContain(
      "aspect-ratio: ${themePreviewAspectRatio};",
    );
    expect(appearanceView).toContain("rtgl-view w=f h=f d=h g=sm");
    expect(appearanceView).toContain("rtgl-view w=3fg h=f br=sm");
    expect(appearanceView).toContain("rtgl-view w=7fg h=f d=v g=sm");
    expect(appearanceView).toContain("rtgl-view w=f h=2fg d=h g=sm");
    expect(appearanceView).not.toContain("display: grid");
    expect(appearanceView).not.toContain("div key=");
    expect(appearanceView).toContain("w=f bw=xs");
    expect(appearanceView).not.toContain("w=320 sm-w=f");
    expect(appearanceView).not.toContain("min-height: 152px");
  });
});
