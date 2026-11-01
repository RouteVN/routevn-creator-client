import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readView = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("asset package view", () => {
  it("renders a folder checklist with previews, Comes with, and Export in the header", () => {
    const assetPackageView = readView(
      "../../src/pages/assetPackage/assetPackage.view.yaml",
    );

    expect(assetPackageView).toContain("rvn-resource-types");
    expect(assetPackageView).toContain(
      'rtgl-view h=48 w=f bgc=bg bwb=xs ph=md av=c style="position: sticky; top: 0px; z-index: 1000;"',
    );
    expect(assetPackageView).toContain(
      "rtgl-button#downloadAssetPackageButton v=pr pre=download ?disabled=${exportDisabled}",
    );
    // One checklist: no menu, folder picker or ordering.
    expect(assetPackageView).not.toContain("addResourceTypeButton");
    expect(assetPackageView).not.toContain("rtgl-popover");
    expect(assetPackageView).not.toContain("rtgl-dropdown-menu");
    expect(assetPackageView).toContain(
      "$for section, sectionIndex in sections",
    );
    expect(assetPackageView).toContain(
      "rtgl-checkbox#folderCheckbox${sectionIndex}x${folderIndex}",
    );
    expect(assetPackageView).toContain("handler: handleFolderCheckboxChange");
    expect(assetPackageView).toContain(
      "rtgl-view#folderStrip${sectionIndex}x${folderIndex}",
    );
    expect(assetPackageView).toContain(
      "rtgl-button#folderExpandButton${sectionIndex}x${folderIndex}",
    );
    expect(assetPackageView).toContain(
      "rvn-asset-package-preview-tile :preview=${tile}",
    );
    expect(assetPackageView).toContain(
      "rvn-asset-package-preview-tile :preview=${item.preview}",
    );
    expect(assetPackageView).toContain("$if comesWith.isVisible:");
  });

  it("draws each preview as the resource pages do", () => {
    const tileView = readView(
      "../../src/components/assetPackagePreviewTile/assetPackagePreviewTile.view.yaml",
    );

    expect(tileView).toContain(
      "rvn-file-image w=f h=f fileId=${fileId} originalFileId=${originalFileId} lazy",
    );
    expect(tileView).toContain(
      "rvn-waveform-visualizer waveformDataFileId=${waveformDataFileId}",
    );
    expect(tileView).toContain("rvn-font-preview mode=thumbnail :fontFamily=");
    expect(tileView).toContain(
      "rvn-font-preview mode=thumbnail :fontFamilies=${fontFamilies}",
    );
    expect(tileView).toContain("background-color: ${hex};");
    expect(tileView).toContain("rtgl-svg svg=${icon}");
    // Images sit on the same transparency grid as on the Images page.
    expect(tileView).toContain("div.assetPackageTileTransparencyGrid");
  });
});
