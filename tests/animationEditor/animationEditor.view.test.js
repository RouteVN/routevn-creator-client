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

  it("keeps the keyframe dialog available for touch and context-menu edits", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/animationEditor/animationEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("$if showAddPropertyPopover");
    expect(view).toContain("$if showAddKeyframePopover");
    expect(view).not.toContain("$if showEditKeyframePopover");
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
      selectorBranch.match(/rtgl-view#singleMaskImageButton[^\n]* w=160/g),
    ).toHaveLength(2);
    expect(selectorBranch.match(/aspect-ratio: 16 \/ 9;/g)).toHaveLength(2);
    expect(selectorBranch).toContain("max-width: 100%;");
    expect(selectorBranch).not.toContain("singleMaskImageButton w=f");
    expect(selectorBranch).not.toContain("h=120");
    expect(selectorBranch).not.toContain("h=96");
  });

  it("shows keyframe and mask details beside the Tween and Preview tabs", () => {
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
    expect(view).toContain("$if detailsPanelTitle");
    expect(view).toContain("rtgl-view#timelineDetailsHeader h=48");
    expect(view).toContain("rtgl-text s=sm c=mu-fg ta=c: ${noSelectionLabel}");
    expect(view).not.toContain("${selectTimelineItemPrompt}");
    expect(view).toContain("rtgl-button#editSelectedKeyframeButton");
    expect(view).toContain("handler: handleSelectedKeyframeEditClick");
    expect(view).not.toContain("selectedKeyframeEasingSelect");
    expect(view).not.toContain("selectedKeyframeDelay slot=keyframe-delay");
    expect(view).not.toContain(
      "selectedKeyframeDuration slot=keyframe-duration",
    );
    expect(view).not.toContain("selectedKeyframeValue slot=keyframe-value");
    expect(view).toContain("rtgl-input-number#selectedMaskNumberInput");
    expect(view).toContain(
      "rtgl-popover#selectedMaskNumberPopover ?open=${selectedMaskNumberPopoverIsOpen}",
    );
    expect(view).toContain(
      "content-w=220 content-g=sm content-ph=md content-pv=md content-bgc=su",
    );
    expect(view).toContain("rtgl-button#selectedMaskNumberConfirm");
    expect(view).toContain(
      'rtgl-view#animationEditorTabs role=tablist aria-label="${editorPanelsLabel}"',
    );
    expect(view).toContain(
      "rtgl-view#animationEditorTab${i}.animationEditorTab role=tab",
    );
    expect(view).toContain("handler: handleEditorTabKeyDown");
    expect(view).toContain("$if selectedEditorTab == 'tween'");
    expect(view).not.toContain("$elif selectedEditorTab == 'mask'");
    expect(view).toContain("rtgl-view#animationTweenPanel");
    expect(view).not.toContain("rtgl-view#animationMaskPanel");
    expect(view).toContain("rtgl-view#animationPreviewPanel");
    expect(view).toContain("rtgl-view#maskTimelineRow");
    expect(view).toContain("role=button tabindex=0 aria-pressed");
    expect(view).toContain("handler: handleMaskTimelineRowClick");
    expect(view).toContain("handler: handleMaskTimelineRowKeyDown");
    expect(view).toContain("$elif selectedMask");
    expect(view).toContain("rtgl-view#selectedMaskDetails");
    expect(view).toContain("rtgl-view#selectedMaskSoftness");
    expect(view).toContain("handler: handleSelectedMaskSoftnessClick");
    expect(view).toContain("rtgl-view#selectedMaskProgressDuration");
    expect(view).toContain("handler: handleSelectedMaskProgressDurationClick");
    expect(view).toContain("$if showSelectedMaskSoftnessPopover");
    expect(view).toContain("$if showSelectedMaskProgressDurationPopover");
    expect(view).toContain("min=0 step=0.01 value=${popover.formValues.value}");
    expect(view).toContain("min=1 step=1 value=${popover.formValues.value}");
    expect(view).toContain("?disabled=${addMaskDisabled}");
    expect(view).not.toContain("handler: handleSingleMaskImageRightClick");
    expect(
      view.match(/div\.animationPreviewImageThumbnailTransparencyGrid/g),
    ).toHaveLength(2);
    expect(view).toContain(
      "previewImageButton${i} data-target=${item.target} cur=pointer bw=xs",
    );
    expect(view).toContain(
      "previewDialogImageButton${i} data-target=${item.target} cur=pointer bw=xs",
    );
    expect(view).toContain("br=md w=160 overflow=hidden");
    expect(view.match(/rtgl-view w=f p=md:/g)).toHaveLength(2);
    expect(view).not.toContain("rtgl-segmented-control#maskKindSelect");
    expect(view).toContain("rtgl-input#maskSoftnessInput type=number");
    expect(view).toContain("rtgl-select#maskProgressEasingSelect w=f no-clear");
    expect(view).toContain("rtgl-view d=v w=f g=md pb=xl");
    expect(view).not.toContain("editMaskButton");
    expect(view).not.toContain("cancelMaskButton");
    expect(view).toContain("popover.mode == 'editMask'");
    expect(view).not.toContain("rtgl-text: ${tweenPropertiesTitle}");
    expect(view).not.toContain("rtgl-text w=1fg: ${maskTitle}");
    expect(view).not.toContain("rtgl-text w=1fg: ${previewTitle}");
    expect(view).toContain("handler: handleEditorTabClick");
    expect(view).not.toContain("showMaskAndPreviewSections");
    expect(view).toContain(":selectedKeyframe=${selectedKeyframe}");
    expect(view).toContain(":selectedProperty=${selectedProperty}");
    expect(view).toContain("handler: handlePropertyNameRightClick");
  });

  it("places zoom controls before Add and lets the timeline scroll on both axes", () => {
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
    expect(view).toContain("rtgl-view#timelineScrollContainer w=f h=1fg sh sv");
    expect(view).toContain("handler: handleTimelineScroll");
    expect(view).toContain("handler: handleTimelinePanStart");
    expect(view).toContain("handler: handleTimelinePanMove");
    expect(view).toContain("handler: handleTimelinePanEnd");
    expect(view).toContain("cur=${timelinePanCursor}");
    expect(view).not.toContain(
      'timelineScrollContainer w=f style="min-width: 0; overflow-x: auto',
    );
    expect(view).not.toContain("timelineScaleLabel");
    expect(view).toContain('style="${timelineCanvasStyle} min-height: 100%;"');
    expect(view.match(/rtgl-view h=32 style="flex-shrink: 0;"/g)).toHaveLength(
      2,
    );
    expect(view).toContain(
      'rtgl-view w=f bgc=bg style="position: sticky; top: 0; z-index: 7;"',
    );
    expect(view).toContain("timelineDuration=${timelineDisplayDuration}");
    expect(view).not.toContain("timelineZoomPercent");
    expect(view).not.toContain("min-width: 100%");
    expect(view).not.toContain("d=v h=f pos=rel");
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
