import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("layoutEditor.view", () => {
  it("uses platform-controlled safe-area variables for the mobile node explorer shell", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(layoutEditorView).toContain(
      "padding-top: var(--rvn-mobile-safe-area-inset-top, 0px)",
    );
    expect(layoutEditorView).toContain(
      "padding-bottom: var(--rvn-mobile-safe-area-inset-bottom, 0px)",
    );
    expect(layoutEditorView).not.toContain("env(safe-area-inset-top)");
    expect(layoutEditorView).not.toContain("env(safe-area-inset-bottom)");
  });

  it("keeps the mobile preview mounted while node detail is visible", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const previewPanelStart = layoutEditorView.indexOf(
      "previewPanelVisibilityStyle",
    );
    const mobileDetailStart = layoutEditorView.indexOf(
      "$if showMobileSelectedNodeDetail",
      previewPanelStart,
    );
    const detailPanelStart = layoutEditorView.indexOf(
      "$if showDetailPanel",
      mobileDetailStart,
    );
    const mobileCenterBranch = layoutEditorView.slice(
      previewPanelStart,
      detailPanelStart,
    );
    const previewToDetailBoundary = layoutEditorView.slice(
      mobileDetailStart,
      detailPanelStart,
    );

    expect(previewPanelStart).toBeLessThan(mobileDetailStart);
    expect(previewToDetailBoundary).not.toContain(
      "rvn-layout-editor-preview#layoutEditorPreview",
    );
    expect(mobileCenterBranch).toContain("previewPanelVisibilityStyle");
    expect(mobileCenterBranch).toContain(
      ":initialPreviewData=${previewHydrationData}",
    );
    expect(mobileCenterBranch).toContain(
      "rvn-layout-editor-preview#layoutEditorPreview",
    );
  });
});
