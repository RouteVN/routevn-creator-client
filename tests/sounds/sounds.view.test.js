import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("sounds view", () => {
  it("plays sounds from mobile long-press without changing desktop context menus", () => {
    const soundsView = readFileSync(
      new URL("../../src/pages/sounds/sounds.view.yaml", import.meta.url),
      "utf8",
    );

    const mobileBranchStart = soundsView.indexOf("$if showMobileTopTabs");
    const desktopBranchStart = soundsView.indexOf("$else:", mobileBranchStart);
    const desktopBranchEnd = soundsView.indexOf("$if showDetailPanel");
    const mobileBranch = soundsView.slice(
      mobileBranchStart,
      desktopBranchStart,
    );
    const desktopBranch = soundsView.slice(
      desktopBranchStart,
      desktopBranchEnd,
    );

    expect(mobileBranch).not.toContain("preview-on-mobile-context-menu");
    expect(desktopBranch).not.toContain("preview-on-mobile-context-menu");
  });

  it("shows play and delete actions in the mobile detail sheet", () => {
    const soundsView = readFileSync(
      new URL("../../src/pages/sounds/sounds.view.yaml", import.meta.url),
      "utf8",
    );

    const mobileDetailStart = soundsView.indexOf("$if showMobileDetailSheet");
    const editDialogStart = soundsView.indexOf("rtgl-dialog#editDialog");
    const mobileDetailBranch = soundsView.slice(
      mobileDetailStart,
      editDialogStart,
    );

    expect(mobileDetailBranch).toContain("mobileDetailPlayButton");
    expect(mobileDetailBranch).toContain("mobileDetailDeleteButton");
    expect(mobileDetailBranch).toContain("pre=play: ${previewButton}");

    expect(soundsView).toContain("handler: handleMobileDetailPlayClick");
    expect(soundsView).toContain("handler: handleMobileDetailDeleteClick");
  });

  it("shows a confirmation dialog for mobile detail deletes", () => {
    const soundsView = readFileSync(
      new URL("../../src/pages/sounds/sounds.view.yaml", import.meta.url),
      "utf8",
    );

    expect(soundsView).toContain(
      "rtgl-dialog#mobileDeleteDialog ?open=${mobileDeleteDialogOpen}",
    );
    expect(soundsView).toContain("handler: handleMobileDeleteDialogClose");
    expect(soundsView).toContain("handler: handleMobileDeleteDialogCancel");
    expect(soundsView).toContain("handler: handleMobileDeleteDialogConfirm");
    expect(soundsView).toContain("mobileDeleteDialogMessage");
  });

  it("sizes the bottom audio player from view data offsets", () => {
    const soundsView = readFileSync(
      new URL("../../src/pages/sounds/sounds.view.yaml", import.meta.url),
      "utf8",
    );

    expect(soundsView).toContain(
      'style="left: ${audioPlayerLeft}px; right: ${audioPlayerRight}px;"',
    );
    expect(soundsView).toContain(":mobileLayout=${mobileLayout}");
  });

  it("passes bottom scroll room to the media grid", () => {
    const soundsView = readFileSync(
      new URL("../../src/pages/sounds/sounds.view.yaml", import.meta.url),
      "utf8",
    );

    expect(soundsView).toContain("scroll-bottom-padding=32vh");
    expect(soundsView).not.toContain(
      ":scrollBottomPadding=${gridScrollBottomPadding}",
    );
  });
});
