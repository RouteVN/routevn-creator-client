import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readView = () =>
  readFileSync(
    new URL(
      "../../src/components/commandLineVisual/commandLineVisual.view.yaml",
      import.meta.url,
    ),
    "utf8",
  );

describe("commandLineVisual view", () => {
  it("borders every visual card and selector item, whatever its resource type", () => {
    const view = readView();

    expect(view).toContain(
      "rtgl-view#visualImage${visual.controlId} data-index=${visual.visualIndex} cur=pointer bw=xs bc=bo h-bc=ac",
    );
    expect(view).toContain(
      "rtgl-view#resourceItem${i}x${j} data-resource-id=${item.id} data-resource-type=${item.resourceType} cur=pointer bw=xs bc=${item.itemBorderColor} h-bc=${item.itemHoverBorderColor}",
    );
  });

  it("changes only the border colour of visual cards and selector items on hover", () => {
    const cardLines = readView()
      .split("\n")
      .filter(
        (line) =>
          line.includes("rtgl-view#visualImage") ||
          line.includes("rtgl-view#resourceItem"),
      );

    expect(cardLines).toHaveLength(2);
    for (const line of cardLines) {
      expect(line).toContain("h-bc=");
      expect(line).not.toContain("h-bgc=");
    }
  });

  it("uses the same accessible transform summary card as Background", () => {
    const view = readView();

    expect(view).toContain("customTransformButton*:");
    expect(view).toContain("handler: handleCustomTransformButtonClick");
    expect(view).toContain("handler: handleCustomTransformButtonKeyDown");
    expect(view).toContain(
      'rtgl-view#customTransformButton${visual.controlId} slot=${visual.customTransformFormSlot} data-index=${visual.visualIndex} data-target-name="${visual.displayName}" role=button tabindex=0 aria-label="${transformEditorTitle}"',
    );
    expect(view).toContain("rtgl-grid cols=2 g=md w=f:");
    expect(view).toContain("$for item, j in visual.customTransformDetails:");
    expect(view).not.toContain("backgroundTransformEditor");
  });
});
