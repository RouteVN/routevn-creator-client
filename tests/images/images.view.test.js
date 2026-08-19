import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("images view", () => {
  it("uses the Project dialog scrolling and sticky form action pattern", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    expect(imagesView).toContain(
      "rtgl-dialog#editDialog ?open=${isEditDialogOpen} s=md md-layout=fixed-top:",
    );
    expect(imagesView).toContain(
      "rtgl-view slot=content d=v w=f h=f overflow=hidden:",
    );
    expect(imagesView).toContain(
      "rtgl-form#editForm key=${isEditDialogOpen} :defaultValues=${editDefaultValues} :form=${editForm} sticky bottom-spacer=96 w=f h=f:",
    );
    expect(imagesView).toContain(
      "form-action:\n        handler: handleEditFormAction",
    );
    expect(imagesView).not.toContain("editImageSubmitButton");
    expect(imagesView).not.toContain("h=80 aria-hidden=true");
    expect(imagesView).not.toContain(
      "rtgl-form#editForm key=${isEditDialogOpen} :defaultValues=${editDefaultValues} :form=${editForm} w=f ph=md:",
    );
    expect(imagesView).not.toContain("md-layout=top:");
  });

  it("clears selection when the media grid emits a background click", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    expect(imagesView).toContain("background-click:");
    expect(imagesView).toContain("handler: handleResourceViewBackgroundClick");
  });

  it("moves mobile zoom and filter into the overflow menu", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    const mobileBranchStart = imagesView.indexOf("$if showMobileTopTabs");
    const desktopBranchStart = imagesView.indexOf("$else:", mobileBranchStart);
    const mobileBranch = imagesView.slice(
      mobileBranchStart,
      desktopBranchStart,
    );

    expect(mobileBranch).toContain("show-zoom-controls");
    expect(mobileBranch).toContain("zoom-in-overflow-menu");
    expect(mobileBranch).toContain("zoom-control-mode=columns");
    expect(mobileBranch).toContain("show-tag-filter");
    expect(mobileBranch).toContain("filter-in-overflow-menu");
    expect(mobileBranch).toContain("default-items-per-row=2");
    expect(mobileBranch).toContain(
      'items-per-row-config-key="groupImagesView.itemsPerRow"',
    );
  });

  it("moves the mobile file menu action to the trailing header controls", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    const mobileBranchStart = imagesView.indexOf("$if showMobileTopTabs");
    const desktopBranchStart = imagesView.indexOf("$else:", mobileBranchStart);
    const mobileBranch = imagesView.slice(
      mobileBranchStart,
      desktopBranchStart,
    );

    expect(mobileBranch).toContain("show-menu-button");
    expect(mobileBranch).toContain("menu-button-placement=trailing");
  });

  it("does not use the old mobile context-menu preview opt-in", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    expect(imagesView).not.toContain("preview-on-mobile-context-menu");
  });

  it("keeps extra scroll room at the bottom of the mobile file explorer", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    const mobileExplorerStart = imagesView.indexOf(
      "$if showMobileFileExplorer",
    );
    const mobileDetailSheetStart = imagesView.indexOf(
      "$if showMobileDetailSheet",
      mobileExplorerStart,
    );
    const mobileExplorerBranch = imagesView.slice(
      mobileExplorerStart,
      mobileDetailSheetStart,
    );

    expect(mobileExplorerBranch).toContain("bottom-empty-space-height=80vh");
  });

  it("enables per-item action menus only in the mobile file explorer", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    const mobileExplorerStart = imagesView.indexOf(
      "$if showMobileFileExplorer",
    );
    const mobileDetailSheetStart = imagesView.indexOf(
      "$if showMobileDetailSheet",
      mobileExplorerStart,
    );
    const mobileExplorerBranch = imagesView.slice(
      mobileExplorerStart,
      mobileDetailSheetStart,
    );
    const desktopExplorerBranch = imagesView.slice(0, mobileExplorerStart);

    expect(mobileExplorerBranch).toContain("show-item-menu-actions");
    expect(mobileExplorerBranch).toContain(
      ":folderContextMenuItems=${folderContextMenuItems}",
    );
    expect(mobileExplorerBranch).toContain(
      ":itemContextMenuItems=${itemContextMenuItems}",
    );
    expect(desktopExplorerBranch).not.toContain("show-item-menu-actions");
  });

  it("keeps the mobile file explorer clear of iOS safe areas", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    const mobileExplorerStart = imagesView.indexOf(
      "$if showMobileFileExplorer",
    );
    const mobileDetailSheetStart = imagesView.indexOf(
      "$if showMobileDetailSheet",
      mobileExplorerStart,
    );
    const mobileExplorerBranch = imagesView.slice(
      mobileExplorerStart,
      mobileDetailSheetStart,
    );

    expect(mobileExplorerBranch).toContain(
      "padding-top: var(--rvn-mobile-overlay-top-inset, 0px)",
    );
    expect(mobileExplorerBranch).toContain(
      "padding-bottom: env(safe-area-inset-bottom)",
    );
  });

  it("keeps the mobile file explorer header aligned with the image grid header height", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    const mobileExplorerStart = imagesView.indexOf(
      "$if showMobileFileExplorer",
    );
    const mobileDetailSheetStart = imagesView.indexOf(
      "$if showMobileDetailSheet",
      mobileExplorerStart,
    );
    const mobileExplorerBranch = imagesView.slice(
      mobileExplorerStart,
      mobileDetailSheetStart,
    );

    expect(mobileExplorerBranch).toContain(
      "rtgl-view h=48 w=f d=h av=c ph=md bgc=bg bwb=xs g=md",
    );
    expect(mobileExplorerBranch).not.toContain("rtgl-view h=56 w=f d=h");
  });

  it("constrains the desktop file explorer to the remaining left-panel height", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    const desktopExplorerStart = imagesView.indexOf("$if showExplorerPanel");
    const contentPanelStart = imagesView.indexOf(
      "div#fileExplorerKeyboardScope",
      desktopExplorerStart,
    );
    const desktopExplorerBranch = imagesView.slice(
      desktopExplorerStart,
      contentPanelStart,
    );

    expect(desktopExplorerBranch).toContain(
      'rtgl-view slot="content" w=f h=f d=v style="min-height: 0;"',
    );
    expect(desktopExplorerBranch).toContain(
      'rtgl-view w=f h=1fg style="min-height: 0;"',
    );
    expect(desktopExplorerBranch).toContain(
      "rvn-base-file-explorer#fileExplorer",
    );
  });

  it("passes bottom scroll room to the media grid", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    expect(imagesView).toContain("scroll-bottom-padding=32vh");
    expect(imagesView).not.toContain(
      ":scrollBottomPadding=${gridScrollBottomPadding}",
    );
  });

  it("registers touch handlers on the full image preview overlay", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    const overlayStart = imagesView.indexOf("previewOverlay:");
    const frameStart = imagesView.indexOf("previewImageFrame:", overlayStart);
    const overlayRefs = imagesView.slice(overlayStart, frameStart);

    expect(overlayRefs).toContain("handler: handlePreviewOverlayTouchStart");
    expect(overlayRefs).toContain("handler: handlePreviewOverlayTouchEnd");
    expect(overlayRefs).toContain("handler: handlePreviewOverlayTouchCancel");
  });

  it("aligns the full preview breadcrumb with the image and mode controls", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    const breadcrumbStyleStart = imagesView.indexOf(
      "fullImagePreviewTopBarStyle",
    );
    const breadcrumbStart = imagesView.indexOf(
      "fullImagePreviewBreadcrumb",
      breadcrumbStyleStart,
    );
    const layoutStyleStart = imagesView.indexOf(
      "fullImagePreviewLayoutStyle",
      breadcrumbStart,
    );
    const frameStart = imagesView.indexOf(
      "previewImageFrame",
      layoutStyleStart,
    );

    expect(breadcrumbStyleStart).toBeGreaterThan(-1);
    expect(breadcrumbStart).toBeGreaterThan(breadcrumbStyleStart);
    expect(layoutStyleStart).toBeGreaterThan(breadcrumbStart);
    expect(frameStart).toBeGreaterThan(layoutStyleStart);
    expect(imagesView).toContain("rtgl-text#previewBreadcrumb");
    expect(imagesView).toContain("rtgl-view#previewModeControls");
  });

  it("shows preview and delete actions in the mobile detail sheet", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    const mobileDetailStart = imagesView.indexOf("$if showMobileDetailSheet");
    const editDialogStart = imagesView.indexOf("rtgl-dialog#editDialog");
    const mobileDetailBranch = imagesView.slice(
      mobileDetailStart,
      editDialogStart,
    );

    expect(mobileDetailBranch).toContain("mobileDetailPreviewButton");
    expect(mobileDetailBranch).toContain("mobileDetailDeleteButton");

    expect(imagesView).toContain("handler: handleMobileDetailPreviewClick");
    expect(imagesView).toContain("handler: handleMobileDetailDeleteClick");
  });

  it("constrains the edit image preview to a fixed aspect-preserving box", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    expect(imagesView).toContain(
      'rtgl-view slot=image-slot w=120 h=120 av=c ah=c style="overflow: hidden;"',
    );
    expect(imagesView).toContain(
      "rvn-file-image#editDialogImage fileId=${editPreviewFileId} w=f h=f",
    );
    expect(imagesView).not.toContain(
      "rvn-file-image#editDialogImage fileId=${editPreviewFileId} h=120",
    );
  });

  it("shows a confirmation dialog for image deletes", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    expect(imagesView).toContain(
      "rtgl-dialog#deleteDialog ?open=${deleteDialogOpen}",
    );
    expect(imagesView).toContain("handler: handleDeleteDialogClose");
    expect(imagesView).toContain("handler: handleDeleteDialogConfirm");
    expect(imagesView).toContain("deleteDialogMessage");
    expect(imagesView).not.toContain("deleteCancelButton");
    expect(imagesView).toContain(
      "rtgl-button#deleteConfirmButton v=de: ${deleteDialogConfirmLabel}",
    );
  });
});
