import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("textStyles view", () => {
  it("shows an edit action in the mobile detail sheet", () => {
    const textStylesView = readFileSync(
      new URL(
        "../../src/pages/textStyles/textStyles.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const mobileDetailStart = textStylesView.indexOf(
      "$if showMobileDetailSheet",
    );
    const folderDialogStart = textStylesView.indexOf(
      "rtgl-dialog#folderNameDialog",
      mobileDetailStart,
    );
    const mobileDetailBranch = textStylesView.slice(
      mobileDetailStart,
      folderDialogStart,
    );

    expect(mobileDetailBranch).toContain("mobileDetailEditButton");
    expect(mobileDetailBranch).toContain("pre=edit: ${editButton}");
    expect(mobileDetailBranch).toContain(
      "rtgl-view d=h w=f g=sm p=md bgc=su bwb=xs",
    );
    expect(mobileDetailBranch).toContain(
      "rtgl-button#mobileDetailEditButton w=1fg v=se pre=edit",
    );
    expect(textStylesView).toContain("handler: handleMobileDetailEditClick");
    expect(textStylesView).toContain("handler: handleTextStyleItemEdit");
  });
});
