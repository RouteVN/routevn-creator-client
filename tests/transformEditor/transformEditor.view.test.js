import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(
  new URL(
    "../../src/pages/transformEditor/transformEditor.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

describe("transform editor view", () => {
  it("has the layout editor's header: back, name, undo and redo, and zoom", () => {
    for (const line of [
      "rtgl-button#backButton sq pre=chevronLeft v=ol mr=sm: null",
      "rtgl-text w=f ellipsis=true: ${transformName}",
      'rtgl-button#undoButton sq pre=undo v=ol ?disabled=${undoDisabled} aria-label="${undoLabel}" title="${undoLabel}"',
      'rtgl-button#redoButton sq pre=redo v=ol ?disabled=${redoDisabled} aria-label="${redoLabel}" title="${redoLabel}"',
      "$if showCanvasZoomControls:",
      "rtgl-button#canvasZoomResetButton",
    ]) {
      expect(view).toContain(line);
    }
  });

  it("edits on a zoomable canvas with the scene editor's transform inspector", () => {
    // One canvas for every layout, so turning a tablet keeps it in place.
    expect(view.match(/div#canvas /g)).toHaveLength(1);
    expect(view).toContain(
      "rvn-zoom-viewport#canvasBackground zoom=${canvasZoom} ?gestures=${showCanvasZoomControls}",
    );
    // Tablet landscape keeps the right panel, as in the layout editor.
    expect(view).toContain(
      'rvn-resizable-panel panel-type=detail-panel show-on-touch w=300 min-w=200 max-w=500 resize-side="left":',
    );
    expect(view).toContain("$if showMobilePanels:");
    // The inspector shows in the right panel, or under the canvas on phones
    // and tablet portrait.
    expect(
      view.match(
        /rvn-layout-edit-panel#transformInspector mode=transform :projectResolution=\$\{projectResolution\} :selectedElementMetrics=\$\{selectedElementMetrics\} :values=\$\{inspectorValues\}: null/g,
      ),
    ).toHaveLength(2);
    expect(
      view.match(
        /rtgl-view#previewImageButton\$\{i\} data-slot=\$\{item\.slot\}/g,
      ),
    ).toHaveLength(4);
  });

  it("switches between Edit and Preview like the layout editor", () => {
    // The tabs head the right panel, or the panel under the canvas in tablet
    // portrait, or sit in the navbar on phones. Preview images save on their
    // own, so there is no Save Preview.
    expect(
      view.match(
        /rtgl-tabs#rightPanelModeTabs s=sm selected-tab=\$\{rightPanelMode\} :items=\$\{rightPanelModeTabs\}: null/g,
      ),
    ).toHaveLength(3);
    expect(view).not.toContain("savePreview");
    expect(view.match(/\$\{rightPanelEditStyle\}/g)).toHaveLength(2);
    expect(view.match(/\$\{rightPanelPreviewStyle\}/g)).toHaveLength(2);
  });

  it("keeps the image folder list out of the touch image picker", () => {
    const pickerStart = view.indexOf("rtgl-dialog#imageSelectorDialog");
    const picker = view.slice(pickerStart, view.indexOf("$when:", pickerStart));

    expect(picker).toContain("$if showImageSelectorFileExplorer:");
    expect(picker).toContain(
      "rvn-base-file-explorer#imageSelectorFileExplorer",
    );
    expect(picker).not.toContain("cancel");
  });
});
