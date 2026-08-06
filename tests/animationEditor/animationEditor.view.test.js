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
    expect(view).toContain("rtgl-dialog#editAutoDialog");
    expect(view).toContain("?open=${showAddPropertyDialog}");
    expect(view).toContain("?open=${showAddKeyframeDialog}");
    expect(view).toContain("?open=${showEditKeyframeDialog}");
    expect(view).toContain("?open=${showEditAutoDialog}");
    expect(view).not.toContain("$if popover.mode == 'addProperty'");
    expect(view).not.toContain("$if popover.mode == 'addKeyframe'");
    expect(view).not.toContain("$if popover.mode == 'editKeyframe'");
    expect(view).not.toContain("$if popover.mode == 'editAuto'");
    expect(view).toContain("auto-duration-change:");
    expect(view).toContain("handler: handleAutoDurationChange");
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
      "                        $else:\n                          - rtgl-view w=f h=f",
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
    expect(view).toContain(
      "width: ${previewCanvasMaxWidth}; max-width: 100%; margin-left: auto; margin-right: auto; aspect-ratio: ${canvasAspectRatio};",
    );
    expect(view).toContain("handler: handleEditorSurfaceClick");
    expect(view).toContain("rvn-detail-view#selectedKeyframeDetails");
    expect(view).toContain(":fields=${selectedKeyframeDetailFields}");
    expect(view).toContain("rvn-detail-view#selectedPropertyDetails");
    expect(view).toContain(":fields=${selectedPropertyDetailFields}");
    expect(view).toContain("$if detailsPanelTitle");
    expect(view).toContain("rtgl-view#timelineDetailsHeader h=48");
    expect(view).toContain(
      'rtgl-button#selectedMaskDeleteButton sq v=gh pre=trash aria-label="${removeButton}" title="${removeButton}"',
    );
    expect(view).toContain("handler: handleMaskRemoveRequestClick");
    expect(view).toContain(
      'rtgl-button#selectedPropertyDeleteButton sq v=gh pre=trash aria-label="${deletePropertyButtonLabel}" title="${deletePropertyButtonLabel}"',
    );
    expect(view).toContain("handler: handleSelectedPropertyDeleteClick");
    expect(view).toContain("rtgl-dialog#propertyRemoveConfirmDialog");
    expect(view).toContain("?open=${propertyRemoveConfirmDialogOpen}");
    expect(view).toContain("handler: handlePropertyRemoveConfirmDialogClose");
    expect(view).toContain("handler: handlePropertyRemoveConfirmClick");
    expect(view).toContain("rtgl-text s=sm c=mu-fg ta=c: ${noSelectionLabel}");
    expect(view).not.toContain("${selectTimelineItemPrompt}");
    expect(view).toContain("rtgl-button#editSelectedKeyframeButton");
    expect(view).toContain("rtgl-select#selectedKeyframeEasingSelect");
    expect(view).toContain("handler: handleSelectedKeyframeEasingChange");
    expect(view).toContain("data-popover-input-field=true slot=keyframe-delay");
    expect(view).toContain(
      "rvn-value-popover-input#selectedKeyframeDelay value=${selectedKeyframeEditor.delay}",
    );
    expect(view).toContain(
      "data-popover-input-field=true slot=keyframe-duration",
    );
    expect(view).toContain(
      "rtgl-slider-input#selectedKeyframeValue slot=keyframe-value",
    );
    expect(view).toContain("data-popover-input-field=true slot=keyframe-value");
    expect(view).toContain(
      "rtgl-segmented-control#selectedKeyframeRelative slot=keyframe-value-type",
    );
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
      'animationEditorTabs role=tablist aria-label="${editorPanelsLabel}" d=h g=sm bgc=mu p=sm br=lg w=fit-content',
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
    expect(view).toContain("rtgl-view#maskTimelineCategory");
    expect(view).toContain("$if previousTimelineVisible");
    expect(view).toContain("$if nextTimelineVisible");
    expect(view).toContain("$if maskTimelineVisible");
    expect(view).toContain("$if activeTimelineEmpty");
    expect(view.match(/\$if !activeTimelineEmpty/g)).toHaveLength(2);
    expect(view).toContain("rtgl-view#emptyTimelineAddPropertiesButton");
    expect(view).toContain("w=f h=200 av=c ah=c g=md bw=xs bc=bo br=md");
    expect(view).toContain("rtgl-svg svg=plus wh=24");
    expect(view).toContain("rtgl-text: ${addPropertyButtonLabel}");
    expect(view).toContain("handler: handleAddPropertiesClick");
    expect(view).toContain("handler: handleEmptyTimelineAddPropertiesKeyDown");
    expect(view).toContain("rtgl-text s=sm c=mu-fg: ${maskTitle}");
    expect(view).toContain("rtgl-view w=72 av=c ah=s pl=sm");
    expect(view).not.toContain("rtgl-view w=72 av=c ah=c");
    expect(view).toContain("$for maskTimelineRow, i in maskTimelineRows");
    expect(view).toContain("rtgl-view#maskTrackRow${i}");
    expect(view).toContain(
      "rvn-keyframe-timeline#maskKeyframeTimeline${i} editable=true side=${maskTimelineRow.side}",
    );
    expect(view).toContain(
      ":properties=${maskTimelineRow.properties} :defaultValues=${maskTimelineDefaultValues}",
    );
    const maskTimelineListeners = view.slice(
      view.indexOf("  maskKeyframeTimeline*:"),
      view.indexOf("  addPropertyPopover:"),
    );
    expect(maskTimelineListeners).not.toContain(
      "handler: handleInitialValueClick",
    );
    expect(view).not.toContain("rtgl-view#maskTimelineRow${i}");
    expect(view).toContain("handler: handleMaskTimelineRowClick");
    expect(view).toContain("handler: handleMaskTimelineRowKeyDown");
    expect(view).toContain("$elif selectedMask");
    expect(view).toContain(
      "rtgl-button#editSelectedKeyframeButton sq v=gh pre=edit",
    );
    expect(view).toContain("rtgl-view#selectedMaskDetails");
    expect(view).toContain("rtgl-view#selectedMaskSoftness");
    expect(view).toContain("handler: handleSelectedMaskSoftnessClick");
    expect(view).toContain("rtgl-view#selectedMaskInitialValue");
    expect(view).toContain("handler: handleSelectedMaskInitialValueClick");
    expect(view).toContain(
      "rtgl-view slot=property-initial-value d=v w=f g=xs",
    );
    expect(view).toContain(
      "rtgl-slider-input#selectedPropertyInitialValue key=${selectedPropertyDetailId}",
    );
    expect(view).toContain("data-popover-input-field=true w=f h=32");
    expect(view).toContain(
      "rtgl-button#selectedPropertyUseDefault s=sm v=se w=f",
    );
    expect(view).toContain(
      "rvn-value-popover-input#selectedPropertyAutoDuration",
    );
    expect(view).toContain("rtgl-select#selectedPropertyAutoEasing");
    expect(view).toContain("handler: handleSelectedPropertyAutoDurationChange");
    expect(view).toContain("handler: handleSelectedPropertyAutoEasingChange");
    expect(view.match(/data-popover-input-field=true/g)).toHaveLength(5);
    expect(view.match(/rvn-value-popover-input#/g)).toHaveLength(5);
    expect(view).toContain("handler: handleSelectedPropertyInitialValueChange");
    expect(view).toContain("handler: handleSelectedPropertyUseDefaultClick");
    expect(view).not.toContain("rtgl-view#selectedMaskProgressDuration");
    expect(view).not.toContain(
      "handler: handleSelectedMaskProgressDurationClick",
    );
    expect(view).toContain("$if showSelectedMaskSoftnessPopover");
    expect(view).toContain("$if showSelectedMaskInitialValuePopover");
    expect(view).not.toContain("showSelectedMaskProgressDurationPopover");
    expect(view).toContain("min=0 step=0.01 value=${popover.formValues.value}");
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
    expect(view).toContain("$if popover.mode == 'addMask':");
    const selectedMaskBranchStart = view.indexOf("$elif selectedMask:");
    const selectedMaskBranchEnd = view.indexOf(
      "                        $else:\n                          - rtgl-view w=f h=f",
      selectedMaskBranchStart,
    );
    const selectedMaskBranch = view.slice(
      selectedMaskBranchStart,
      selectedMaskBranchEnd,
    );
    expect(selectedMaskBranch).toContain(
      "rtgl-segmented-control#maskChannelSelect",
    );
    expect(selectedMaskBranch).toContain(
      "rtgl-segmented-control#maskInvertSelect",
    );
    expect(selectedMaskBranch).toContain("rtgl-view#selectedMaskSoftness");
    expect(selectedMaskBranch).toContain("rtgl-view#singleMaskImageButton");
    expect(selectedMaskBranch).not.toContain("rtgl-button#disableMaskButton");
    expect(selectedMaskBranch).not.toContain("maskProgressDurationInput");
    expect(selectedMaskBranch).not.toContain("maskProgressEasingSelect");
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
    expect(view).not.toContain("handler: handlePropertyNameRightClick");
    expect(view).not.toContain("property-name-right-click");
  });

  it("places tab actions in the toolbar and lets the timeline scroll on both axes", () => {
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
    const toolbarStart = view.indexOf("rtgl-view#animationEditorToolbar");
    const tweenPanelStart = view.indexOf("rtgl-view#animationTweenPanel");
    const previewPanelStart = view.indexOf("rtgl-view#animationPreviewPanel");
    expect(toolbarStart).toBeGreaterThan(-1);
    expect(view.indexOf("rtgl-view#animationEditorTabs")).toBeGreaterThan(
      toolbarStart,
    );
    expect(view.indexOf("rtgl-slider#timelineZoomSlider")).toBeGreaterThan(
      toolbarStart,
    );
    expect(view.indexOf("rtgl-button#addPropertiesButton")).toBeLessThan(
      tweenPanelStart,
    );
    expect(view.indexOf("rtgl-button#savePreviewButton")).toBeGreaterThan(
      toolbarStart,
    );
    expect(view.indexOf("rtgl-button#savePreviewButton")).toBeLessThan(
      previewPanelStart,
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
    expect(view).toContain("handler: handleTimelineDurationExtend");
    expect(view).toContain("handler: handleTimelineUsedDurationPreview");
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
    expect(view).toContain("usedDuration=${activeTimelineDuration}");
    expect(
      view.match(
        /rtgl-view pos=abs bgc=su style="\$\{timelineUsedAreaStyle\}"/g,
      ),
    ).toHaveLength(2);
    expect(view.match(/data-timeline-property-column-fill=true/g)).toHaveLength(
      2,
    );
    expect(view).toContain(
      'rtgl-view h=f w=104 bgc=bg style="min-width: 104px; position: sticky; left: 0;"',
    );
    expect(view).not.toContain("timelineZoomPercent");
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
