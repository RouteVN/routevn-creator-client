import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const readView = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("asset package view", () => {
  it("parses as YAML", () => {
    for (const path of [
      "../../src/pages/assetPackage/assetPackage.view.yaml",
      "../../src/components/assetPackagePreviewTile/assetPackagePreviewTile.view.yaml",
    ]) {
      expect(() => load(readView(path))).not.toThrow();
    }
  });

  it("lists the picked folders and their dependencies, with a picker for the rest", () => {
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
    // The page lists the picked folders; the picker holds the rest.
    expect(assetPackageView).not.toContain("addResourceTypeButton");
    expect(assetPackageView).not.toContain("rtgl-popover");
    expect(assetPackageView).not.toContain("rtgl-dropdown-menu");
    expect(assetPackageView).toContain(
      "$for section, sectionIndex in pickedSections",
    );
    // Folders are removed in the picker; the page has no remove button.
    expect(assetPackageView).not.toContain("removeFolderButton");
    // Each folder shows all its resources; nothing expands or collapses.
    expect(assetPackageView).not.toContain("ExpandButton");
    expect(assetPackageView).not.toContain("Strip");
    expect(assetPackageView).toContain("$for tile, tileIndex in folder.items");
    // As small tiles, as many to a row as fit.
    expect(assetPackageView).toContain("div.assetPackageFolderGrid");
    expect(assetPackageView).toContain("repeat(auto-fill, 80px)");
    expect(assetPackageView).toContain(
      "rtgl-button#addFoldersButton v=ol pre=plus",
    );
    expect(assetPackageView).toContain(
      "rtgl-dialog#pickerDialog ?open=${isPickerOpen}",
    );
    expect(assetPackageView).toContain("$for type, typeIndex in pickerTypes");
    expect(assetPackageView).toContain(
      "$for folder, folderIndex in pickerSection.folders",
    );
    // The picker's checkbox sits left of the folder, named after it.
    expect(assetPackageView).toContain(
      '?checked=${folder.selected} aria-label="${folder.name}" style="pointer-events: none;"\': null',
    );
    // The whole box ticks a folder; the checkbox only shows it.
    expect(assetPackageView).toContain("handler: handlePickerFolderClick");
    expect(assetPackageView).toContain("handler: handlePickerDoneClick");
    expect(assetPackageView).toContain(
      "rtgl-view#pickerFolder${folderIndex} data-resource-type=",
    );
    expect(assetPackageView).not.toContain("handleFolderCheckboxChange");
    expect(assetPackageView).toContain(
      "rtgl-text s=xs c=pr-fg: ${folder.pickOrder}",
    );
    expect(assetPackageView).toContain(
      "rvn-asset-package-preview-tile :preview=${tile}",
    );
    expect(assetPackageView).toContain(
      "rvn-asset-package-preview-tile :preview=${item.preview}",
    );
    expect(assetPackageView).toContain("$if comesWith.isVisible:");
    // Dependencies show as tiles, as the picks do, with their users on hover.
    expect(assetPackageView).toContain(
      "'rtgl-view w=f title=\"${item.usedBy}\"':",
    );
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
