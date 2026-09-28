import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The app needs WebKit 15.4+ (dialog, structuredClone). Older macOS WebKit in
// that range does not support color-mix() until 16.2.
describe("older WebKit CSS compatibility", () => {
  it("keeps color-mix() out of app-owned styles", () => {
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
    const offenders = files.filter((file) =>
      readFileSync(file, "utf8").includes("color-mix("),
    );

    expect(offenders).toEqual([]);
  });
});
