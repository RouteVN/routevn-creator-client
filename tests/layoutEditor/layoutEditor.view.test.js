import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("layoutEditor.view", () => {
  it("opts into file explorer background deselection", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(layoutEditorView).toContain("selection-cleared:");
    expect(layoutEditorView).toContain("handler: handleFileExplorerItemClick");
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
