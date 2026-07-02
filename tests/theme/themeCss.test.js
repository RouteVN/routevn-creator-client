import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("theme css", () => {
  it("uses a subtle neutral browser tap highlight globally", () => {
    const themeCss = readFileSync(
      new URL("../../static/public/theme.css", import.meta.url),
      "utf8",
    );

    expect(themeCss).toContain(
      "-webkit-tap-highlight-color: rgba(255, 255, 255, 0.08);",
    );
    expect(themeCss).toContain("*::before");
    expect(themeCss).toContain("*::after");
  });

  it("uses app scrollbar theme tokens", () => {
    const themeCss = readFileSync(
      new URL("../../static/public/theme.css", import.meta.url),
      "utf8",
    );

    expect(themeCss).toContain("--scrollbar-thumb:");
    expect(themeCss).toContain("--scrollbar-thumb-hover:");
    expect(themeCss).toContain(
      "scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);",
    );
  });
});
