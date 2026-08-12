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
  it("uses a fixed-top mobile layout with bounded form content", () => {
    expect(viewSource).toContain(
      'rtgl-dialog#dialog ?open=${open} s=lg md-layout=fixed-top aria-label="${dialogAriaLabel}"',
    );
    expect(viewSource).toContain(
      "rtgl-view slot=content d=v w=f h=f g=md overflow=hidden",
    );
    expect(viewSource).toContain(
      "rtgl-form#workflowForm key=${formKey} :defaultValues=${defaultValues} :form=${form} :context=${formContext} w=f h=f",
    );
  });

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
    expect(viewSource).toContain(
      "rtgl-view#resourceSelectionGrid slot=resource-selection-grid",
    );
    expect(viewSource).toContain("rtgl-grid cols=3 xl-cols=2 md-cols=1");
    expect(viewSource).toContain("$for section in resourceSections");
    expect(viewSource).toContain("$for group in section.groups");
    expect(viewSource).toContain("$for resource in group.resources");
    expect(viewSource).toContain("${section.typeLabel}");
    expect(viewSource).toContain("group.kind == 'folder'");
    expect(viewSource).toContain("svg=folder");
    expect(viewSource).toContain("${group.name}");
    expect(viewSource).toContain("selectionToggleAllButton");
    expect(viewSource).toContain("${selectionToggleAllLabel}");
    expect(viewSource).toContain("resourceSelectionGrid:");
    expect(viewSource).not.toContain("resourceSelectionCard*:");
    expect(viewSource).toContain(
      "rtgl-view#resourceSelectionCard${resource.planResourceIndex}",
    );
    expect(viewSource).not.toContain(
      "resourceSelectionCard${resource.planResourceIndex}${resource.selected}",
    );
    expect(viewSource).toContain("role=button tabindex=0");
    expect(viewSource).toContain(
      "data-resource-index=${resource.planResourceIndex}",
    );
    expect(viewSource).toContain(
      'data-resource-source-id="${resource.sourceId}"',
    );
    expect(viewSource).toContain('aria-pressed="${resource.selected}"');
    expect(viewSource).not.toContain("selectionLocked");
    expect(viewSource).not.toContain("aria-disabled");
    expect(viewSource).toContain("${resource.selectionStatus}");
    expect(viewSource).toContain("${resource.typeLabel}");
    expect(viewSource).toContain("bgc=bg");
    expect(viewSource).toContain("bc=${resource.selectionBorderColor}");
    expect(viewSource).toContain("h-bc=${resource.selectionHoverBorderColor}");
    expect(viewSource).toContain(
      'style="padding-left: ${group.indent}px; box-sizing: border-box;"',
    );
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
