import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("layoutEditPanel sound selector dialog view", () => {
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
  });
});
