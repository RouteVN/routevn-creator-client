import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("config view", () => {
  it("orders Language, Asset Package, and Appearance with a direct preference control", () => {
    const view = readFileSync(
      new URL("../../src/pages/config/config.view.yaml", import.meta.url),
      "utf8",
    );
    expect(view.indexOf("#languageSection")).toBeLessThan(
      view.indexOf("#assetPackageSection"),
    );
    expect(view.indexOf("#assetPackageSection")).toBeLessThan(
      view.indexOf("#appearanceSection"),
    );
    expect(view).toContain("rtgl-segmented-control#assetPackageToggle");
    expect(view).toContain(":selectedValue=${assetPackageEnabled}");
    expect(view).toContain("handler: handleAssetPackageChange");
  });

  it("fills the mobile shell and uses an images-style theme grid", () => {
    const configView = readFileSync(
      new URL("../../src/pages/config/config.view.yaml", import.meta.url),
      "utf8",
    );

    expect(configView).toContain(
      'rtgl-view d=h w=f h=f style="min-width: 0; min-height: 0;"',
    );
    expect(configView).toContain(
      'rtgl-grid w=f mt=lg g=md cols="${themeGridColumns}"',
    );
    expect(configView).toContain("aspect-ratio: ${themePreviewAspectRatio};");
    expect(configView).toContain("rtgl-view w=f h=f d=h g=sm");
    expect(configView).toContain("rtgl-view w=3fg h=f br=sm");
    expect(configView).toContain("rtgl-view w=7fg h=f d=v g=sm");
    expect(configView).toContain("rtgl-view w=f h=2fg d=h g=sm");
    expect(configView).not.toContain("display: grid");
    expect(configView).not.toContain("div key=");
    expect(configView).toContain("w=f bw=xs");
    expect(configView).not.toContain("w=320 sm-w=f");
    expect(configView).not.toContain("min-height: 152px");
  });
});

describe("config language view", () => {
  it("uses a standalone selector that applies changes directly", () => {
    const languageView = readFileSync(
      new URL("../../src/pages/config/config.view.yaml", import.meta.url),
      "utf8",
    );

    expect(languageView).toContain("rtgl-select#languageSelect");
    expect(languageView).toContain("value-change:");
    expect(languageView).toContain("handler: handleLanguageChange");
    expect(languageView).not.toContain("rtgl-form");
    expect(languageView).not.toContain("save-language");
    expect(languageView).not.toContain("languageLabel");
    expect(languageView).not.toContain("languageDescription");
  });
});
