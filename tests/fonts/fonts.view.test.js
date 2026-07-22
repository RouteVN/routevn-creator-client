import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fonts view", () => {
  it("renders one fixed glyph grid in the preview dialog", () => {
    const fontsView = readFileSync(
      new URL("../../src/pages/fonts/fonts.view.yaml", import.meta.url),
      "utf8",
    );

    expect(fontsView).not.toContain("modalPreviewRows");
    expect(fontsView.match(/\$for glyph in/g)).toEqual(["$for glyph in"]);
    expect(fontsView).toContain("$for glyph in modalGlyphList");
  });

  it("passes the edit-preview font family as a property binding", () => {
    const fontsView = readFileSync(
      new URL("../../src/pages/fonts/fonts.view.yaml", import.meta.url),
      "utf8",
    );

    expect(fontsView).toContain(":fontFamily=${editPreviewFontFamily}");
    expect(fontsView).not.toContain(" fontFamily=${editPreviewFontFamily}");
  });
});
