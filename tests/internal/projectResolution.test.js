import { describe, expect, it } from "vitest";
import {
  createProjectResolutionFormValues,
  formatCanvasMaxWidth,
  formatHalfViewportCanvasMaxWidth,
  getProjectOrientation,
  PROJECT_RESOLUTION_OPTIONS,
  resolveProjectResolution,
  scaleTemplateProjectStateForResolution,
} from "../../src/internal/projectResolution.js";

describe("project orientation", () => {
  it.each([
    [1920, 1080, "landscape"],
    [1080, 1920, "portrait"],
    [512, 512, "landscape"],
  ])("derives orientation from %s × %s", (width, height, orientation) => {
    expect(getProjectOrientation({ width, height })).toBe(orientation);
  });

  it("refuses a missing project resolution", () => {
    expect(() => getProjectOrientation()).toThrow("Project resolution");
  });
});

describe("project resolution presets", () => {
  it("limits a canvas to half the viewport height for its aspect ratio", () => {
    expect(
      formatHalfViewportCanvasMaxWidth({ width: 1920, height: 1080 }),
    ).toBe("min(100%, 88.8889vh)");
    expect(
      formatHalfViewportCanvasMaxWidth({ width: 1080, height: 1920 }),
    ).toBe("min(100%, 28.125vh)");
  });

  it("limits a canvas to any share of a container height in the requested unit", () => {
    expect(
      formatCanvasMaxWidth(
        { width: 1920, height: 1080 },
        { heightUnit: "cqh", heightPercent: 92 },
      ),
    ).toBe("min(100%, 163.5556cqh)");
    expect(formatCanvasMaxWidth({ width: 1080, height: 1920 })).toBe(
      "min(100%, 28.125vh)",
    );
  });

  it("includes a portrait 1080p option", () => {
    expect(PROJECT_RESOLUTION_OPTIONS).toContainEqual({
      value: "1080x1920",
      label: "1080x1920",
    });
  });

  it("resolves the portrait preset dimensions", () => {
    expect(createProjectResolutionFormValues("1080x1920")).toEqual({
      resolution: "1080x1920",
      resolutionWidth: 1080,
      resolutionHeight: 1920,
    });
    expect(resolveProjectResolution({ preset: "1080x1920" })).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it("scales text-style shadow geometry with project resolution", () => {
    const scaledState = scaleTemplateProjectStateForResolution(
      {
        project: {
          resolution: { width: 1920, height: 1080 },
        },
        textStyles: {
          items: {
            "style-1": {
              id: "style-1",
              type: "textStyle",
              fontSize: 32,
              shadow: {
                colorId: "shadow",
                alpha: 0.75,
                blur: 6,
                offsetX: -2,
                offsetY: 4,
              },
            },
          },
        },
      },
      { width: 960, height: 540 },
    );

    expect(scaledState.textStyles.items["style-1"]).toMatchObject({
      fontSize: 16,
      shadow: {
        colorId: "shadow",
        alpha: 0.75,
        blur: 3,
        offsetX: -1,
        offsetY: 2,
      },
    });
  });
  it("scales a line visual's own layout with project resolution", () => {
    const sprite = {
      type: "sprite",
      x: 960,
      y: 540,
      anchorX: 0.5,
      anchorY: 0.5,
      width: 960,
      height: 213,
      imageId: "image-1",
    };
    const scaledState = scaleTemplateProjectStateForResolution(
      {
        project: {
          resolution: { width: 1920, height: 1080 },
        },
        scenes: {
          items: {
            "scene-1": {
              id: "scene-1",
              type: "scene",
              sections: {
                items: {
                  "section-1": {
                    id: "section-1",
                    lines: {
                      items: {
                        "line-1": {
                          id: "line-1",
                          actions: {
                            visual: {
                              items: [
                                {
                                  id: "visual-1",
                                  layer: 50,
                                  layout: {
                                    layoutSchemaVersion: 2,
                                    elements: {
                                      items: { "element-1": sprite },
                                      tree: [{ id: "element-1" }],
                                    },
                                  },
                                },
                                { id: "visual-2", resourceId: "image-1" },
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      { width: 1280, height: 720 },
    );

    const [ownLayout, resourceVisual] =
      scaledState.scenes.items["scene-1"].sections.items["section-1"].lines
        .items["line-1"].actions.visual.items;
    expect(ownLayout.layout).toEqual({
      layoutSchemaVersion: 2,
      elements: {
        items: {
          "element-1": {
            ...sprite,
            x: 640,
            y: 360,
            width: 640,
            height: 142,
          },
        },
        tree: [{ id: "element-1" }],
      },
    });
    expect(resourceVisual).toEqual({ id: "visual-2", resourceId: "image-1" });
  });
});
