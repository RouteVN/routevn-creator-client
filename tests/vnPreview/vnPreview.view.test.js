import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

describe("vnPreview view", () => {
  it("does not draw decorative borders around the fullscreen canvas", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/vnPreview/vnPreview.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).not.toMatch(/\bbw[trblxy]?=/);
  });

  it("hides the fullscreen surface focus ring while keeping keyboard focus", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/vnPreview/vnPreview.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(load(view).styles["#previewSurface:focus-visible"]).toEqual({
      "--focus-ring-box-shadow": "none",
    });
    expect(view).toContain(
      "rtgl-view#previewSurface pos=fix edge=f tabindex=-1",
    );
  });

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
