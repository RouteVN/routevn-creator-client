import { describe, expect, it } from "vitest";
import { sanitizeArtifactFileName } from "../../src/internal/artifactFileName.js";

describe("artifact file names", () => {
  it("replaces path separators and cross-platform invalid characters", () => {
    expect(sanitizeArtifactFileName('Story: Part/Two\\Final?*"')).toBe(
      "Story- Part-Two-Final---",
    );
  });

  it("removes trailing dots and protects Windows reserved names", () => {
    expect(sanitizeArtifactFileName("Project...   ")).toBe("Project");
    expect(sanitizeArtifactFileName("CON")).toBe("_CON");
    expect(sanitizeArtifactFileName("...", { fallback: "project" })).toBe(
      "project",
    );
  });
});
