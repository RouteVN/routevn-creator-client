import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readView = (path) =>
  readFileSync(new URL(`../../src/pages/${path}`, import.meta.url), "utf8");

const extractMobilePreview = (view) => {
  const previewStart = view.indexOf("$when: fullImagePreviewVisible");
  const mobileStart = view.indexOf("$if mobileLayout:", previewStart);
  const desktopStart = view.indexOf("$else:", mobileStart);

  return view.slice(mobileStart, desktopStart);
};

describe("mobile full image preview", () => {
  it("uses the same viewport-fitted layout for images and character sprites", () => {
    const imagesPreview = extractMobilePreview(
      readView("images/images.view.yaml"),
    );
    const spritesPreview = extractMobilePreview(
      readView("characterSprites/characterSprites.view.yaml"),
    );

    expect(imagesPreview).toBe(spritesPreview);
    expect(imagesPreview).toContain(
      "rtgl-view pos=fix edge=f ah=c av=c z=3001",
    );
  });

  it("shows the folder and item name before right-aligned mode controls", () => {
    const mobilePreview = extractMobilePreview(
      readView("images/images.view.yaml"),
    );
    const breadcrumbIndex = mobilePreview.indexOf(
      "${fullImagePreviewBreadcrumb}",
    );
    const controlsIndex = mobilePreview.indexOf(
      "rtgl-view#previewModeControls",
    );

    expect(breadcrumbIndex).toBeGreaterThan(-1);
    expect(controlsIndex).toBeGreaterThan(breadcrumbIndex);
    expect(mobilePreview).toContain("rtgl-text#previewBreadcrumb w=1fg");
    expect(mobilePreview).toContain("flex: 0 0 auto");
    expect(mobilePreview).not.toContain("left: 50%");
    expect(mobilePreview).not.toContain("translateX(-50%)");
  });
});
