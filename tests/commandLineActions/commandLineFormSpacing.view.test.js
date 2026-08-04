import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentsDirectory = new URL("../../src/components/", import.meta.url);
const bottomSpacer =
  'rtgl-view h=240 aria-hidden=true style="flex: 0 0 240px;"';

describe("command-line form spacing", () => {
  it("adds explicit bottom scroll space to every command-line dialog form", () => {
    const componentDirectories = readdirSync(componentsDirectory, {
      withFileTypes: true,
    }).filter(
      (entry) => entry.isDirectory() && entry.name.startsWith("commandLine"),
    );

    let dialogFormCount = 0;
    let bottomSpacerCount = 0;

    for (const componentDirectory of componentDirectories) {
      const viewUrl = new URL(
        `${componentDirectory.name}/${componentDirectory.name}.view.yaml`,
        componentsDirectory,
      );
      const view = readFileSync(viewUrl, "utf8");
      const formLines = view
        .split("\n")
        .filter((line) => line.includes("- rtgl-form"));

      dialogFormCount += formLines.filter(
        (line) => !line.includes("slot=content"),
      ).length;
      bottomSpacerCount += view.split(bottomSpacer).length - 1;

      expect(view).not.toContain("mb=120");
    }

    expect(dialogFormCount).toBeGreaterThan(0);
    expect(bottomSpacerCount).toBe(dialogFormCount);
  });
});
