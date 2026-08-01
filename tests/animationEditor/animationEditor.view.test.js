import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("animationEditor view", () => {
  it("uses an outline navbar icon button for the back action", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/animationEditor/animationEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("rtgl-button#backButton sq pre=chevronLeft v=ol");
    expect(view).not.toContain(
      'rtgl-button#backButton sq pre="chevronLeft" v="gh"',
    );
    expect(view).toContain("rtgl-button#playButton");
    expect(view).toContain('aria-pressed="${previewPlaying}"');
    expect(view).toContain(
      "rtgl-button#previewLoopButton sq v=${previewLoopButtonVariant} pre=loop",
    );
    expect(view).toContain('aria-pressed="${previewLoopEnabled}"');
    expect(view).toContain('title="${loopPreviewLabel}"\': null');
    expect(view.indexOf("#previewLoopButton")).toBeLessThan(
      view.indexOf("#playButton"),
    );
  });

  it("uses dialogs on touch for add-property and keyframe forms", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/animationEditor/animationEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("$if showAddPropertyPopover");
    expect(view).toContain("$if showAddKeyframePopover");
    expect(view).toContain("$if showEditKeyframePopover");
    expect(view).toContain("rtgl-dialog#addPropertyDialog");
    expect(view).toContain("rtgl-dialog#addKeyframeDialog");
    expect(view).toContain("rtgl-dialog#editKeyframeDialog");
    expect(view).toContain("?open=${showAddPropertyDialog}");
    expect(view).toContain("?open=${showAddKeyframeDialog}");
    expect(view).toContain("?open=${showEditKeyframeDialog}");
    expect(view).not.toContain("$if popover.mode == 'addProperty'");
    expect(view).not.toContain("$if popover.mode == 'addKeyframe'");
    expect(view).not.toContain("$if popover.mode == 'editKeyframe'");
  });

  it("keeps the mask image selector compact with a fixed preview ratio", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/animationEditor/animationEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const selectorStart = view.indexOf("$if maskEditorPanel.singleImage");
    const selectorEnd = view.indexOf(
      "rtgl-text s=sm c=mu-fg: ${progressDurationLabel}",
      selectorStart,
    );
    const selectorBranch = view.slice(selectorStart, selectorEnd);

    expect(
      selectorBranch.match(/rtgl-view#singleMaskImageButton w=160/g),
    ).toHaveLength(2);
    expect(selectorBranch.match(/aspect-ratio: 16 \/ 9;/g)).toHaveLength(2);
    expect(selectorBranch).toContain("max-width: 100%;");
    expect(selectorBranch).not.toContain("singleMaskImageButton w=f");
    expect(selectorBranch).not.toContain("h=120");
    expect(selectorBranch).not.toContain("h=96");
  });

  it("shows keyframe details in the right panel and keeps legacy panels gated", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/animationEditor/animationEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("$if showRightPanel");
    expect(view).toContain(
      'rvn-resizable-panel#timelineDetailsPanel data-timeline-selection-surface=true panel-type=detail-panel w=270 min-w=200 max-w=500 resize-side="left"',
    );
    expect(view).toContain("rtgl-view#editorSurface");
    expect(view).toContain("handler: handleEditorSurfaceClick");
    expect(view).toContain("rvn-detail-view#selectedKeyframeDetails");
    expect(view).toContain(":fields=${selectedKeyframeDetailFields}");
    expect(view).toContain("rvn-detail-view#selectedPropertyDetails");
    expect(view).toContain(":fields=${selectedPropertyDetailFields}");
    expect(view).toContain(
      "rtgl-select#selectedKeyframeEasingSelect slot=keyframe-easing",
    );
    expect(view).toContain(
      "rtgl-view#selectedKeyframeDelay slot=keyframe-delay",
    );
    expect(view).toContain(
      "rtgl-view#selectedKeyframeDuration slot=keyframe-duration",
    );
    expect(view.indexOf("slot=keyframe-delay")).toBeLessThan(
      view.indexOf("slot=keyframe-duration"),
    );
    expect(view).toContain(
      "rtgl-view#selectedKeyframeValue slot=keyframe-value",
    );
    expect(view).toContain("rtgl-input-number#selectedKeyframeNumberInput");
    expect(view).toContain(
      "rtgl-popover#selectedKeyframeNumberPopover ?open=${selectedKeyframeNumberPopoverIsOpen}",
    );
    expect(view).toContain(
      "content-w=220 content-g=sm content-ph=md content-pv=md content-bgc=su",
    );
    expect(view).toContain("rtgl-button#selectedKeyframeNumberConfirm");
    expect(view).toContain(
      "rtgl-segmented-control#selectedKeyframeValueTypeSelect slot=keyframe-value-type",
    );
    expect(view).toContain("$if showMaskAndPreviewSections");
    expect(view).toContain(":selectedKeyframe=${selectedKeyframe}");
    expect(view).toContain(":selectedProperty=${selectedProperty}");
    expect(view).toContain("handler: handlePropertyNameRightClick");
  });

  it("places zoom controls before Add and makes the timeline scroll horizontally", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/animationEditor/animationEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view.indexOf("rtgl-slider#timelineZoomSlider")).toBeLessThan(
      view.indexOf("rtgl-button#addPropertiesButton"),
    );
    expect(view).toContain(
      "min=${timelineZoomMin} max=${timelineZoomMax} step=${timelineZoomStep} value=${timelineZoom}",
    );
    expect(view).toContain("rtgl-view d=v w=f h=1fg g=md");
    expect(view).toContain("rtgl-view#timelineScrollContainer w=f h=1fg sh");
    expect(view).toContain("handler: handleTimelineScroll");
    expect(view).not.toContain(
      'timelineScrollContainer w=f style="min-width: 0; overflow-x: auto',
    );
    expect(view).not.toContain("timelineScaleLabel");
    expect(view).toContain('style="${timelineCanvasStyle}"');
    expect(view).toContain("timelineDuration=${timelineDisplayDuration}");
    expect(view).not.toContain("timelineZoomPercent");
    expect(view).not.toContain("min-width: 100%");
    expect(view).toContain("d=v h=f pos=rel");
    expect(view).toContain("$if timelinePlayheadVisible");
    expect(view).toContain('style="${timelinePlayheadStyle}"');
    expect(view).toMatch(
      /position: sticky; left: 0; z-index: 6;[^\n]+[\s\S]+\$\{outTimelineLabel\}/,
    );
    expect(view).toMatch(
      /position: sticky; left: 0; z-index: 6;[^\n]+[\s\S]+\$\{inTimelineLabel\}/,
    );
  });
});
