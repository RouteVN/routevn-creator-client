import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sceneEditorLexical view", () => {
  it("renders the project-language text count in the editor toolbar", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(
      'rtgl-text#sceneTextStats s=xs c=mu-fg style="white-space: nowrap;"',
    );
    expect(view).toContain("${sceneTextStatsLabel}");
  });

  it("renders a matching canvas download button after preview", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const previewButtonIndex = view.indexOf("rtgl-button#previewButton");
    const downloadButtonIndex = view.indexOf(
      "rtgl-button#downloadCanvasButton",
    );

    expect(downloadButtonIndex).toBeGreaterThan(previewButtonIndex);
    expect(view).toContain(
      "rtgl-button#downloadCanvasButton sq pre=download v=ol",
    );
    expect(view).toContain("handler: handleDownloadCanvasClick");
  });

  it("renders the mobile preview canvas without wrapper padding", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain('rtgl-view w=f style="min-width: 0;"');
    expect(view).not.toContain('rtgl-view w=f p=sm style="min-width: 0;"');
    expect(view).toContain("scroll-padding-bottom: 48px");
  });

  it("uses the larger ellipsis icon for section menus", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const icon = readFileSync(
      new URL("../../svg/ellipsisLarge.svg", import.meta.url),
      "utf8",
    );

    expect(view.match(/pre=ellipsisLarge/g)).toHaveLength(2);
    expect(view).not.toContain("pre=ellipsis: null");
    expect(icon.match(/r="2\.4"/g)).toHaveLength(3);
  });

  it("bounds the mobile actions dialog below the preview", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("dialog-variant=scene-editor-mobile");
    expect(view).toContain(
      'dialog-panel-top="${mobileSystemActionsDialogTop}"',
    );
    expect(view).toContain("dialog-panel-bottom=0px");
  });

  it("opens the section menu from empty space in the sections scroller", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("sceneEditorSectionsScroll:");
    expect(view).toContain("handler: handleSectionsEmptySpaceContextMenu");
  });
});
