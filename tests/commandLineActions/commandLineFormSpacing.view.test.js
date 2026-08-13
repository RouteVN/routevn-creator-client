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
          line.includes("rtgl-form") && !line.includes("slot=content"),
      );

      if (view.includes("rtgl-breadcrumb")) {
        expect(view).toContain("pv=md");
        expect(view).not.toContain("pv=lg");
      } else {
        expect(view).toContain("pv=lg");
      }
      expect(view).not.toMatch(/rtgl-view[^\n]*w=f h=f p=lg/);
      for (let index = 0; index < lines.length; index += 1) {
        const formLine = lines[index];
        if (
          !formLine.includes("rtgl-form") ||
          formLine.includes("slot=content")
        ) {
          continue;
        }

        const ancestorLines = [];
        let ancestorIndent = formLine.search(/\S/);
        for (let ancestorIndex = index - 1; ancestorIndex >= 0; ancestorIndex -= 1) {
          const ancestorLine = lines[ancestorIndex];
          const currentIndent = ancestorLine.search(/\S/);
          if (currentIndent < 0 || currentIndent >= ancestorIndent) {
            continue;
          }

          ancestorLines.push(ancestorLine);
          ancestorIndent = currentIndent;
        }

        if (ancestorLines.some((line) => line.includes("ph=md"))) {
          expect(formLine).toContain("ph=none");
        } else {
          expect(formLine).toContain("ph=md");
        }
        expect(formLine).toContain("pv=none");
        expect(formLine).not.toContain("p=none");
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
        expect(containerLine.trim()).toBe(
          "- rtgl-view w=f h=24 av=c ph=md mb=md:",
        );
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
