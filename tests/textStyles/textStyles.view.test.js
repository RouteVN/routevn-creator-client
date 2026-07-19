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

  it("hides the add/edit preview canvas in the mobile dialog branch", () => {
    const textStylesView = readFileSync(
      new URL(
        "../../src/pages/textStyles/textStyles.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const desktopPreviewStart = textStylesView.indexOf(
      "$if showDialogPreviewCanvas",
    );
    const mobileBranchStart = textStylesView.indexOf(
      "$else:",
      desktopPreviewStart,
    );
    const dialogEnd = textStylesView.indexOf(
      "rtgl-dialog#addColorDialog",
      mobileBranchStart,
    );
    const desktopBranch = textStylesView.slice(
      desktopPreviewStart,
      mobileBranchStart,
    );
    const mobileBranch = textStylesView.slice(mobileBranchStart, dialogEnd);

    expect(desktopBranch).toContain("rvn-font-preview");
    expect(desktopBranch).toContain("aspect-ratio: 32 / 9");
    expect(desktopBranch).toContain("previewTextInput");
    expect(mobileBranch).toContain("$if isDialogOpen");
    expect(mobileBranch).toContain("rtgl-form#textStyleForm");
    expect(mobileBranch).toContain(
      "rtgl-dialog#addTypographyDialog ?open=${isDialogOpen} s=md",
    );
    expect(mobileBranch).toContain("rtgl-view slot=content g=md");
    expect(mobileBranch).not.toContain("rvn-font-preview");
    expect(mobileBranch).not.toContain("previewTextInput");
    expect(mobileBranch).not.toContain("100vw");
    expect(mobileBranch).not.toContain("calc(100vw");
  });

  it("keeps the desktop submit action outside the scrollable form content", () => {
    const textStylesView = readFileSync(
      new URL(
        "../../src/pages/textStyles/textStyles.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const desktopPreviewStart = textStylesView.indexOf(
      "$if showDialogPreviewCanvas",
    );
    const mobileBranchStart = textStylesView.indexOf(
      "$else:",
      desktopPreviewStart,
    );
    const desktopBranch = textStylesView.slice(
      desktopPreviewStart,
      mobileBranchStart,
    );

    expect(desktopBranch).toContain("w=800 h=70vh");
    expect(desktopBranch).toContain("textStyleFormScroll w=f h=1fg sv");
    expect(desktopBranch).toContain(":form=${desktopDialogForm}");
    expect(desktopBranch).toContain("desktopTextStyleSubmitButton");
    expect(
      desktopBranch.indexOf("desktopTextStyleSubmitButton"),
    ).toBeGreaterThan(desktopBranch.indexOf(":form=${desktopDialogForm}"));
    expect(textStylesView).toContain(
      "handler: handleDesktopTextStyleSubmitClick",
    );
  });
});
