import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(
  new URL(
    "../../src/pages/particleEditor/particleEditor.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

const count = (pattern) => view.match(pattern)?.length ?? 0;

describe("particle editor view", () => {
  it("has the layout editor's header: back, name, undo and redo, and zoom", () => {
    for (const line of [
      "rtgl-button#backButton sq pre=chevronLeft v=ol mr=sm: null",
      "rtgl-text w=f ellipsis=true: ${particleName}",
      'rtgl-button#undoButton sq pre=undo v=ol ?disabled=${undoDisabled} aria-label="${undoLabel}" title="${undoLabel}"',
      'rtgl-button#redoButton sq pre=redo v=ol ?disabled=${redoDisabled} aria-label="${redoLabel}" title="${redoLabel}"',
      "$if showCanvasZoomControls:",
      "rtgl-button#canvasZoomResetButton",
    ]) {
      expect(view).toContain(line);
    }
  });

  it("edits on one zoomable canvas, with a texture hint that lets drags through", () => {
    // One canvas for every layout, so turning a tablet keeps it in place.
    expect(count(/div#canvas /g)).toBe(1);
    expect(view).toContain(
      "rvn-zoom-viewport#canvasBackground zoom=${canvasZoom} ?gestures=${showCanvasZoomControls}",
    );
    const hint = view
      .split("\n")
      .find((line) => line.includes("${textureHint}"));
    expect(hint).toContain("position: absolute; inset: 0;");
    expect(hint).toContain("pointer-events: none;");
  });

  it("keeps the Edit and Preview panel on the right, or under the canvas", () => {
    expect(view).toContain(
      'rvn-resizable-panel panel-type=detail-panel show-on-touch w=300 min-w=200 max-w=500 resize-side="left":',
    );
    expect(view).toContain("$if showMobilePanels:");
    // The tabs, the sub-tabs, the form and the preview
    // background show in either place.
    expect(
      count(
        /rtgl-tabs#rightPanelModeTabs s=sm selected-tab=\$\{rightPanelMode\} :items=\$\{rightPanelModeTabs\}: null/g,
      ),
    ).toBe(2);
    // The preview background saves on its own, so there is no Save Preview.
    expect(view).not.toContain("savePreview");
    expect(
      count(
        /rtgl-tabs#formTabs s=sm selected-tab=\$\{formTab\} :items=\$\{formTabs\}: null/g,
      ),
    ).toBe(2);
    expect(
      count(
        /rtgl-form#particleForm key=\$\{particleFormKey\} :defaultValues=\$\{formValues\} :form=\$\{particleForm\} w=f ph=md:/g,
      ),
    ).toBe(2);
    expect(count(/rtgl-view slot=particle-texture-image/g)).toBe(2);
    expect(count(/rtgl-view#backgroundImageButton /g)).toBe(4);
    expect(count(/\$\{rightPanelEditStyle\}/g)).toBe(2);
    expect(count(/\$\{rightPanelPreviewStyle\}/g)).toBe(2);
  });

  it("opens the texture picker from a keyboard-reachable card", () => {
    expect(
      count(
        /rtgl-view#textureImageButton role=button tabindex=0 aria-haspopup=dialog aria-label="\$\{textureImageLabel\}"/g,
      ),
    ).toBe(4);
    expect(view).toContain(
      "rvn-file-image w=f h=f fileId=${textureImage.previewFileId}: null",
    );
  });

  it("keeps the image folder list out of the touch image picker", () => {
    const pickerStart = view.indexOf("rtgl-dialog#imageSelectorDialog");
    const picker = view.slice(pickerStart, view.indexOf("$when:", pickerStart));

    expect(picker).toContain("$if showImageSelectorFileExplorer:");
    expect(picker).toContain(
      "rvn-base-file-explorer#imageSelectorFileExplorer",
    );
    expect(picker).toContain(
      "rtgl-button#confirmImageSelection variant=pr: ${selectButton}",
    );
  });
});
