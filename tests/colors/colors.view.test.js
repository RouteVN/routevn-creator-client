import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("colors view", () => {
  it("shows an edit action in the mobile detail sheet", () => {
    const colorsView = readFileSync(
      new URL("../../src/pages/colors/colors.view.yaml", import.meta.url),
      "utf8",
    );

    const mobileDetailStart = colorsView.indexOf("$if showMobileDetailSheet");
    const folderDialogStart = colorsView.indexOf(
      "rtgl-dialog#folderNameDialog",
      mobileDetailStart,
    );
    const mobileDetailBranch = colorsView.slice(
      mobileDetailStart,
      folderDialogStart,
    );

    expect(mobileDetailBranch).toContain(
      "rtgl-button#mobileDetailEditButton w=1fg v=se pre=edit: ${editButton}",
    );
    expect(mobileDetailBranch).toContain(
      "rtgl-button#mobileDetailPreviewButton w=1fg v=se pre=zoomIn: ${previewButton}",
    );
    expect(colorsView).toContain("handler: handleMobileDetailEditClick");
  });
});
