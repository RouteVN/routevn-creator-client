import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("transforms view", () => {
  it("uses icons for duplicate and delete actions in the mobile detail sheet", () => {
    const transformsView = readFileSync(
      new URL(
        "../../src/pages/transforms/transforms.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const mobileDetailStart = transformsView.indexOf(
      "$if showMobileDetailSheet",
    );
    const folderDialogStart = transformsView.indexOf(
      "rtgl-dialog#folderNameDialog",
      mobileDetailStart,
    );
    const mobileDetailBranch = transformsView.slice(
      mobileDetailStart,
      folderDialogStart,
    );

    expect(mobileDetailBranch).toContain(
      "rtgl-button#mobileDetailDuplicateButton w=1fg v=se pre=duplicate: ${duplicateButton}",
    );
    expect(mobileDetailBranch).toContain(
      "rtgl-button#mobileDetailDeleteButton w=1fg v=se pre=trash: ${deleteButton}",
    );
  });

  it("hides the preview image selector file explorer behind touch-mode view data", () => {
    const transformsView = readFileSync(
      new URL(
        "../../src/pages/transforms/transforms.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const selectorDialogStart = transformsView.indexOf(
      "rtgl-dialog#transformPreviewImageSelectorDialog",
    );
    const previewOverlayStart = transformsView.indexOf(
      "$when: fullImagePreviewVisible",
      selectorDialogStart,
    );
    const selectorDialogBranch = transformsView.slice(
      selectorDialogStart,
      previewOverlayStart,
    );

    expect(selectorDialogBranch).toContain(
      "$if showTransformPreviewImageSelectorFileExplorer",
    );
    expect(selectorDialogBranch).toContain(
      "rvn-base-file-explorer#transformPreviewImageSelectorFileExplorer",
    );
  });

  it("does not show a cancel button in the preview image selector", () => {
    const transformsView = readFileSync(
      new URL(
        "../../src/pages/transforms/transforms.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(transformsView).not.toContain(
      "rtgl-button#cancelTransformPreviewImageSelection",
    );
  });
});
