import { describe, expect, it } from "vitest";
import { formatFileSize } from "../../src/internal/files.js";

describe("files", () => {
  it("returns an empty string for missing or invalid sizes", () => {
    expect(formatFileSize(undefined)).toBe("");
    expect(formatFileSize(null)).toBe("");
    expect(formatFileSize(-1)).toBe("");
    expect(formatFileSize("not-a-number")).toBe("");
  });

  it("formats zero-byte and positive sizes", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1024)).toBe("1 KB");
  });
});
