import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("images view", () => {
  it("shows column zoom controls in the mobile media header", () => {
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
    expect(mobileBranch).toContain("zoom-control-mode=columns");
    expect(mobileBranch).toContain("default-items-per-row=2");
    expect(mobileBranch).toContain(
      'items-per-row-config-key="groupImagesView.itemsPerRow"',
    );
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

  it("shows a confirmation dialog for mobile detail deletes", () => {
    const imagesView = readFileSync(
      new URL("../../src/pages/images/images.view.yaml", import.meta.url),
      "utf8",
    );

    expect(imagesView).toContain(
      "rtgl-dialog#mobileDeleteDialog ?open=${mobileDeleteDialogOpen}",
    );
    expect(imagesView).toContain("handler: handleMobileDeleteDialogClose");
    expect(imagesView).toContain("handler: handleMobileDeleteDialogCancel");
    expect(imagesView).toContain("handler: handleMobileDeleteDialogConfirm");
    expect(imagesView).toContain("mobileDeleteDialogMessage");
  });
});
