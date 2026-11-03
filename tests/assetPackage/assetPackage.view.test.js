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
    // The only menu is a type heading's, which moves the type.
    expect(assetPackageView.match(/rtgl-dropdown-menu/g)).toHaveLength(1);
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
      "rtgl-button#pickResourcesButton v=ol pre=edit",
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
    // Folders are indented by depth; one inside a ticked folder shows as
    // included, with no box to click and its checkbox disabled.
    expect(assetPackageView).toContain("padding-left: ${folder.indent}px;");
    expect(assetPackageView).toContain("$if folder.isIncluded:");
    expect(assetPackageView).toContain(
      "?checked=${folder.selected} ?disabled=${folder.isIncluded}",
    );
    expect(assetPackageView).toContain("${folder.includedHint}");
    // Done does nothing more while it saves.
    expect(assetPackageView).toContain(
      "rtgl-button#pickerDoneButton v=pr ?disabled=${pickerDoneDisabled}",
    );
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

  it("gives each type's heading a menu to move it, unless it is the only type", () => {
    const assetPackageView = readView(
      "../../src/pages/assetPackage/assetPackage.view.yaml",
    );
    const view = load(assetPackageView);

    // The heading shows the type's name, with a small ghost three-dot button
    // on the right, only when there is more than one type.
    expect(assetPackageView).toContain("$if section.hasTypeMenu:");
    expect(assetPackageView).toContain(
      "rtgl-text c=mu-fg w=1fg: ${section.label}",
    );
    expect(assetPackageView).toContain(
      'rtgl-button#typeOptionsButton${sectionIndex} data-resource-type="${section.resourceType}" sq v=gh pre=ellipsis ?disabled=${typeMenuDisabled} aria-label="${typeOptionsLabel}" title="${typeOptionsLabel}"',
    );
    // The menu opens at the click, and its items are the store's.
    expect(assetPackageView).toContain(
      "rtgl-dropdown-menu#typeMenu :items=${typeMenu.items} x=${typeMenu.x} y=${typeMenu.y} ?open=${typeMenu.isOpen}",
    );
    expect(view.refs["typeOptionsButton*"].eventListeners.click.handler).toBe(
      "handleTypeOptionsClick",
    );
    expect(view.refs.typeMenu.eventListeners).toEqual({
      close: { handler: "handleTypeMenuClose" },
      "item-click": { handler: "handleTypeMenuClickItem" },
    });
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
