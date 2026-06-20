import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("scenes view", () => {
  it("aligns mobile hamburger controls with the top-right minimap", () => {
    const scenesView = readFileSync(
      new URL("../../src/pages/scenes/scenes.view.yaml", import.meta.url),
      "utf8",
    );

    expect(scenesView).toContain('style="left: 16px; top: 20px;"');
    expect(scenesView).not.toContain("env(safe-area-inset-top)");
  });
});
