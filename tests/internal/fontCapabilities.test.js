import { describe, expect, it } from "vitest";
import {
  extractFontWeightCapabilities,
  inspectNewFontFile,
  isFontWeightSupported,
} from "../../src/internal/fontCapabilities.js";
import {
  createTestFontBytes,
  createTestFontFile,
} from "../support/fontFixtures.js";

describe("font capabilities", () => {
  it("uses the OS/2 weight class as the only static-font weight", () => {
    const capabilities = extractFontWeightCapabilities(
      createTestFontBytes({ weight: 600 }),
    );

    expect(capabilities).toEqual({
      kind: "static",
      defaultWeight: 600,
      minWeight: 600,
      maxWeight: 600,
    });
    expect(isFontWeightSupported(capabilities, "600")).toBe(true);
    expect(isFontWeightSupported(capabilities, "700")).toBe(false);
    expect(isFontWeightSupported({ kind: "unavailable" }, "600")).toBe(false);
  });

  it("uses the actual wght axis range for variable fonts", () => {
    const capabilities = extractFontWeightCapabilities(
      createTestFontBytes({
        weight: 400,
        variableRange: {
          minWeight: 250,
          defaultWeight: 400,
          maxWeight: 725,
        },
      }),
    );

    expect(capabilities).toEqual({
      kind: "variable",
      defaultWeight: 400,
      minWeight: 250,
      maxWeight: 725,
    });
    expect(isFontWeightSupported(capabilities, 250)).toBe(true);
    expect(isFontWeightSupported(capabilities, 725)).toBe(true);
    expect(isFontWeightSupported(capabilities, 249)).toBe(false);
    expect(isFontWeightSupported(capabilities, 726)).toBe(false);
  });

  it("accepts OTF sfnt files", async () => {
    const file = createTestFontFile({
      name: "test-font.otf",
      type: "font/otf",
      signature: "OTTO",
      weight: 500,
    });

    await expect(inspectNewFontFile(file)).resolves.toMatchObject({
      kind: "static",
      defaultWeight: 500,
    });
  });

  it("rejects legacy web-font uploads and malformed font data", async () => {
    await expect(
      inspectNewFontFile(
        new File([createTestFontBytes()], "legacy.woff2", {
          type: "font/woff2",
        }),
      ),
    ).rejects.toMatchObject({ code: "unsupported_font_format" });

    await expect(
      inspectNewFontFile(
        new File(["not a font"], "broken.ttf", { type: "font/ttf" }),
      ),
    ).rejects.toMatchObject({ code: "unsupported_font_format" });
  });
});
