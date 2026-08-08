import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync(
  new URL(
    "../../src/components/resource-import-dialog/resource-import-dialog.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

describe("resource-import-dialog.view", () => {
  it("renders preview media in bounded 16:9 frames", () => {
    expect(viewSource).toContain("rvn-resource-import-preview-media");
    expect(viewSource).toContain("w=160 h=90");
    expect(viewSource).toContain("w=240 h=135");
  });

  it("renders read-only animation and transition mask timelines", () => {
    expect(viewSource).toContain("slot=animation-timeline-preview");
    expect(viewSource).toContain("rvn-keyframe-timeline");
    expect(viewSource).toContain("animationTimeline.maskProperties");
  });

  it("opens the project image selector directly from image resource cards", () => {
    expect(viewSource).toContain("slot=image-resources");
    expect(viewSource).toContain("imageCustomizeButton");
    expect(viewSource).toContain("imageUseDefaultButton");
    expect(viewSource).toContain("imageSelectorDialog");
    expect(viewSource).toContain("rvn-image-selector#replacementImageSelector");
    expect(viewSource).toContain("rtgl-button#confirmImageSelection");
    expect(viewSource).toContain("${selectButton}");
    expect(viewSource).toContain("image.replacementImageId");
    expect(viewSource).not.toContain("imageModeControl");
  });
});
