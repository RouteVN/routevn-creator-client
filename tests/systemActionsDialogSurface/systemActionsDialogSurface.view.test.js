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
      "rtgl-dialog#dialog ?open=${open} layout=fixed bare p=${dialogPadding}",
    );
    expect(dialogSurfaceView).toContain("$if fullscreen");
    expect(dialogSurfaceView).toContain(
      "left: ${fullscreenHorizontalInset}; top: var(--rvn-window-content-offset, 0px); right: 0; bottom: 0;",
    );
    expect(dialogSurfaceView.match(/p=\$\{dialogPadding\}/g)).toHaveLength(4);
    expect(dialogSurfaceView).toContain(
      'rtgl-view slot=content tabindex=-1 autofocus pos=rel wh=f style="min-width: 0; min-height: 0; overflow: hidden; outline: none;"',
    );
    expect(dialogSurfaceView).toContain(
      'rtgl-view#overlay pos=fix edge=f style="z-index: 2000; background: transparent;"',
    );
    expect(dialogSurfaceView).toContain(
      "left: ${overlayHorizontalInset}; top: var(--rvn-window-content-offset, 0px); bottom: 0; width: ${panelWidth}; z-index: 2001; background: ${overlayBackground}; pointer-events: none;",
    );
    expect(dialogSurfaceView).toContain(
      "top: calc(var(--rvn-window-content-offset, 0px) + ${panelVerticalInset}); bottom: ${panelVerticalInset};",
    );
    expect(dialogSurfaceView).toContain(
      "height: calc(100vh - var(--rvn-window-content-offset, 0px) - ${panelVerticalInset} - ${panelVerticalInset});",
    );
    expect(dialogSurfaceView).toContain(
      "max-height: ${panelMaxHeight}; margin-block: auto;",
    );
    expect(dialogSurfaceView).toContain("pos=fix bgc=bg bw=xs bc=bo br=md");
    expect(
      dialogSurfaceView.match(/slot=content tabindex=-1 autofocus/g),
    ).toHaveLength(4);
    expect(dialogSurfaceView.match(/outline: none;/g)).toHaveLength(4);
    expect(dialogSurfaceView).toContain("z-index: 2002;");
    expect(dialogSurfaceView).not.toContain("handleDocumentKeyDown");
  });
});
