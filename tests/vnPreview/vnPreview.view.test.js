import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("vnPreview view", () => {
  it("rotates only the renderer canvas and leaves its input bridge host untransformed", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/vnPreview/vnPreview.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain('"#canvas > canvas":');
    expect(view).toContain(
      "\"#canvas[data-preview-rotated='true'] > canvas\":",
    );
    expect(view).toContain("transform: rotate(90deg)");
    expect(view).toContain(
      'div#canvas data-preview-rotated=${isRotated} style="${previewCanvasHostStyle}"',
    );
    expect(view).not.toContain(
      'style="${previewFrameStyle}":\n              - div#canvas',
    );
  });
});
