import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commandLineVisual view", () => {
  it("keeps the custom transform Edit button inside its horizontal row", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineVisual/commandLineVisual.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const lines = view.split("\n");
    const rowIndex = lines.findIndex((line) =>
      line.includes("- rtgl-view d=h av=c w=f g=md:"),
    );
    const buttonIndex = lines.findIndex((line) =>
      line.includes("- rtgl-button#customTransformButton${groupIndex}"),
    );
    expect(rowIndex).toBeGreaterThan(-1);
    expect(buttonIndex).toBeGreaterThan(rowIndex);

    const rowIndent = lines[rowIndex].match(/^\s*/)[0].length;
    const buttonIndent = lines[buttonIndex].match(/^\s*/)[0].length;
    expect(buttonIndent).toBe(rowIndent + 4);
  });
});
