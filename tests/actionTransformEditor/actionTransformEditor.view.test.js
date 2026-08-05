import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("actionTransformEditor view", () => {
  it("leaves canvas pointer interaction to the graphics selection chrome", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/actionTransformEditor/actionTransformEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(
      "rvn-scene-editor-preview-canvas#actionTransformCanvasHost",
    );
    expect(view).not.toContain("backgroundDragSurface");
    expect(view).not.toContain("handler: handleBackgroundPointerDown");
  });
});
