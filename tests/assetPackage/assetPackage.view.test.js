import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("asset package view", () => {
  it("renders release actions in the page header and confirmed resource sections", () => {
    const assetPackageView = readFileSync(
      new URL(
        "../../src/pages/assetPackage/assetPackage.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(assetPackageView).toContain("rvn-resource-types");
    expect(assetPackageView).toContain("rtgl-view#packageMetadataDetail");
    expect(assetPackageView).toContain("packageMetadataEditDialog");
    expect(assetPackageView).toContain("packageMetadataEditForm");
    expect(assetPackageView).toContain(
      "rtgl-text s=sm c=mu-fg: ${packageMetadataSummary}",
    );
    expect(assetPackageView).not.toContain(
      "rtgl-view#packageMetadataDetail bw=xs",
    );
    expect(assetPackageView).toContain(
      'rtgl-view h=48 w=f bgc=bg bwb=xs ph=md av=c style="position: sticky; top: 0px; z-index: 1000;"',
    );
    expect(assetPackageView).toContain(
      "rtgl-text w=1fg: ${i18n.assetPackagePage.title}",
    );
    expect(assetPackageView).toContain(
      "rtgl-button#addResourceTypeButton v=pr pre=plus",
    );
    expect(assetPackageView).toContain(
      "rtgl-button#downloadAssetPackageButton v=pr pre=download",
    );
    expect(assetPackageView).not.toContain("addResourceTypeButton s=sm");
    expect(assetPackageView).not.toContain("downloadAssetPackageButton s=sm");
    expect(
      assetPackageView.indexOf("rtgl-button#addResourceTypeButton"),
    ).toBeLessThan(
      assetPackageView.indexOf(
        "$for section, sectionIndex in selectedResourceSections",
      ),
    );
    expect(assetPackageView).toContain(
      "rtgl-dropdown-menu#resourceTypeMenu :items=${resourceTypeMenuItems}",
    );
    expect(assetPackageView).toContain(
      "$for section, sectionIndex in selectedResourceSections",
    );
    expect(assetPackageView).toContain(
      "rtgl-button#editResourceFoldersButton${sectionIndex}",
    );
    expect(assetPackageView).toContain(
      "rtgl-text#resourceTypeHeading${sectionIndex}",
    );
    expect(assetPackageView).toContain(
      "rtgl-view d=h av=c w=1fg h=32 ph=sm br=sm h-bgc=mu",
    );
    expect(assetPackageView).not.toContain("cur=context-menu");
    expect(assetPackageView).toContain(
      "handler: handleResourceTypeHeadingContextMenu",
    );
    expect(assetPackageView).toContain(
      "rtgl-dropdown-menu#resourceTypeContextMenu :items=${resourceTypeContextMenu.items}",
    );
    expect(assetPackageView).toContain(
      'data-resource-type="${section.resourceType}"',
    );
    expect(assetPackageView).toContain(
      "$for folder, folderIndex in section.selectedFolders",
    );
    expect(assetPackageView).toContain(
      "rtgl-text s=sm ta=s w=1fg: ${folder.label}",
    );
    expect(assetPackageView).toContain(
      "rtgl-text s=sm c=mu-fg: ${folder.selectionOrder}",
    );
    expect(assetPackageView).toContain("rtgl-svg svg=folder wh=16 c=mu-fg");
    expect(assetPackageView).toContain("rtgl-popover#resourceFolderPicker");
    expect(assetPackageView).not.toContain("${folderPickerTitle}");
    expect(assetPackageView).toContain("$for folder, i in folderOptions");
    expect(assetPackageView).toContain("rtgl-button#resourceFolderOption${i}");
    expect(assetPackageView).toContain("rtgl-button#confirmResourceFolders");
  });
});
