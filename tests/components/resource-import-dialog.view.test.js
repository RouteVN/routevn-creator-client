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
  it("opens as an almost full-screen dialog, full screen on narrow windows", () => {
    expect(viewSource).toContain(
      'rtgl-dialog#dialog ?open=${open} sm-layout=fixed md-layout=fixed p=none aria-label="${dialogAriaLabel}"',
    );
    // Its own close button sits at the header's right, not the dialog's.
    expect(viewSource).toContain(
      'rtgl-button#dialogCloseButton sq v=gh pre=x aria-label="${closeLabel}" title="${closeLabel}"',
    );
    expect(viewSource).toContain(
      "rtgl-view#dialogContent slot=content d=v bgc=bg br=md overflow=hidden",
    );
    expect(viewSource).toMatch(
      /'#dialogContent':\n {4}width: min\(1600px, calc\(100vw - 64px\)\)\n {4}height: calc\(100vh - 64px\)/,
    );
    // Check the sticky layout attributes on the form's line, so other
    // attributes can be added to the form without breaking this test.
    const workflowFormLine = viewSource
      .split("\n")
      .find((line) =>
        line.includes(
          "rtgl-form#workflowForm key=${formKey} :defaultValues=${defaultValues} :form=${form} :context=${formContext} ",
        ),
      );
    expect(workflowFormLine).toContain(" sticky ");
    expect(workflowFormLine).toContain("w=f h=f");
    // Choose resources sits in a centered column as wide as the pack page's,
    // with the form inside it.
    expect(viewSource).toMatch(
      /- 'rtgl-view d=v w=f h=1fg ah=c style="min-height: 0;"':\n +- 'rtgl-view#selectionColumn d=v h=f p=lg style="box-sizing: border-box; width: 100%; max-width: 1200px; min-height: 0;"':\n +- rtgl-form#workflowForm /,
    );
    // Only Import stays in place: Back and the title are in the scrolling
    // header, and the version and description are left to the pack page.
    expect(viewSource).toMatch(
      /- rtgl-view slot=selection-header d=v w=f g=md:\n +- rtgl-view d=h w=f av=c g=md:\n +- 'rtgl-button#selectionBackButton sq pre=chevronLeft v=ol aria-label="\$\{selectionBackLabel\}" title="\$\{selectionBackLabel\}"': null\n +- rtgl-text s=lg w=1fg: \$\{selectionTitle\}/,
    );
    expect(viewSource).toMatch(
      /selectionBackButton:\n {4}eventListeners:\n {6}click:\n {8}handler: handleSelectionBack/,
    );
    expect(viewSource).toContain(
      "'rtgl-button#selectionToggleAllButton v=se data-all-selected=${allResourcesSelected}'",
    );
    expect(viewSource).not.toContain("${packageVersion}");
    expect(viewSource).not.toContain("${packageDescription}");
    expect(viewSource).not.toContain("package-summary");
  });

  it("replaces the import link field with the asset store", () => {
    expect(viewSource).not.toContain("source-description");
    expect(viewSource).not.toContain("assetStoreLink");
    expect(viewSource).toContain("$if isStoreStep && !isBusy:");
    expect(viewSource).toContain("$if isSelectionStep && !isBusy:");
    expect(viewSource).toContain(
      "rtgl-grid#packGrid cols=4 xl-cols=3 lg-cols=2 sm-cols=1 g=lg w=f",
    );
    expect(viewSource).toContain("d=h md-d=v w=f h=1fg");
    expect(viewSource).toContain(
      "rtgl-view d=v w=280 md-w=f g=lg p=lg sv style=",
    );
    expect(viewSource).toContain("sv sbv=touch g=lg p=lg bwl=xs bc=bo");
    expect(viewSource).toContain("rtgl-text: ${catalog.searchTitle}");
    expect(viewSource).toContain("rtgl-input#storeSearchInput s=sm w=f");
    expect(viewSource).toContain("handler: handleStoreSearchInput");
    expect(viewSource).toContain("rtgl-text: ${catalog.assetTypesTitle}");
    expect(viewSource).toContain(
      "rtgl-tag-select#storeAssetTypeSelect w=f no-add :ariaLabel=${catalog.assetTypesTitle} :options=${catalog.assetTypeOptions} :selectedValues=${catalog.selectedAssetTypes}",
    );
    expect(viewSource).toContain("handler: handleStoreAssetTypesChange");
    expect(viewSource).toContain("${catalog.noResultsLabel}");
    expect(viewSource).toContain("$for pack in catalog.packs");
    expect(viewSource).toContain(
      'role=button tabindex=0 data-pack-id="${pack.id}" aria-label="${pack.openLabel}"',
    );
    expect(viewSource).toContain('style="aspect-ratio: 16 / 9;"');
    expect(viewSource).toContain(
      "rtgl-image src=${pack.coverUrl} w=f h=f of=cov",
    );
    // Cards show the total; the pack page lists the counts by type as
    // bullets, never joined with a separator.
    expect(viewSource).toContain(
      "rtgl-text s=sm c=mu-fg: ${pack.assetCountLabel}",
    );
    // The summary sits under the title, clamped to two lines.
    expect(viewSource).toContain(
      `'rtgl-text s=sm c=mu-fg style="display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;"': \${pack.summary}`,
    );
    // The pack page lists no counts by type, nor the download size.
    expect(viewSource).not.toContain("assetCountLabels");
    expect(viewSource).not.toContain("downloadSize");
    expect(viewSource).not.toContain("assetCountsLabel");
    expect(viewSource).toContain("rtgl-button#catalogRetryButton");
    expect(viewSource).toContain("rtgl-button#loadMorePacksButton");
    expect(viewSource).toContain("handler: handlePackGridClick");
    expect(viewSource).toContain("handler: handlePackGridKeyDown");
  });

  it("shows a pack page with its cover, info and assets before choosing them", () => {
    expect(viewSource).toContain("$if isPackStep && !isBusy:");
    expect(viewSource).toContain(
      'rtgl-button#packBackButton sq pre=chevronLeft v=ol aria-label="${pack.backLabel}" title="${pack.backLabel}"',
    );
    expect(viewSource).toContain(
      "rtgl-button#packImportButton v=pr w=f ?disabled=${pack.importDisabled}: ${pack.importLabel}",
    );
    // The page opens before its details and assets load.
    expect(viewSource).not.toContain("isOpeningPack");
    expect(viewSource).not.toContain("detailsLoadingLabel");
    expect(viewSource).toContain(
      'rtgl-grid cols=4 md-cols=3 sm-cols=2 w=f pt=md g=md role=status aria-label="${pack.assetsLoadingLabel}"',
    );
    expect(viewSource).toContain("$for placeholder in pack.assetPlaceholders:");
    expect(viewSource).toContain("$if pack.isLoadingAssets:");
    // A pack has no screenshot gallery.
    expect(viewSource).not.toContain("rvn-asset-pack-gallery");
    expect(viewSource).not.toContain("screenshotUrls");
    // The pack info, with its cover and Import, sits beside the description
    // and the assets, and stays in view while they scroll.
    const packInfo = viewSource.slice(viewSource.indexOf("rtgl-view#packInfo"));
    expect(viewSource.indexOf("rtgl-view#packMain")).toBeLessThan(
      viewSource.indexOf("rtgl-view#packAssets"),
    );
    expect(viewSource.indexOf("rtgl-view#packAssets")).toBeLessThan(
      viewSource.indexOf("rtgl-view#packInfo"),
    );
    expect(packInfo.indexOf("${pack.coverUrl}")).toBeLessThan(
      packInfo.indexOf("#packImportButton"),
    );
    // The last assets can scroll clear of the bottom edge.
    expect(packInfo).toMatch(
      /#packImportButton[^\n]*\n {22}- 'rtgl-view#packBottomSpacer h=240 aria-hidden=true style="flex: 0 0 240px;"': null\n {10}- \$if isCreatorStep/,
    );
    expect(viewSource).toMatch(
      /'#packInfo':\n {4}position: sticky\n {4}top: var\(--spacing-lg\)\n {2}'@media only screen and \(max-width: 1024px\)':\n {4}'#packInfo':\n {6}position: static\n {6}order: -1/,
    );
    expect(viewSource).toContain(
      "rtgl-image src=${pack.coverUrl} w=f h=f of=cov",
    );
    expect(viewSource).toContain("$for block in pack.description");
    // The release notes keep their line breaks.
    expect(viewSource).toContain("$if pack.releaseNotes:");
    expect(viewSource).toContain(
      `'rtgl-text style="white-space: pre-line; overflow-wrap: anywhere;"': \${pack.releaseNotes}`,
    );
    expect(viewSource).toContain("${pack.infoTitle}");
    expect(viewSource).toContain("${pack.released}");
    expect(viewSource).toContain("${pack.updated}");
    expect(viewSource).toContain("${pack.assetsTitle}");
    expect(viewSource).toContain(
      "rtgl-grid cols=4 md-cols=3 sm-cols=2 w=f pt=md pb=sm mb=lg g=md",
    );
    expect(viewSource).toContain("key=pack-${resource.previewSourceId}");
    // A card shows only the name, and a color its value; the description
    // waits for the preview.
    expect(viewSource).toMatch(
      /rtgl-view d=v w=f g=xs p=md:\n +- rtgl-text s=xs c=mu-fg ellipsis w=f: \$\{resource\.name\}\n +- \$if resource\.colorHex:\n +- rtgl-text s=xs c=mu-fg: \$\{resource\.colorHex\}\n +- 'rtgl-view#packInfo/,
    );
    expect(viewSource).toContain("handler: handlePackBack");
    expect(viewSource).toContain("handler: handlePackImport");
  });

  it("previews a pack asset full screen without closing the import", () => {
    expect(viewSource).toContain("rtgl-view#packAssets d=v w=f g=md");
    // Folder groups and cards look like the resource pages'.
    expect(viewSource).toContain("$for group, gIndex in packGroups:");
    expect(viewSource).toContain(
      'rtgl-view#packGroupToggle${gIndex} data-group-key="${group.key}" role=button tabindex=0 aria-expanded="${group.expanded}" d=h av=c g=md cur=pointer',
    );
    expect(viewSource).toContain("rtgl-svg wh=16 svg=folderArrowRight");
    expect(viewSource).toContain(
      "rtgl-text s=xs c=mu-fg ellipsis w=f: ${resource.name}",
    );
    expect(viewSource).toContain("handler: handlePackGroupToggle");
    expect(viewSource).toContain("handler: handlePackGroupKeyDown");
    expect(viewSource).toContain(
      'data-asset-source-id="${resource.sourceId}" data-preview-hover=true aria-label="${resource.previewLabel}"',
    );
    expect(viewSource).toContain(
      "?lazy=true ?hover=true ?paused=${isAssetPreviewOpen}",
    );
    expect(viewSource).toContain("$if isPackStep && assetPreview:");
    expect(viewSource).toContain(
      "rtgl-dialog#assetPreviewDialog open layout=fixed bare p=none",
    );
    expect(viewSource).toMatch(
      /assetPreviewDialog:\n {4}eventListeners:\n {6}close:\n {8}handler: handleAssetPreviewClose\n {8}stopPropagation: true/,
    );
    expect(viewSource).toContain("handler: handlePackAssetClick");
    expect(viewSource).toContain("key=large-${assetPreview.sourceFileId}");
    // The whole description shows under the large preview, wrapped.
    expect(viewSource).toContain(
      `'rtgl-text s=sm c=mu-fg ta=c style="white-space: pre-line;"': \${assetPreview.description}`,
    );
  });

  it("links a pack's creator to a creator page with their packs", () => {
    expect(viewSource).toContain(
      'rtgl-view#packCreatorButton role=button tabindex=0 aria-label="${pack.openCreatorLabel}"',
    );
    expect(viewSource).toContain("handler: handlePackCreatorClick");
    expect(viewSource).toContain("handler: handlePackCreatorKeyDown");
    expect(viewSource).toContain("$if isCreatorStep && !isBusy:");
    expect(viewSource).toContain(
      'rtgl-button#creatorBackButton sq pre=chevronLeft v=ol aria-label="${creator.backLabel}" title="${creator.backLabel}"',
    );
    expect(viewSource).toContain(
      "rtgl-image src=${creator.avatarUrl} w=f h=f of=cov",
    );
    expect(viewSource).toContain("$for paragraph in creator.description");
    expect(viewSource).toContain("rtgl-view#creatorLinks d=h g=sm wrap");
    expect(viewSource).toContain('data-url="${link.url}"');
    expect(viewSource).toContain(
      "rtgl-grid#creatorPackGrid cols=4 xl-cols=3 lg-cols=2 sm-cols=1 g=lg w=f",
    );
    expect(viewSource).toContain("$for pack in creator.packs");
    // Every pack comes with the profile, so the page has no Load More.
    expect(viewSource).not.toContain("creatorLoadMoreButton");
    expect(viewSource).not.toContain("creatorPacksRetryButton");
    expect(viewSource).not.toMatch(/author/i);
  });

  it("renders preview media in bounded 16:9 frames", () => {
    expect(viewSource).toContain("rvn-resource-import-preview-media");
    expect(viewSource).toContain(
      "rtgl-view w=f av=c ah=c bgc=mu pos=rel overflow=hidden style=\"aspect-ratio: 16 / 9;\"",
    );
    expect(viewSource).toContain("sourceFileId=${resource.previewSourceId}");
    expect(viewSource).toContain("?lazy=true");
  });

  it("uses the whole resource card as the selection control", () => {
    expect(viewSource).toContain("slot=selection-controls");
    expect(viewSource).toContain(
      "rtgl-view#resourceSelectionGrid slot=resource-selection-grid",
    );
    expect(viewSource).not.toContain("rtgl-grid cols=3 xl-cols=2 md-cols=1");
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
    // A card is the pack page's: the preview, then only the name, since the
    // headers give the type and the description shows in the pack page's
    // preview. A selected one shows a check on the preview's top right; an
    // unselected one shows nothing.
    expect(viewSource).toContain(
      "rtgl-grid cols=4 md-cols=3 sm-cols=2 g=md w=f style=\"padding-left: ${group.indent}px;",
    );
    expect(viewSource).toMatch(
      /- \$if resource\.selected:\n +- 'rtgl-view d=h av=c g=xs pos=abs aria-hidden=true style="top: 8px; right: 8px;"':\n +- \$if resource\.required:\n +- rtgl-tag s=sm v=mu: \$\{resource\.selectionStatus\}\n +- rtgl-view wh=24 av=c ah=c br=f bgc=pr:\n +- rtgl-svg svg=check wh=16 c=pr-fg: null\n/,
    );
    expect(viewSource).not.toContain("bgc=bg bw=sm bc=bo");
    expect(viewSource).toContain(
      "rtgl-text s=xs c=mu-fg ellipsis w=f: ${resource.name}",
    );
    expect(viewSource).not.toContain("${resource.typeLabel}");
    expect(viewSource).not.toContain("${resource.description}");
    expect(viewSource).toContain("bgc=bg");
    expect(viewSource).toContain("bc=${resource.selectionBorderColor}");
    expect(viewSource).toContain("h-bc=${resource.selectionHoverBorderColor}");
    expect(viewSource).toContain(
      'style="padding-left: ${group.indent}px; box-sizing: border-box;"',
    );
    expect(viewSource).not.toContain("selectionBackgroundColor");
    expect(viewSource).not.toContain("rtgl-checkbox");
    expect(viewSource).not.toContain("rtgl-view w=160 h=90");
    expect(viewSource).not.toContain("selectionStatusColor");
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
