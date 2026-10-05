import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const transformsView = readFileSync(
  new URL("../../src/pages/transforms/transforms.view.yaml", import.meta.url),
  "utf8",
);

describe("transforms view", () => {
  it("opens, duplicates, and deletes from the mobile detail sheet", () => {
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
      "rtgl-button#mobileDetailOpenButton w=1fg v=se pre=chevronRight: ${openButton}",
    );
    expect(mobileDetailBranch).toContain(
      "rtgl-button#mobileDetailDuplicateButton w=1fg v=se pre=duplicate: ${duplicateButton}",
    );
    expect(mobileDetailBranch).toContain(
      "rtgl-button#mobileDetailDeleteButton w=1fg v=se pre=trash: ${deleteButton}",
    );
    expect(mobileDetailBranch).not.toContain("mobileDetailEditButton");
    expect(mobileDetailBranch).not.toContain("mobileDetailPreviewButton");
  });

  it("edits transform values in the editor page, not in a dialog", () => {
    expect(transformsView).not.toContain("transformDialog");
    expect(transformsView).not.toContain("transformForm");
    expect(transformsView).not.toContain("div#canvas");
  });
});
