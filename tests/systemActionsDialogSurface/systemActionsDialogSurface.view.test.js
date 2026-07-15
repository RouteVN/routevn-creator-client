import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("systemActionsDialogSurface view", () => {
  it("uses the native bare dialog with the bounded scene editor overlay", () => {
    const dialogSurfaceView = readFileSync(
      new URL(
        "../../src/components/systemActionsDialogSurface/systemActionsDialogSurface.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(dialogSurfaceView).toContain(
      "rtgl-dialog#dialog ?open=${open} layout=fixed bare",
    );
    expect(dialogSurfaceView).toContain(
      'rtgl-view#overlay pos=fix edge=f style="z-index: 2000; background: transparent;"',
    );
    expect(dialogSurfaceView).toContain(
      "left: ${overlayHorizontalInset}; top: 0; bottom: 0; width: ${panelWidth}; z-index: 2001; background: ${overlayBackground}; pointer-events: none;",
    );
    expect(dialogSurfaceView).toContain("z-index: 2002;");
    expect(dialogSurfaceView).not.toContain("handleDocumentKeyDown");
  });
});
