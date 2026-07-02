import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("variables.view", () => {
  it("preserves desktop bottom scroll room while mobile uses the component default", () => {
    const variablesView = readFileSync(
      new URL("../../src/pages/variables/variables.view.yaml", import.meta.url),
      "utf8",
    );
    const lines = variablesView.split("\n");
    const mobileGroupViewLine = lines.find(
      (line) =>
        line.includes("rvn-group-variables-view#groupview") &&
        line.includes("show-menu-button"),
    );
    const desktopGroupViewLine = lines.find(
      (line) =>
        line.includes("rvn-group-variables-view#groupview") &&
        !line.includes("show-menu-button"),
    );

    expect(mobileGroupViewLine).toContain(":mobileLayout=${mobileLayout}");
    expect(mobileGroupViewLine).not.toContain("scroll-bottom-padding=33vh");
    expect(desktopGroupViewLine).toContain("scroll-bottom-padding=33vh");
  });
});
