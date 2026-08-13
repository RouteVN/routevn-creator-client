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

  it("keeps the edit preview within the form width", () => {
    const fontsView = readFileSync(
      new URL("../../src/pages/fonts/fonts.view.yaml", import.meta.url),
      "utf8",
    );

    expect(fontsView).toContain(
      'rtgl-view#editDialogFontPreview slot="font-slot" w=f bw=xs bc=bo br=md p=md cur=pointer style="min-width: 0; max-width: 100%; box-sizing: border-box; overflow: hidden;"',
    );
    expect(fontsView).toContain(
      'previewText="Aa" fontSize=60 width=f height=120 av=c ah=c',
    );
    expect(fontsView).not.toContain('previewText="Aa" fontSize=60 width=320');
  });

  it("keeps a scroll filler below the desktop font grid", () => {
    const fontsView = readFileSync(
      new URL("../../src/pages/fonts/fonts.view.yaml", import.meta.url),
      "utf8",
    );

    expect(fontsView).toContain("scroll-bottom-padding=32vh");
  });

  it("does not refocus the explorer after detail-panel clicks", () => {
    const fontsView = readFileSync(
      new URL("../../src/pages/fonts/fonts.view.yaml", import.meta.url),
      "utf8",
    );
    const blockStart = fontsView.indexOf("  fileExplorerDetailKeyboardScope:");
    const blockEnd = fontsView.indexOf("  fontDialog:", blockStart);
    const detailKeyboardScopeBlock = fontsView.slice(blockStart, blockEnd);

    expect(detailKeyboardScopeBlock).toContain("keydown:");
    expect(detailKeyboardScopeBlock).not.toContain("click:");
    expect(detailKeyboardScopeBlock).not.toContain(
      "handler: handleFileExplorerKeyboardScopeClick",
    );
  });
});
