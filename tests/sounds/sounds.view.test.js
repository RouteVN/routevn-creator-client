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
    expect(mobileDetailBranch).toContain("pre=trash: ${deleteButton}");

    expect(soundsView).toContain("handler: handleMobileDetailPlayClick");
    expect(soundsView).toContain("handler: handleMobileDetailDeleteClick");
  });

  it("keeps the desktop detail waveform display-only", () => {
    const soundsView = readFileSync(
      new URL("../../src/pages/sounds/sounds.view.yaml", import.meta.url),
      "utf8",
    );

    expect(soundsView).toContain('".soundDetailPreviewFrame":');
    expect(soundsView).toContain("#detailSoundPreview");
    expect(soundsView).toContain("cursor: default");
    expect(soundsView).toContain("pointer-events: none");
    expect(soundsView).toContain(
      'div#detailSoundPreview.soundDetailPreviewFrame slot="sound-waveform"',
    );
    expect(soundsView).not.toContain("detailWaveform:");
    expect(soundsView).not.toContain("detailWaveformPlaceholder");
    expect(soundsView).not.toContain("handler: handleFormExtraEvent");
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
    expect(soundsView).toContain(
      "rtgl-button#mobileDeleteConfirmButton v=pr pre=trash",
    );
  });

  it("sizes the bottom audio player from view data offsets", () => {
    const soundsView = readFileSync(
      new URL("../../src/pages/sounds/sounds.view.yaml", import.meta.url),
      "utf8",
    );

    expect(soundsView).toContain(
      'style="left: ${audioPlayerLeft}px; right: ${audioPlayerRight}px; bottom: ${audioPlayerBottom};"',
    );
    expect(soundsView).toContain(":mobileLayout=${mobileLayout}");
    expect(soundsView).toContain("z=1500");
    expect(soundsView).toContain("bottom: ${audioPlayerBottom};");
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
