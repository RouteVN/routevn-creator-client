import { describe, expect, it } from "vitest";
import {
  createProjectResolutionFormValues,
  PROJECT_RESOLUTION_OPTIONS,
  resolveProjectResolution,
  scaleTemplateProjectStateForResolution,
} from "../../src/internal/projectResolution.js";

describe("project resolution presets", () => {
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
});
