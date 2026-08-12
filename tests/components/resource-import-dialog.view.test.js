import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync(
  new URL(
    "../../src/components/resource-import-dialog/resource-import-dialog.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

describe("resource-import-dialog.view", () => {
  it("links the source description to the asset store", () => {
    expect(viewSource).toContain("slot=source-description");
    expect(viewSource).toContain("rtgl-text#assetStoreLink");
    expect(viewSource).toContain("href=${assetStoreUrl}");
    expect(viewSource).toContain("new-tab");
  });

  it("renders preview media in bounded 16:9 frames", () => {
    expect(viewSource).toContain("rvn-resource-import-preview-media");
    expect(viewSource).toContain("w=160 h=90");
    expect(viewSource).toContain("sourceFileId=${resource.previewSourceId}");
    expect(viewSource).toContain("?lazy=true");
  });

  it("uses the whole resource card as the selection control", () => {
    expect(viewSource).toContain("slot=selection-controls");
    expect(viewSource).toContain("rtgl-view slot=resource-selection-grid");
    expect(viewSource).toContain("rtgl-grid cols=3 xl-cols=2 md-cols=1");
    expect(viewSource).toContain(
      "$for section, sectionIndex in resourceSections",
    );
    expect(viewSource).toContain("${section.typeLabel}");
    expect(viewSource).toContain("group.kind == 'folder'");
    expect(viewSource).toContain("svg=folder");
    expect(viewSource).toContain("${group.name}");
    expect(viewSource).toContain("selectionToggleAllButton");
    expect(viewSource).toContain("${selectionToggleAllLabel}");
    expect(viewSource).toContain("rtgl-view#resourceSelectionCard");
    expect(viewSource).toContain("role=button tabindex=0");
    expect(viewSource).toContain('aria-pressed="${resource.selected}"');
    expect(viewSource).not.toContain("selectionLocked");
    expect(viewSource).not.toContain("aria-disabled");
    expect(viewSource).toContain("${resource.selectionStatus}");
    expect(viewSource).toContain("${resource.typeLabel}");
    expect(viewSource).toContain("bgc=bg");
    expect(viewSource).toContain("bc=${resource.selectionBorderColor}");
    expect(viewSource).toContain("h-bc=${resource.selectionHoverBorderColor}");
    expect(viewSource).not.toContain("selectionBackgroundColor");
    expect(viewSource).not.toContain("rtgl-checkbox");
    expect(viewSource).toContain("rtgl-view w=160 h=90 av=c ah=c br=md bgc=mu");
    expect(viewSource).not.toContain("resource.previewUrl");
    expect(viewSource).not.toContain("${knownDownloadBytes}");
    expect(viewSource).not.toContain("${bytesLabel}");
    expect(viewSource).not.toContain(
      'w=160 h=90 overflow=hidden bw=xs bc=bo br=md bgc=mu style="flex: 0 0 160px; box-sizing: border-box;"',
    );
  });

  it("does not render per-resource confirmation steps", () => {
    expect(viewSource).not.toContain("currentResource");
    expect(viewSource).not.toContain("animation-timeline-preview");
    expect(viewSource).not.toContain("rvn-keyframe-timeline");
  });
});
