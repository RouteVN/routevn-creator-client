import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(
  new URL(
    "../../src/pages/textStyleEditor/textStyleEditor.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

const count = (pattern) => view.match(pattern)?.length ?? 0;

describe("text style editor view", () => {
  it("has the editors' header: back, name, and undo and redo, without zoom", () => {
    for (const line of [
      "rtgl-button#backButton sq pre=chevronLeft v=ol mr=sm: null",
      "rtgl-text w=f ellipsis=true: ${textStyleName}",
      'rtgl-button#undoButton sq pre=undo v=ol ?disabled=${undoDisabled} aria-label="${undoLabel}" title="${undoLabel}"',
      'rtgl-button#redoButton sq pre=redo v=ol ?disabled=${redoDisabled} aria-label="${redoLabel}" title="${redoLabel}"',
    ]) {
      expect(view).toContain(line);
    }
    // The live preview draws at its own size, so there is nothing to zoom.
    expect(view).not.toContain("canvasZoom");
    expect(view).not.toContain("rvn-zoom-viewport");
  });

  it("draws one live preview for every layout, and listens for its font failures", () => {
    // One preview, so turning a tablet keeps it in place.
    expect(count(/rvn-font-preview#textStylePreview mode=live /g)).toBe(1);
    expect(view).toContain(":fileIds=${previewFontFileIds}");
    expect(view).toContain(
      "font-load-error:\n        handler: handlePreviewFontLoadError",
    );
    expect(view).toContain('style="${previewAreaStyle} ');
    // The preview box is half the preview area's height, centered in it.
    expect(view).toContain("flex-direction: column; justify-content: center;");
    // The preview text cannot be selected, and a long press opens no menu.
    expect(view).toContain(
      "user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;",
    );
    expect(view).toContain(
      'rtgl-view#textStylePreviewFrame w=f bw=xs bc=bo br=md style="${previewFrameStyle} flex: 0 0 auto; min-width: 0; min-height: 0; overflow: hidden;"',
    );
  });

  it("keeps the Edit and Preview panel on the right, or under the preview", () => {
    expect(view).toContain(
      'rvn-resizable-panel panel-type=detail-panel show-on-touch w=300 min-w=200 max-w=500 resize-side="left":',
    );
    expect(view).toContain("$if showMobilePanels:");
    // The tabs, the form with its selects, and the preview text show in
    // either place. The preview settings save on their own, so there is no
    // Save Preview.
    expect(
      count(
        /rtgl-tabs#rightPanelModeTabs s=sm selected-tab=\$\{rightPanelMode\} :items=\$\{rightPanelModeTabs\}: null/g,
      ),
    ).toBe(2);
    expect(view).not.toContain("savePreview");
    expect(
      count(
        /rtgl-form#textStyleForm key=\$\{textStyleFormKey\} :defaultValues=\$\{formValues\} :form=\$\{textStyleForm\} w=f ph=md:/g,
      ),
    ).toBe(2);
    // The preview aligns its text as the Preview tab's control sets it.
    expect(view).toContain("textAlign=${previewAlign}: null");
    expect(
      count(
        /rtgl-segmented-control#previewAlignControl w=f no-clear :selectedValue=\$\{previewAlign\} :options=\$\{previewAlignOptions\}/g,
      ),
    ).toBe(2);
    expect(view).toContain("handler: handlePreviewAlignChange");
    // The preview text can span several lines.
    expect(count(/rtgl-textarea#previewTextInput w=f rows=3 /g)).toBe(2);
    expect(count(/\$\{rightPanelEditStyle\}/g)).toBe(2);
    expect(count(/\$\{rightPanelPreviewStyle\}/g)).toBe(2);
  });

  it("offers to add a font or a color from the form's selects", () => {
    expect(count(/rtgl-select#fontSelect slot=text-style-font /g)).toBe(2);
    expect(count(/:addOption=\$\{addFontOption\}/g)).toBe(2);
    for (const [ref, slot, field] of [
      ["colorSelect", "text-style-color", "colorId"],
      ["outlineColorSelect", "text-style-outline-color", "strokeColorId"],
      ["shadowColorSelect", "text-style-shadow-color", "shadowColorId"],
    ]) {
      expect(
        count(
          new RegExp(
            `rtgl-select#${ref} slot=${slot} data-color-field=${field} `,
            "g",
          ),
        ),
      ).toBe(2);
    }
    expect(count(/:addOption=\$\{addColorOption\}/g)).toBe(6);
    expect(view).toContain(
      "add-option-click:\n        handler: handleColorSelectAddOptionClick",
    );
    expect(view).toContain(
      "add-option-click:\n        handler: handleFontSelectAddOptionClick",
    );
  });

  it("adds colors and fonts in dialogs with their own submit actions", () => {
    for (const dialogId of ["addColorDialog", "addFontDialog"]) {
      expect(view).toContain(`rtgl-dialog#${dialogId} ?open=\${`);
    }
    expect(view.match(/md-layout=fixed-top p=none/g)).toHaveLength(2);
    expect(view).toContain("rtgl-button#addColorSubmitButton");
    expect(view).toContain("rtgl-button#addFontSubmitButton");
    expect(view).toContain("rvn-drag-drop#fontDragDrop");
  });
});
