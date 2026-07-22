import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRouteGraphicsTextPreviewCacheKey,
  createRouteGraphicsTextPreviewState,
  getParentElementAcrossShadowRoot,
} from "../../src/internal/routeGraphicsTextPreview.js";

describe("Route Graphics text preview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a render state that passes the text style to Route Graphics", () => {
    const preview = {
      content: "Preview",
      padding: 8,
      textStyle: {
        fill: "#ffffff",
        fontFamily: "font-file",
        fontSize: 32,
        fontStyle: "italic",
        strokeColor: "transparent",
        strokeWidth: 0,
        shadow: {
          color: "#000000",
          alpha: 0.75,
          blur: 4,
          offsetX: 2,
          offsetY: 3,
        },
      },
    };

    const state = createRouteGraphicsTextPreviewState({
      preview,
      width: 320,
      height: 180,
    });

    expect(state.elements[0]).toMatchObject({
      id: "font-preview-text",
      type: "text",
      content: "Preview",
      x: 8,
      y: 8,
      textStyle: preview.textStyle,
    });
    expect(state.animations).toEqual([]);
    expect(state.audio).toEqual([]);
    expect(state.audioEffects).toEqual([]);
  });

  it("centers font samples with Route Graphics anchors", () => {
    const state = createRouteGraphicsTextPreviewState({
      preview: {
        content: "Aa",
        horizontalAlignment: "c",
        verticalAlignment: "c",
        textStyle: { align: "left" },
      },
      width: 320,
      height: 120,
    });

    expect(state.elements[0]).toMatchObject({
      x: 160,
      y: 60,
      anchorX: 0.5,
      anchorY: 0.5,
    });
    expect(state.elements[0]).not.toHaveProperty("width");
  });

  it("includes dimensions and style data in the thumbnail cache key", () => {
    const base = {
      preview: { content: "Aa", textStyle: { fontStyle: "normal" } },
      width: 200,
      height: 100,
      backgroundColor: "#000000",
    };

    expect(createRouteGraphicsTextPreviewCacheKey(base)).not.toBe(
      createRouteGraphicsTextPreviewCacheKey({
        ...base,
        preview: {
          ...base.preview,
          textStyle: { fontStyle: "italic" },
        },
      }),
    );
    expect(createRouteGraphicsTextPreviewCacheKey(base)).not.toBe(
      createRouteGraphicsTextPreviewCacheKey({ ...base, width: 320 }),
    );
  });

  it("crosses Shadow DOM boundaries when resolving the preview background", () => {
    class TestShadowRoot {
      constructor(host) {
        this.host = host;
      }
    }

    vi.stubGlobal("ShadowRoot", TestShadowRoot);
    const themeSurface = { id: "theme-surface" };
    const shadowRoot = new TestShadowRoot(themeSurface);
    const previewElement = {
      parentElement: undefined,
      getRootNode: () => shadowRoot,
    };

    expect(getParentElementAcrossShadowRoot(previewElement)).toBe(themeSurface);
  });
});
