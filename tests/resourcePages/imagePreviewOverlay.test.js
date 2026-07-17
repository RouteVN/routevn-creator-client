import { describe, expect, it } from "vitest";
import {
  IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
  IMAGE_PREVIEW_DISPLAY_MODE_FIT,
  createImagePreviewFrameStyle,
  createImagePreviewLayoutStyle,
  createImagePreviewTopBarStyle,
  createImagePreviewImageWrapperStyle,
  createImagePreviewModeButtonViewData,
  createImagePreviewOverlayViewData,
  resolveImagePreviewDisplayMode,
  resolveImagePreviewNavigationDirection,
} from "../../src/internal/ui/resourcePages/imagePreviewOverlay.js";

const createKeyEvent = (key, overrides = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...overrides,
});

describe("imagePreviewOverlay", () => {
  it("centers the preview frame in the usable app viewport", () => {
    const projectResolution = {
      width: 1920,
      height: 1080,
    };
    const style = createImagePreviewLayoutStyle(projectResolution);
    const frameStyle = createImagePreviewFrameStyle(projectResolution);

    expect(style).toContain(
      "width: min(88vw, calc((var(--rvn-app-viewport-height, 100vh) - 120px) * (1920 / 1080)))",
    );
    expect(frameStyle).toContain(
      "max-height: calc(var(--rvn-app-viewport-height, 100vh) - 120px)",
    );
    expect(style).toContain(
      "top: calc(var(--rvn-window-content-offset, 0px) + (var(--rvn-app-viewport-height, 100vh) / 2))",
    );
    expect(style).toContain("transform: translate(-50%, -50%)");
  });

  it("positions the centered top bar above the preview frame", () => {
    const style = createImagePreviewTopBarStyle();

    expect(style).toContain("position: absolute");
    expect(style).toContain("bottom: calc(100% + 8px)");
    expect(style).toContain("display: grid");
    expect(style).toContain(
      "grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)",
    );
    expect(style).toContain("align-items: center");
  });

  it("builds canvas-scale wrapper styles for images with dimensions", () => {
    const style = createImagePreviewImageWrapperStyle({
      image: {
        width: 48,
        height: 48,
      },
      displayMode: IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
      projectResolution: {
        width: 1920,
        height: 1080,
      },
    });

    expect(style).toContain("width: 2.5%");
    expect(style).toContain("height: 4.444444444444445%");
  });

  it("uses full-frame wrapper styles for fit mode and missing dimensions", () => {
    expect(
      createImagePreviewImageWrapperStyle({
        image: {
          width: 48,
          height: 48,
        },
        displayMode: IMAGE_PREVIEW_DISPLAY_MODE_FIT,
        projectResolution: {
          width: 1920,
          height: 1080,
        },
      }),
    ).toBe("position: absolute; inset: 0;");

    expect(
      createImagePreviewImageWrapperStyle({
        image: {},
        displayMode: IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
        projectResolution: {
          width: 1920,
          height: 1080,
        },
      }),
    ).toBe("position: absolute; inset: 0;");
  });

  it("builds overlay view data with mode button and adjacent item state", () => {
    const viewData = createImagePreviewOverlayViewData({
      state: {
        fullImagePreviewVisible: true,
        fullImagePreviewFileId: "file-1",
        fullImagePreviewDisplayMode: IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
      },
      image: {
        width: 48,
        height: 48,
      },
      projectResolution: {
        width: 1920,
        height: 1080,
      },
      previousItemId: "image-0",
      nextItemId: "image-2",
      breadcrumb: "Backgrounds > School",
      copy: {
        previewCanvasModeLabel: "Canvas scale",
        previewFitModeLabel: "Fit to frame",
        previewPreviousLabel: "Previous",
        previewNextLabel: "Next",
      },
    });

    expect(viewData.fullImagePreviewVisible).toBe(true);
    expect(viewData.fullImagePreviewFrameStyle).toContain(
      "aspect-ratio: 1920 / 1080",
    );
    expect(viewData.fullImagePreviewCanvasModeButton.selected).toBe(true);
    expect(viewData.fullImagePreviewFitModeButton.selected).toBe(false);
    expect(viewData.fullImagePreviewPreviousVisible).toBe(true);
    expect(viewData.fullImagePreviewNextVisible).toBe(true);
    expect(viewData.fullImagePreviewBreadcrumb).toBe("Backgrounds > School");
    expect(viewData.fullImagePreviewCanvasModeLabel).toBe("Canvas scale");
  });

  it("resolves shared keyboard navigation shortcuts", () => {
    expect(
      resolveImagePreviewNavigationDirection(createKeyEvent("ArrowDown")),
    ).toEqual({
      direction: "next",
    });
    expect(
      resolveImagePreviewNavigationDirection(createKeyEvent("ArrowUp")),
    ).toEqual({
      direction: "previous",
    });
    expect(
      resolveImagePreviewNavigationDirection(
        createKeyEvent("d", {
          ctrlKey: true,
        }),
      ),
    ).toEqual({
      direction: "next",
      distance: 10,
      clamp: true,
    });
    expect(resolveImagePreviewNavigationDirection(createKeyEvent("j"))).toEqual(
      {
        direction: "next",
      },
    );
    expect(
      resolveImagePreviewNavigationDirection(
        createKeyEvent("j", {
          metaKey: true,
        }),
      ),
    ).toBeUndefined();
  });

  it("resolves shared display mode shortcuts", () => {
    expect(resolveImagePreviewDisplayMode(createKeyEvent("ArrowLeft"))).toBe(
      IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
    );
    expect(resolveImagePreviewDisplayMode(createKeyEvent("ArrowRight"))).toBe(
      IMAGE_PREVIEW_DISPLAY_MODE_FIT,
    );
    expect(resolveImagePreviewDisplayMode(createKeyEvent("h"))).toBe(
      IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
    );
    expect(resolveImagePreviewDisplayMode(createKeyEvent("l"))).toBe(
      IMAGE_PREVIEW_DISPLAY_MODE_FIT,
    );
    expect(
      resolveImagePreviewDisplayMode(
        createKeyEvent("l", {
          ctrlKey: true,
        }),
      ),
    ).toBeUndefined();
  });

  it("marks the selected mode button", () => {
    expect(
      createImagePreviewModeButtonViewData({
        displayMode: IMAGE_PREVIEW_DISPLAY_MODE_FIT,
        mode: IMAGE_PREVIEW_DISPLAY_MODE_FIT,
      }),
    ).toMatchObject({
      backgroundColor: "ac",
      borderColor: "ac",
      iconColor: "white",
      selected: true,
    });
  });
});
