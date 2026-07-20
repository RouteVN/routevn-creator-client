import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("layoutEditPanel sound dialogs view", () => {
  it("shows a sound form with a selectable sound item and volume", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const soundFormStart = view.indexOf(
      "rtgl-dialog#soundFormDialog ?open=${soundFormDialog.open} s=sm",
    );
    const soundSelectorStart = view.indexOf(
      "rtgl-dialog#soundSelectorDialog",
      soundFormStart,
    );
    const soundFormView = view.slice(soundFormStart, soundSelectorStart);

    expect(soundFormStart).toBeGreaterThan(-1);
    expect(soundSelectorStart).toBeGreaterThan(soundFormStart);
    expect(soundFormView).toContain("s=sm close-button");
    expect(soundFormView).toContain("rtgl-form#soundForm");
    expect(soundFormView).toContain('slot="sound-item"');
    expect(soundFormView).toContain("rtgl-view#soundFormSoundField");
    expect(soundFormView).toContain("w=160");
    expect(soundFormView).toContain("aspect-ratio: 16 / 9");
    expect(soundFormView).not.toContain("w=f h=120");
  });

  it("keeps a stable picker width when few sounds are available", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const soundDialogStart = view.indexOf(
      "rtgl-dialog#soundSelectorDialog ?open=${soundSelectorDialog.open} s=lg",
    );
    const spritesheetDialogStart = view.indexOf(
      "rtgl-dialog#spritesheetSelectorDialog",
      soundDialogStart,
    );

    expect(soundDialogStart).toBeGreaterThan(-1);
    expect(spritesheetDialogStart).toBeGreaterThan(soundDialogStart);

    const soundDialogView = view.slice(
      soundDialogStart,
      spritesheetDialogStart,
    );
    expect(soundDialogView).toContain("rtgl-view slot=content d=v w=f g=md");
    expect(soundDialogView).toContain("s=lg close-button");
    expect(soundDialogView).not.toContain("cancelSoundSelection");
  });
});
