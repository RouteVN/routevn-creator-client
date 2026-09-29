import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { numericLightnessPattern } from "../support/legacyWebKitCss.js";

const files = execFileSync(
  "git",
  [
    "ls-files",
    "src/*.js",
    "src/*.yaml",
    "static/public/*.css",
    "static/public/*.js",
    ":!static/public/@rettangoli",
  ],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

// The app needs WebKit 15.4+ (dialog, structuredClone). Older macOS WebKit in
// that range does not support color-mix() until 16.2.
describe("older WebKit CSS compatibility", () => {
  it("keeps color-mix() out of app-owned styles", () => {
    const offenders = files.filter((file) =>
      readFileSync(file, "utf8").includes("color-mix("),
    );

    expect(offenders).toEqual([]);
  });

  it("uses percentage OKLCH and OKLab lightness for WebKit 15.4–16.1", () => {
    const offenders = files.filter((file) =>
      readFileSync(file, "utf8").match(numericLightnessPattern),
    );

    expect(offenders).toEqual([]);
  });

  it.each([
    "oklch(0.3 0 0)",
    "OKLCH(0.5 0 0)",
    "oklab(0.5 0 0)",
    "oklch(5e-1 0 0)",
    "OkLaB(+5E-1 0 0)",
    "oklch(.5 0 0)",
    "oklab(-0.5 0 0)",
    "oklch(\n1\t0 0)",
  ])("detects and invalidates numeric lightness in %s", (colour) => {
    expect(colour.match(numericLightnessPattern)).toHaveLength(1);
    expect(colour.replace(numericLightnessPattern, "unsupported-color(")).toBe(
      colour.replace(/^\w+\(/, "unsupported-color("),
    );
  });

  it.each(["oklch(50% 0 0)", "OKLAB(+5E1% 0 0)", "oklch(.5% 0 0)"])(
    "preserves percentage lightness in %s",
    (colour) => {
      expect(colour.match(numericLightnessPattern)).toBeNull();
      expect(
        colour.replace(numericLightnessPattern, "unsupported-color("),
      ).toBe(colour);
    },
  );

  it("handles multiple colours without retaining matcher state", () => {
    const colours = "OKLCH(0.5 0 0) oklab(5e-1 0 0) oklch(50% 0 0)";
    for (let i = 0; i < 2; i++) {
      expect(colours.match(numericLightnessPattern)).toHaveLength(2);
      expect(
        colours.replace(numericLightnessPattern, "unsupported-color("),
      ).toBe(
        "unsupported-color(0.5 0 0) unsupported-color(5e-1 0 0) oklch(50% 0 0)",
      );
    }
  });
});
