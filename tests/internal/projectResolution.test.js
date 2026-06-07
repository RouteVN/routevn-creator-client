import { describe, expect, it } from "vitest";
import {
  createProjectResolutionFormValues,
  PROJECT_RESOLUTION_OPTIONS,
  resolveProjectResolution,
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
});
