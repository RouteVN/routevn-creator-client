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
    expect(view).toContain(
      "rtgl-button#addPropertyButton pre=plus s=sm aria-haspopup=menu",
    );
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
    expect(view).toContain("rtgl-view#editorTabs role=tablist");
    expect(view).toContain("$for item, i in editorTabs");
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
    expect(view).toContain("rtgl-button#playButton");
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
    expect(view).toContain("rtgl-slider#timelineZoomSlider");
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
});
