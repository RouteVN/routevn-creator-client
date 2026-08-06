import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commandLineVisual view", () => {
  it("uses the same accessible transform summary card as Background", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineVisual/commandLineVisual.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

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
