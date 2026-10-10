import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("audioEffectsEditor view", () => {
  it("edits transition properties through timelines and the detail panel", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/audioEffectsEditor/audioEffectsEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("rvn-keyframe-timeline#previousTimeline");
    expect(view).toContain("rvn-keyframe-timeline#nextTimeline");
    expect(view).toContain("${outgoingTimelineLabel}");
    expect(view).toContain("${incomingTimelineLabel}");
    // Add reads as in the animation editor, at its size, and names what it
    // adds.
    expect(view).toContain(
      'rtgl-button#addPropertyButton pre=plus aria-haspopup=menu aria-expanded="${addPropertySideMenu.open}" aria-label="${addPropertyButton}" title="${addPropertyButton}"\': ${addButton}',
    );
    expect(view).not.toContain("${addPropertyButton}': ${addPropertyButton}");
    expect(view).toContain("rtgl-dropdown-menu#addPropertySideMenu");
    expect(view).not.toContain("#addPreviousPropertyButton");
    expect(view).not.toContain("#addNextPropertyButton");
    expect(view).not.toContain("${previousTimelineLabel}");
    expect(view).not.toContain("${nextTimelineLabel}");
    expect(view).toContain("rvn-detail-view#selectedKeyframeDetails");
    expect(view).toContain("rvn-detail-view#selectedPropertyDetails");
    expect(view).toContain(
      "rtgl-button#selectedKeyframeAddButton sq v=gh pre=plus aria-haspopup=menu",
    );
    expect(view).toContain(
      "rtgl-button#selectedKeyframeRemoveStartValueButton sq v=gh pre=x",
    );
    expect(view).toContain("rtgl-slider-input#selectedKeyframeStartValue");
    expect(view).toContain("rtgl-input-number#selectedKeyframeStartValue");
    expect(view).toContain("$if selectedKeyframeEditor.startValueSlider:");
    expect(view).toContain(
      "min=${selectedKeyframeEditor.startValueSlider.min}",
    );
    expect(view).toContain("rtgl-dropdown-menu#selectedKeyframeAddMenu");
    expect(view).toContain("rtgl-slider-input#selectedPropertyInitialValue");
    expect(view).toContain("rtgl-input-number#selectedPropertyInitialValue");
    expect(view).toContain(
      "rtgl-segmented-control#selectedPropertyValueSource",
    );
    expect(view).toContain("$if selectedPropertyEditor.hasInitialValue");
    expect(view).toContain("rtgl-text s=sm c=mu-fg ta=c: ${noSelectionLabel}");
    expect(view).toContain(
      'rtgl-tabs#editorTabs aria-label="${editorPanelsLabel}" selected-tab=${selectedEditorTab} :items=${editorTabs}',
    );
    expect(view).not.toContain("$for item, i in editorTabs");
    expect(view).not.toContain("handleEditorTabKeyDown");
    expect(view).toContain(
      'rtgl-view#audioEffectPreviewPanel role=tabpanel aria-label="${previewTabLabel}"',
    );
    expect(view).toContain("$if selectedEditorTab == 'timeline'");
    expect(view).toContain("rtgl-view#audioEffectPreviewPanel");
    expect(view).toContain("${item.label}");
    expect(view).toContain("${item.sound.name}");
    expect(view).toContain("rvn-sound-selector#soundSelector");
    expect(view).toContain(
      "rtgl-dialog#soundSelectorDialog ?open=${previewSoundSelectorOpen} s=lg",
    );
    expect(view).toContain("rtgl-button#confirmSoundSelection variant=pr");
    expect(view).toContain("handler: handleConfirmSoundSelection");
    expect(view.indexOf("#confirmSoundSelection")).toBeGreaterThan(
      view.indexOf("#soundSelector"),
    );
    expect(
      view.match(/\.audioEffectPreviewSoundButton data-target=/g),
    ).toHaveLength(2);
    expect(view).toContain('".audioEffectPreviewSoundButton:focus"');
    expect(view).toContain('".audioEffectPreviewSoundButton:focus-visible"');
    expect(view).toContain(
      'rtgl-button#playButton sq v=se pre=${playButtonIcon} aria-label="${playButton}"',
    );
    expect(view).not.toContain("rtgl-button#playButton s=sm");
    expect(view).toContain("handler: handlePlayClick");
    expect(view).toContain("rtgl-view#playButtonTooltipTrigger role=group");
    expect(view).toContain("handler: handlePlayButtonTooltipShow");
    expect(view).toContain("handler: handlePlayButtonTooltipHide");
    expect(view).toContain("rtgl-tooltip ?open=${playButtonTooltip.open}");
    expect(view).toContain('place="b" content="${playButtonDisabledReason}"');
    expect(view).toContain(
      "rtgl-button#previewLoopButton sq v=${previewLoopButtonVariant} pre=loop",
    );
    expect(view).toContain('aria-pressed="${previewLoopEnabled}"');
    expect(view).toContain("handler: handleTogglePreviewLoop");
    expect(view.indexOf("#previewLoopButton")).toBeLessThan(
      view.indexOf("#playButton"),
    );
    // Preview sounds save with the audio effect, so there is no Save Preview.
    expect(view).not.toContain("savePreview");
    // Zoom opens its slider in a popover, as in the animation editor.
    expect(view).toContain(
      'rtgl-button#timelineZoomButton sq v=ol pre=zoomIn mr=md aria-haspopup=dialog aria-expanded="${timelineZoomPopover.open}"',
    );
    expect(view).toContain("handler: handleTimelineZoomButtonClick");
    expect(view).toContain("handler: handleTimelineZoomPopoverClose");
    expect(
      view.indexOf("rtgl-slider#timelineZoomSlider w=1fg"),
    ).toBeGreaterThan(view.indexOf("rtgl-popover#timelineZoomPopover"));
    expect(view).toContain("handler: handleTimelineZoomIn");
    expect(view).toContain("handler: handleTimelineZoomOut");
    expect(view).toContain("rtgl-dropdown-menu#keyframeDropdownMenu");
    expect(view).toContain("handler: handleKeyframeDropdownItemClick");
    expect(view).toContain("handler: handleKeyframeMenuClose");
    expect(view.match(/handler: handlePropertyNameClick/g)).toHaveLength(3);
    expect(view).toContain("handler: handleSelectedPropertyInitialValueChange");
    expect(view).toContain("handler: handleSelectedPropertyValueSourceChange");
    expect(view).toContain("handler: handleSelectedKeyframeStartValueChange");
    expect(view).toContain(
      "handler: handleSelectedKeyframeRemoveStartValueClick",
    );
    expect(view).toContain("handler: handleSelectedKeyframeAddMenuItemClick");
    expect(view.match(/handler: handleAddKeyframeFromTimeline/g)).toHaveLength(
      3,
    );
    expect(view).toContain("?indicatorVisible=${timelinePlayheadVisible}");
    expect(view).toContain('style="${timelinePlayheadStyle}"');
    expect(view).toContain("rtgl-view#audioEffectsEditorToolbar d=h w=f av=c");
    expect(view).toContain("rtgl-view#timelineScrollContainer w=f h=1fg sh sv");
    expect(view).toContain('style="${timelineCanvasStyle} min-height: 100%;"');
    expect(view.match(/data-timeline-property-column-fill=true/g)).toHaveLength(
      2,
    );
    expect(
      view.match(
        /rtgl-view pos=abs bgc=su style="\$\{timelineUsedAreaStyle\}"/g,
      ),
    ).toHaveLength(2);
    expect(view).toContain("?showTotalDuration=false");
    expect(view).toContain('position: sticky; left: 0; z-index: 6;"');
    expect(view).not.toContain("av=c p=md g=md bwb=xs bc=bo");
    expect(view).not.toContain("rtgl-button#saveButton");
    expect(view).not.toContain("transitionForm");
    expect(view).not.toContain("editorDescription");
  });

  it("offers undo and redo in the header between the name and preview controls", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/audioEffectsEditor/audioEffectsEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const template = view.slice(view.indexOf("template:"));

    expect(template).toContain(
      'rtgl-button#undoButton sq pre=undo v=ol ?disabled=${undoDisabled} aria-label="${undoLabel}" title="${undoLabel}"',
    );
    expect(template).toContain(
      'rtgl-button#redoButton sq pre=redo v=ol ?disabled=${redoDisabled} aria-label="${redoLabel}" title="${redoLabel}"',
    );
    expect(template.indexOf("${effectTypeLabel}")).toBeLessThan(
      template.indexOf("#undoButton"),
    );
    expect(template.indexOf("#redoButton")).toBeLessThan(
      template.indexOf("#previewLoopButton"),
    );
    expect(view).toMatch(
      /undoButton:\n\s+eventListeners:\n\s+click:\n\s+handler: handleUndoButtonClick/,
    );
    expect(view).toMatch(
      /redoButton:\n\s+eventListeners:\n\s+click:\n\s+handler: handleRedoButtonClick/,
    );
  });
  it("moves the tabs to the navbar on phones, and the navbar's buttons to the toolbar, as the animation editor does", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/audioEffectsEditor/audioEffectsEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const navbar = view.slice(
      view.indexOf("rtgl-button#backButton"),
      view.indexOf("div#audioPreviewCanvas"),
    );
    const toolbar = view.slice(
      view.indexOf("rtgl-view#audioEffectsEditorToolbar"),
      view.indexOf("rtgl-view#audioEffectTimelinePanel"),
    );
    const after = (text, marker, item) =>
      text.indexOf(item, text.indexOf(marker)) > text.indexOf(marker);

    for (const button of [
      "rtgl-button#undoButton",
      "rtgl-button#redoButton",
      "rtgl-button#previewLoopButton",
      "rtgl-button#playButton",
    ]) {
      expect(after(navbar, "$if showNavbarControls:", button)).toBe(true);
    }
    expect(
      after(navbar, "$if showNavbarEditorTabs:", "rtgl-tabs#editorTabs s=sm"),
    ).toBe(true);
    expect(
      after(
        toolbar,
        "$if showToolbarEditorTabs:",
        "rtgl-tabs#editorTabs aria-label",
      ),
    ).toBe(true);
    // On phones: zoom, Loop and Play on the left, evenly spaced in one
    // group; then undo and redo, and Add last. Tablets and desktop keep zoom
    // just before Add.
    const order = [
      "$if showToolbarPlayback:",
      "rtgl-view d=h av=c g=xs:",
      "$if showLeadingTimelineZoom:",
      "rtgl-button#timelineZoomButton sq v=ol pre=zoomIn aria-haspopup",
      "rtgl-button#previewLoopButton",
      "rtgl-button#playButton",
      "rtgl-view w=1fg: null",
      "$if showToolbarEditHistory:",
      "rtgl-button#undoButton",
      "rtgl-button#redoButton",
      "$if showTrailingTimelineZoom:",
      "rtgl-button#addPropertyButton",
    ].map((item) => toolbar.indexOf(item));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(
      after(
        toolbar,
        "$if showTrailingTimelineZoom:",
        "rtgl-button#timelineZoomButton",
      ),
    ).toBe(true);
  });
});
