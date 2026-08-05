import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentsDirectory = new URL("../../src/components/", import.meta.url);
const bottomSpacer =
  'rtgl-view h=240 aria-hidden=true style="flex: 0 0 240px;"';

describe("command-line form spacing", () => {
  it("lets command-line components own their dialog padding", () => {
    const componentDirectories = readdirSync(componentsDirectory, {
      withFileTypes: true,
    }).filter(
      (entry) => entry.isDirectory() && entry.name.startsWith("commandLine"),
    );

    let dialogFormCount = 0;
    let breadcrumbCount = 0;

    for (const componentDirectory of componentDirectories) {
      const viewUrl = new URL(
        `${componentDirectory.name}/${componentDirectory.name}.view.yaml`,
        componentsDirectory,
      );
      const view = readFileSync(viewUrl, "utf8");
      const lines = view.split("\n");
      const formLines = lines.filter(
        (line) =>
          line.includes("- rtgl-form") && !line.includes("slot=content"),
      );

      expect(view).toContain("pv=lg");
      expect(view).not.toMatch(/rtgl-view[^\n]*w=f h=f p=lg/);
      for (const formLine of formLines) {
        expect(formLine).toContain("p=lg");
      }

      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].includes("rtgl-breadcrumb")) {
          continue;
        }

        breadcrumbCount += 1;
        const breadcrumbIndent = lines[index].search(/\S/);
        const containerLine = lines
          .slice(0, index)
          .findLast(
            (line) =>
              line.search(/\S/) === breadcrumbIndent - 4 &&
              line.includes("- rtgl-view"),
          );
        expect(containerLine).toContain("ph=lg");
      }

      dialogFormCount += formLines.length;
    }

    expect(dialogFormCount).toBeGreaterThan(0);
    expect(breadcrumbCount).toBeGreaterThan(0);
  });

  it("adds explicit bottom scroll space to every command-line dialog form", () => {
    const componentDirectories = readdirSync(componentsDirectory, {
      withFileTypes: true,
    }).filter(
      (entry) => entry.isDirectory() && entry.name.startsWith("commandLine"),
    );

    let dialogFormCount = 0;

    for (const componentDirectory of componentDirectories) {
      const viewUrl = new URL(
        `${componentDirectory.name}/${componentDirectory.name}.view.yaml`,
        componentsDirectory,
      );
      const view = readFileSync(viewUrl, "utf8");
      const formLines = view
        .split("\n")
        .filter((line) => line.includes("- rtgl-form"));

      const componentDialogFormCount = formLines.filter(
        (line) => !line.includes("slot=content"),
      ).length;
      const componentBottomSpacerCount = view.split(bottomSpacer).length - 1;

      dialogFormCount += componentDialogFormCount;
      expect(componentBottomSpacerCount).toBeGreaterThanOrEqual(
        componentDialogFormCount,
      );

      expect(view).not.toContain("mb=120");
    }

    expect(dialogFormCount).toBeGreaterThan(0);
  });
});
