import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUNDLED_PROJECT_TEMPLATE_COVER_URL } from "../../src/internal/projectTemplates.js";

// The cover is served from `static/` at the URL the app shows it by.
const cover = readFileSync(
  new URL(`../../static${BUNDLED_PROJECT_TEMPLATE_COVER_URL}`, import.meta.url),
);

// A lossy WebP's size, from its VP8 frame header.
const readWebpSize = (bytes) => {
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
  expect(bytes.toString("ascii", 12, 16)).toBe("VP8 ");
  return {
    width: bytes.readUInt16LE(26) & 0x3fff,
    height: bytes.readUInt16LE(28) & 0x3fff,
  };
};

describe("default template cover", () => {
  it("is a small 16:9 WebP beside the bundled template", () => {
    expect(BUNDLED_PROJECT_TEMPLATE_COVER_URL).toBe(
      "/templates/default/cover.webp",
    );
    expect(readWebpSize(cover)).toEqual({ width: 960, height: 540 });
    expect(cover.length).toBeLessThan(50 * 1024);
  });
});
