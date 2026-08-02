import { describe, expect, it } from "vitest";
import { produce } from "immer";
import {
  PREVIEW_TRANSITION_ELEMENT_ID,
  PREVIEW_UPDATE_ELEMENT_ID,
  TRANSITION_PROPERTY_KEYS,
} from "../../src/pages/animationEditor/animationEditor.constants.js";
import {
  addKeyframe,
  addProperty,
  commitPendingTransitionMask,
  createInitialState,
  clearSelectedKeyframe,
  clearTimelineSelection,
  deleteKeyframe,
  deleteProperty,
  enableTransitionMask,
  moveKeyframeLeft,
  moveKeyframeRight,
  nudgeTimelineZoom,
  openDialog,
  selectAnimationRenderStateWithAnimations,
  selectAnimationResetState,
  selectPreviewDurationMs,
  selectPreviewData,
  selectSelectedEditorTab,
  selectSelectedKeyframeFormValues,
  selectTimelinePan,
  selectTimelinePanClickSuppressed,
  selectTimelinePanMode,
  selectTimelinePlayheadVisible,
  selectViewData,
  setImages,
  setPopover,
  setPreviewPlayhead,
  setPreviewImage,
  setProjectResolution,
  setSelectedEditorTab,
  setSelectedKeyframe,
  setSelectedKeyframeDelay,
  setSelectedKeyframeDuration,
  setSelectedKeyframeEasing,
  setSelectedKeyframeRelative,
  setSelectedKeyframeTiming,
  setSelectedKeyframeValue,
  setSelectedMask,
  setSelectedProperty,
  startPreviewPlayback,
  startTimelinePan,
  stopPreviewPlayback,
  stopTimelinePan,
  setTimelinePanMode,
  setTimelineScrollMetrics,
  setTimelineZoom,
  setTransitionMaskChannel,
  setTransitionMaskImage,
  setUiConfig,
  startPendingTransitionMask,
  togglePreviewLoop,
  updatePopoverFormValues,
} from "../../src/pages/animationEditor/animationEditor.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("animationEditor.store", () => {
  it("defaults to Tween and exposes Tween and Preview tabs", () => {
    const state = createInitialState();

    expect(selectSelectedEditorTab({ state })).toBe("tween");
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedEditorTab: "tween",
      editorTabs: [
        { id: "tween", label: "Tween" },
        { id: "preview", label: "Preview" },
      ],
    });

    setSelectedEditorTab({ state }, { tab: "mask" });
    expect(selectSelectedEditorTab({ state })).toBe("tween");

    setSelectedEditorTab({ state }, { tab: "preview" });
    expect(selectSelectedEditorTab({ state })).toBe("preview");

    setSelectedEditorTab({ state }, { tab: "unsupported" });
    expect(selectSelectedEditorTab({ state })).toBe("preview");

    openDialog({ state }, { dialogType: "update" });
    expect(selectSelectedEditorTab({ state })).toBe("tween");
  });

  it("switches the preview button between Play and Pause", () => {
    const state = createInitialState();

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      playButton: "Play",
      previewPlaying: false,
    });

    startPreviewPlayback(
      { state },
      { startedAtMs: 100, durationMs: 1000, timeMs: 400 },
    );
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      playButton: "Pause",
      previewPlaying: true,
    });

    stopPreviewPlayback({ state }, { preservePlayhead: true });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      playButton: "Play",
      previewPlaying: false,
    });
    expect(state.previewPlayheadTimeMs).toBe(400);
    expect(state.previewPlayheadVisible).toBe(true);
  });

  it("toggles preview looping and exposes the loop button state", () => {
    const state = createInitialState();

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      previewLoopEnabled: false,
      previewLoopButtonVariant: "ol",
      loopPreviewLabel: "Loop preview",
    });

    togglePreviewLoop({ state });

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      previewLoopEnabled: true,
      previewLoopButtonVariant: "pr",
    });
  });

  it("clears the selected keyframe", () => {
    const state = createInitialState();
    state.selectedKeyframe = { side: "update", property: "x", index: 0 };

    clearSelectedKeyframe({ state });

    expect(state.selectedKeyframe).toBeUndefined();
  });

  it("positions the playhead across the full timeline canvas", () => {
    const state = createInitialState();
    state.tweenBySection.update.x = {
      keyframes: [{ duration: 1000, value: 10 }],
    };
    setPreviewPlayhead({ state }, { timeMs: 500, visible: true });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.timelinePlayheadVisible).toBe(true);
    expect(viewData.timelinePlayheadStyle).toContain("top: 10px; bottom: 0");
    expect(viewData.timelinePlayheadStyle).toContain(
      "left: calc(104px + (100% - 104px) * 0.5)",
    );
  });

  it("positions the playhead against the minimum one-second timeline scale", () => {
    const state = createInitialState();
    state.tweenBySection.update.x = {
      keyframes: [{ duration: 500, value: 10 }],
    };
    setPreviewPlayhead({ state }, { timeMs: 500, visible: true });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.timelineDisplayDuration).toBe(1000);
    expect(viewData.timelinePlayheadStyle).toContain(
      "left: calc(104px + (100% - 104px) * 0.5)",
    );
  });

  it("hides the playhead while it is behind the sticky property column", () => {
    const state = createInitialState();
    state.tweenBySection.update.x = {
      keyframes: [{ duration: 1000, value: 10 }],
    };
    setPreviewPlayhead({ state }, { timeMs: 500, visible: true });

    setTimelineScrollMetrics(
      { state },
      { scrollLeft: 125, viewportWidth: 300 },
    );

    expect(selectTimelinePlayheadVisible({ state })).toBe(false);
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      timelinePlayheadVisible: false,
      timelinePlayheadStyle: "",
    });

    setTimelineScrollMetrics({ state }, { scrollLeft: 75, viewportWidth: 300 });

    expect(selectTimelinePlayheadVisible({ state })).toBe(true);
  });

  it("clamps timeline zoom and exposes its control values", () => {
    const state = createInitialState();
    state.tweenBySection.update.x = {
      keyframes: [{ duration: 3000, value: 10 }],
    };

    setTimelineZoom({ state }, { zoom: 2.5 });
    nudgeTimelineZoom({ state }, { delta: 0.125 });

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      timelineZoom: 2.625,
      timelineZoomMin: 0.25,
      timelineZoomMax: 4,
      timelineZoomStep: 0.125,
      timelinePixelsPerSecond: 525,
      timelineCanvasStyle: "width: 1679px; min-width: 104px; flex-shrink: 0;",
      timelineDisplayDuration: 3000,
      timelineZoomLabel: "Timeline zoom",
    });

    setTimelineZoom({ state }, { zoom: 10 });
    expect(state.timelineZoom).toBe(4);
    setTimelineZoom({ state }, { zoom: 0 });
    expect(state.timelineZoom).toBe(0.25);
  });

  it("uses 200 pixels per second at the default timeline zoom", () => {
    const state = createInitialState();
    state.tweenBySection.update.x = {
      keyframes: [{ duration: 2000, value: 10 }],
    };

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      timelineZoom: 1,
      timelinePixelsPerSecond: 200,
      timelineCanvasStyle: "width: 504px; min-width: 104px; flex-shrink: 0;",
      timelineDisplayDuration: 2000,
    });
  });

  it("exposes timeline hand-pan presentation while Space is held", () => {
    const state = createInitialState();

    setTimelinePanMode({ state }, { enabled: true });
    expect(selectTimelinePanMode({ state })).toBe(true);
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      timelinePanCursor: "grab",
      timelineCanvasStyle: expect.stringContaining("pointer-events: none"),
    });

    startTimelinePan(
      { state },
      { pointerId: 4, startX: 100, startScrollLeft: 300 },
    );
    expect(selectTimelinePan({ state })).toEqual({
      pointerId: 4,
      startX: 100,
      startScrollLeft: 300,
    });
    expect(selectTimelinePanClickSuppressed({ state })).toBe(true);
    expect(selectViewData({ state, i18n: EN_I18N }).timelinePanCursor).toBe(
      "grabbing",
    );

    stopTimelinePan({ state });
    expect(selectTimelinePan({ state })).toBeUndefined();
  });

  it("shows the selected keyframe details beside the tabbed editor", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "update" });
    state.tweenBySection.update.x = {
      keyframes: [
        {
          delay: 125,
          duration: 450,
          easing: "easeOutBounce",
          value: 120,
          relative: true,
        },
      ],
    };

    setSelectedKeyframe({ state }, { side: "update", property: "x", index: 0 });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.selectedKeyframe).toEqual({
      side: "update",
      property: "x",
      index: 0,
    });
    expect(viewData.selectedKeyframeDetailId).toBe("update:x:0");
    expect(viewData.selectedKeyframeDetailFields).toEqual([
      { type: "text", label: "Timeline", value: "Update" },
      { type: "text", label: "Property", value: "Position X" },
      {
        type: "slot",
        label: "Delay (ms)",
        slot: "keyframe-delay",
      },
      {
        type: "slot",
        label: "Duration (ms)",
        slot: "keyframe-duration",
      },
      { type: "slot", label: "Easing", slot: "keyframe-easing" },
      { type: "slot", label: "Value", slot: "keyframe-value" },
      {
        type: "slot",
        label: "Value type",
        slot: "keyframe-value-type",
      },
    ]);
    expect(viewData.selectedKeyframeDelay).toBe(125);
    expect(viewData.selectedKeyframeDuration).toBe(450);
    expect(viewData.selectedKeyframeEasing).toBe("easeOutBounce");
    expect(viewData.selectedKeyframeValue).toBe(120);
    expect(viewData.selectedKeyframeValueType).toBe("relative");
    expect(viewData.keyframeEasingOptions).toContainEqual({
      label: "Ease Out Bounce",
      value: "easeOutBounce",
    });
    expect(viewData.keyframeValueTypeOptions).toEqual([
      { label: "Absolute", value: "absolute" },
      { label: "Relative", value: "relative" },
    ]);
    expect(selectSelectedKeyframeFormValues({ state })).toEqual({
      delay: 125,
      duration: 450,
      easing: "easeOutBounce",
      value: 120,
      relative: true,
    });
    expect(viewData.showRightPanel).toBe(true);
    expect(viewData.selectedEditorTab).toBe("tween");

    setSelectedKeyframeDelay({ state }, { delay: 240.9 });
    setSelectedKeyframeDuration({ state }, { duration: 875.9 });
    setSelectedKeyframeEasing({ state }, { easing: "easeInQuad" });
    setSelectedKeyframeRelative({ state }, { relative: false });
    setSelectedKeyframeValue({ state }, { value: -12.5 });
    expect(state.tweenBySection.update.x.keyframes[0]).toMatchObject({
      delay: 240,
      duration: 875,
      easing: "easeInQuad",
      relative: false,
      value: -12.5,
    });

    setPopover({ state }, { mode: "editSelectedKeyframeDelay", x: 20, y: 40 });
    const delayPopoverViewData = selectViewData({ state, i18n: EN_I18N });
    expect(delayPopoverViewData.popover.popoverIsOpen).toBe(false);
    expect(delayPopoverViewData.selectedKeyframeNumberPopoverIsOpen).toBe(true);
    expect(delayPopoverViewData.showSelectedKeyframeDelayPopover).toBe(true);
    expect(delayPopoverViewData.showSelectedKeyframeDurationPopover).toBe(
      false,
    );
    expect(delayPopoverViewData.showSelectedKeyframeValuePopover).toBe(false);
  });

  it("shows selected property details and keeps property and keyframe selection exclusive", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    state.tweenBySection.prev.alpha = {
      initialValue: 0.5,
      keyframes: [{ duration: 600, easing: "linear", value: 1 }],
    };

    setSelectedProperty({ state }, { side: "prev", property: "alpha" });

    let viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.selectedProperty).toEqual({
      side: "prev",
      property: "alpha",
    });
    expect(viewData.selectedKeyframe).toBeUndefined();
    expect(viewData.detailsPanelTitle).toBe("Property Details");
    expect(viewData.selectedPropertyDetailId).toBe("prev:alpha");
    expect(viewData.selectedPropertyDetailFields).toEqual([
      { type: "text", label: "Timeline", value: "Out" },
      { type: "text", label: "Property", value: "Alpha" },
      { type: "text", label: "Initial value", value: 0.5 },
      { type: "text", label: "Tween Mode", value: "Keyframes" },
    ]);

    setSelectedKeyframe(
      { state },
      { side: "prev", property: "alpha", index: 0 },
    );
    expect(state.selectedProperty).toBeUndefined();
    expect(state.selectedKeyframe).toEqual({
      side: "prev",
      property: "alpha",
      index: 0,
    });

    clearTimelineSelection({ state });
    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.selectedProperty).toBeUndefined();
    expect(viewData.selectedKeyframe).toBeUndefined();
    expect(viewData.detailsPanelTitle).toBeUndefined();
    expect(viewData.noSelectionLabel).toBe("No selection");
  });

  it("keeps a single keyframe selected through timeline mutations", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "update" });
    state.tweenBySection.update.x = {
      keyframes: [
        { duration: 100, easing: "linear", value: 1 },
        { duration: 100, easing: "linear", value: 2 },
        { duration: 100, easing: "linear", value: 3 },
      ],
    };
    state.tweenBySection.update.y = {
      keyframes: [{ duration: 100, easing: "linear", value: 4 }],
    };

    setSelectedKeyframe({ state }, { side: "update", property: "x", index: 1 });
    addKeyframe(
      { state },
      {
        side: "update",
        property: "x",
        index: 0,
        duration: 100,
        easing: "linear",
        value: 0,
      },
    );
    expect(state.selectedKeyframe.index).toBe(2);

    moveKeyframeLeft({ state }, { side: "update", property: "x", index: 2 });
    expect(state.selectedKeyframe.index).toBe(1);

    moveKeyframeRight({ state }, { side: "update", property: "x", index: 1 });
    expect(state.selectedKeyframe.index).toBe(2);

    deleteKeyframe({ state }, { side: "update", property: "x", index: 0 });
    expect(state.selectedKeyframe.index).toBe(1);

    setSelectedKeyframe({ state }, { side: "update", property: "y", index: 0 });
    expect(state.selectedKeyframe).toEqual({
      side: "update",
      property: "y",
      index: 0,
    });

    deleteProperty({ state }, { side: "update", property: "y" });
    expect(state.selectedKeyframe).toBeUndefined();
  });

  it("inserts a keyframe into a delay gap without shifting the following keyframe", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "update" });
    state.tweenBySection.update.x = {
      keyframes: [
        { duration: 500, easing: "linear", value: 1 },
        { delay: 1500, duration: 500, easing: "linear", value: 2 },
      ],
    };

    addKeyframe(
      { state },
      {
        side: "update",
        property: "x",
        index: 1,
        delay: 250,
        duration: 1000,
        followingDelay: 250,
        easing: "linear",
        relative: false,
        value: 0,
      },
    );

    expect(state.tweenBySection.update.x.keyframes).toEqual([
      { duration: 500, easing: "linear", value: 1 },
      {
        delay: 250,
        duration: 1000,
        easing: "linear",
        relative: false,
        value: 0,
      },
      { delay: 250, duration: 500, easing: "linear", value: 2 },
    ]);
  });

  it("updates selected keyframe delay and duration atomically", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "update" });
    state.tweenBySection.update.x = {
      keyframes: [{ duration: 1000, easing: "linear", value: 10 }],
    };
    setSelectedKeyframe({ state }, { side: "update", property: "x", index: 0 });

    setSelectedKeyframeTiming({ state }, { delay: 300, duration: 700 });
    expect(state.tweenBySection.update.x.keyframes[0]).toMatchObject({
      delay: 300,
      duration: 700,
    });

    setSelectedKeyframeTiming({ state }, { delay: 0, duration: 1000 });
    expect(state.tweenBySection.update.x.keyframes[0]).not.toHaveProperty(
      "delay",
    );
    expect(state.tweenBySection.update.x.keyframes[0].duration).toBe(1000);
  });

  it("offsets the following delay when a keyframe moves", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "update" });
    state.tweenBySection.update.x = {
      keyframes: [
        { delay: 200, duration: 600, easing: "linear", value: 10 },
        { delay: 300, duration: 500, easing: "linear", value: 20 },
      ],
    };
    setSelectedKeyframe({ state }, { side: "update", property: "x", index: 0 });

    setSelectedKeyframeTiming(
      { state },
      { delay: 400, duration: 600, followingDelay: 100 },
    );

    expect(state.tweenBySection.update.x.keyframes).toEqual([
      { delay: 400, duration: 600, easing: "linear", value: 10 },
      { delay: 100, duration: 500, easing: "linear", value: 20 },
    ]);

    setSelectedKeyframeTiming(
      { state },
      { delay: 500, duration: 600, followingDelay: 0 },
    );
    expect(state.tweenBySection.update.x.keyframes[1]).not.toHaveProperty(
      "delay",
    );
  });

  it("shows Mask in the transition Add menu until a mask exists", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    for (const property of TRANSITION_PROPERTY_KEYS) {
      state.tweenBySection.prev[property] = { keyframes: [] };
      state.tweenBySection.next[property] = { keyframes: [] };
    }

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.transitionAddPropertyButtonVisible).toBe(true);
    expect(viewData.addPropertySideMenuItems).toEqual([
      {
        label: "Mask",
        type: "item",
        value: "mask",
      },
    ]);

    enableTransitionMask({ state });
    const enabledViewData = selectViewData({ state, i18n: EN_I18N });
    expect(enabledViewData.addPropertySideMenuItems).toEqual([]);
    expect(enabledViewData.transitionAddPropertyButtonVisible).toBe(false);
  });

  it("exposes an existing mask for inline editing without a dialog", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    enableTransitionMask({ state });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.popover.popoverIsOpen).toBe(false);
    expect(viewData.popover.maskDialogIsOpen).toBe(false);
    expect(viewData.maskEditorPanel.enabled).toBe(true);
    expect(viewData.maskEditorPanel.channelValue).toBe("red");
    expect(viewData.maskTimelineRow).toMatchObject({
      label: "Mask",
      selected: false,
    });

    setSelectedMask({ state });
    const selectedViewData = selectViewData({ state, i18n: EN_I18N });
    expect(selectedViewData.selectedMask).toBe(true);
    expect(selectedViewData.detailsPanelTitle).toBe("Mask");
    expect(selectedViewData.maskTimelineRow).toMatchObject({
      nameColor: "pr",
      selected: true,
    });

    clearTimelineSelection({ state });
    expect(selectViewData({ state, i18n: EN_I18N }).selectedMask).toBe(false);
  });

  it("keeps the timeline mask summary hidden while adding a pending mask", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    startPendingTransitionMask({ state });
    setPopover(
      { state },
      {
        mode: "addMask",
        x: 20,
        y: 40,
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.transitionMaskPanel.enabled).toBe(false);
    expect(viewData.maskEditorPanel.enabled).toBe(true);
    expect(viewData.maskEditorPanel.channelValue).toBe("red");
    expect(viewData.maskEditorPanel.channelLabel).toBe("Greyscale");
    expect(viewData.popover.popoverIsOpen).toBe(false);
    expect(viewData.popover.maskDialogIsOpen).toBe(true);
    expect(viewData.popover.mode).toBe("addMask");
    expect(viewData.maskChannelOptions).toEqual([
      { label: "Greyscale", value: "red" },
      { label: "Alpha", value: "alpha" },
    ]);
  });

  it("uses greyscale red as the default mask channel", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    enableTransitionMask({ state });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(state.transitionMask.channel).toBe("red");
    expect(viewData.transitionMaskPanel.channelValue).toBe("red");
    expect(viewData.transitionMaskPanel.channelLabel).toBe("Greyscale");
  });

  it("uses touch dialogs for add forms and context-menu keyframe edits", () => {
    const state = createInitialState();
    state.tweenBySection.update.x = {
      keyframes: [
        {
          duration: 1000,
          easing: "linear",
          relative: false,
          value: 0,
        },
      ],
    };

    setPopover(
      { state },
      {
        mode: "addProperty",
        payload: {
          side: "update",
        },
      },
    );

    let viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.popover.popoverIsOpen).toBe(true);
    expect(viewData.showAddPropertyPopover).toBe(true);
    expect(viewData.showAddPropertyDialog).toBe(false);
    expect(viewData.showAddKeyframePopover).toBe(false);
    expect(viewData.showAddKeyframeDialog).toBe(false);
    expect(viewData.showEditKeyframeDialog).toBe(false);

    setPopover(
      { state },
      {
        mode: "addKeyframe",
        payload: {
          side: "update",
          property: "x",
          index: 0,
        },
      },
    );

    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.popover.popoverIsOpen).toBe(true);
    expect(viewData.showAddPropertyPopover).toBe(false);
    expect(viewData.showAddPropertyDialog).toBe(false);
    expect(viewData.showAddKeyframePopover).toBe(true);
    expect(viewData.showAddKeyframeDialog).toBe(false);
    expect(viewData.showEditKeyframeDialog).toBe(false);

    setPopover(
      { state },
      {
        mode: "editKeyframe",
        payload: {
          side: "update",
          property: "x",
          index: 0,
        },
      },
    );

    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.popover.popoverIsOpen).toBe(false);
    expect(viewData.showAddPropertyPopover).toBe(false);
    expect(viewData.showAddPropertyDialog).toBe(false);
    expect(viewData.showAddKeyframePopover).toBe(false);
    expect(viewData.showAddKeyframeDialog).toBe(false);
    expect(viewData.showEditKeyframeDialog).toBe(true);
    expect(viewData.editKeyframeDefaultValues).toMatchObject({
      delay: 0,
      duration: 1000,
      easing: "linear",
      relative: false,
      value: 0,
    });
    expect(
      viewData.updateKeyframeForm.fields.find(
        (field) => field.name === "delay",
      ),
    ).toMatchObject({
      type: "input-number",
      min: 0,
      step: 1,
    });

    setUiConfig(
      { state },
      {
        uiConfig: {
          id: "touch",
          inputMode: "touch",
        },
      },
    );

    setPopover(
      { state },
      {
        mode: "addProperty",
        payload: {
          side: "update",
        },
      },
    );

    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.popover.popoverIsOpen).toBe(false);
    expect(viewData.showAddPropertyPopover).toBe(false);
    expect(viewData.showAddPropertyDialog).toBe(true);
    expect(viewData.showAddKeyframePopover).toBe(false);
    expect(viewData.showAddKeyframeDialog).toBe(false);
    expect(viewData.showEditKeyframeDialog).toBe(false);

    setPopover(
      { state },
      {
        mode: "addKeyframe",
        payload: {
          side: "update",
          property: "x",
          index: 0,
        },
      },
    );

    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.popover.popoverIsOpen).toBe(false);
    expect(viewData.showAddPropertyPopover).toBe(false);
    expect(viewData.showAddPropertyDialog).toBe(false);
    expect(viewData.showAddKeyframePopover).toBe(false);
    expect(viewData.showAddKeyframeDialog).toBe(true);
    expect(viewData.showEditKeyframeDialog).toBe(false);

    setPopover(
      { state },
      {
        mode: "editKeyframe",
        payload: {
          side: "update",
          property: "x",
          index: 0,
        },
      },
    );

    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.popover.popoverIsOpen).toBe(false);
    expect(viewData.showAddPropertyPopover).toBe(false);
    expect(viewData.showAddPropertyDialog).toBe(false);
    expect(viewData.showAddKeyframePopover).toBe(false);
    expect(viewData.showAddKeyframeDialog).toBe(false);
    expect(viewData.showEditKeyframeDialog).toBe(true);
  });

  it("normalizes removed mask channels to greyscale red", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    enableTransitionMask({ state });

    setTransitionMaskChannel({ state }, { channel: "green" });

    expect(state.transitionMask.channel).toBe("red");
  });

  it("allows negative two-decimal position keyframe values", () => {
    const state = createInitialState();
    setProjectResolution(
      { state },
      {
        projectResolution: {
          width: 1920,
          height: 1080,
        },
      },
    );

    setPopover(
      { state },
      {
        mode: "addKeyframe",
        payload: {
          property: "x",
        },
      },
    );
    const xField = selectViewData({
      state,
      i18n: EN_I18N,
    }).addKeyframeForm.fields.find((field) => field.name === "value");

    setPopover(
      { state },
      {
        mode: "addKeyframe",
        payload: {
          property: "y",
        },
      },
    );
    const yField = selectViewData({
      state,
      i18n: EN_I18N,
    }).addKeyframeForm.fields.find((field) => field.name === "value");

    expect(xField).toMatchObject({
      min: -1920,
      max: 1920,
      step: 0.01,
    });
    expect(yField).toMatchObject({
      min: -1080,
      max: 1080,
      step: 0.01,
    });
  });

  it("exposes supported update properties with tuned value ranges", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "update" });
    setPopover(
      { state },
      {
        mode: "addProperty",
        payload: {
          side: "update",
        },
      },
    );

    let viewData = selectViewData({ state, i18n: EN_I18N });
    const propertyField = viewData.addPropertyForm.fields.find(
      (field) => field.name === "property",
    );

    expect(propertyField.options.map((option) => option.value)).toEqual([
      "alpha",
      "x",
      "y",
      "translateX",
      "translateY",
      "scaleX",
      "scaleY",
      "rotation",
      "blurX",
      "blurY",
    ]);

    updatePopoverFormValues(
      { state },
      {
        formValues: {
          property: "rotation",
        },
      },
    );
    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(
      viewData.addPropertyForm.fields.find(
        (field) => field.name === "initialValue",
      ),
    ).toMatchObject({
      defaultValue: 0,
      min: -360,
      max: 360,
      step: 1,
    });

    updatePopoverFormValues(
      { state },
      {
        formValues: {
          property: "blurX",
        },
      },
    );
    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(
      viewData.addPropertyForm.fields.find(
        (field) => field.name === "initialValue",
      ),
    ).toMatchObject({
      defaultValue: 0,
      min: 0,
      max: 64,
      step: 0.5,
    });
  });

  it("exposes supported transition properties", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    setPopover(
      { state },
      {
        mode: "addProperty",
        payload: {
          side: "prev",
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const propertyField = viewData.addPropertyForm.fields.find(
      (field) => field.name === "property",
    );

    expect(propertyField.options.map((option) => option.value)).toEqual([
      "x",
      "y",
      "translateX",
      "translateY",
      "alpha",
      "scaleX",
      "scaleY",
      "rotation",
    ]);
  });

  it("prevents absolute and viewport translation properties from sharing a tween axis", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "update" });

    addProperty(
      { state },
      {
        side: "update",
        property: "x",
        tweenMode: "keyframes",
      },
    );
    addProperty(
      { state },
      {
        side: "update",
        property: "translateX",
        tweenMode: "keyframes",
      },
    );
    addProperty(
      { state },
      {
        side: "update",
        property: "translateY",
        tweenMode: "keyframes",
      },
    );
    addProperty(
      { state },
      {
        side: "update",
        property: "y",
        tweenMode: "keyframes",
      },
    );

    expect(Object.keys(state.tweenBySection.update)).toEqual([
      "x",
      "translateY",
    ]);

    setPopover(
      { state },
      {
        mode: "addProperty",
        payload: {
          side: "update",
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const propertyField = viewData.addPropertyForm.fields.find(
      (field) => field.name === "property",
    );
    const availableValues = propertyField.options.map((option) => option.value);

    expect(availableValues).not.toContain("x");
    expect(availableValues).not.toContain("translateX");
    expect(availableValues).not.toContain("y");
    expect(availableValues).not.toContain("translateY");
  });

  it("creates a single add-property initial value field for the selected property", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "update" });
    setProjectResolution(
      { state },
      {
        projectResolution: {
          width: 1920,
          height: 1080,
        },
      },
    );
    setPopover(
      { state },
      {
        mode: "addProperty",
        payload: {
          side: "update",
        },
      },
    );
    updatePopoverFormValues(
      { state },
      {
        formValues: {
          property: "x",
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const addPropertyForm = viewData.addPropertyForm;
    const initialValueFields = addPropertyForm.fields.filter(
      (field) => field.name === "initialValue",
    );

    expect(viewData.addPropertyFormKey).toBe("open:update:x:keyframes:current");
    expect(viewData.addPropertyFormDefaultValues).toMatchObject({
      property: "x",
      initialValue: 960,
    });
    expect(initialValueFields).toHaveLength(1);
    expect(initialValueFields[0]).toMatchObject({
      defaultValue: 960,
      $when: 'tweenMode != "auto" && useInitialValue == true',
    });
  });

  it("uses zero as the add-property initial value default when the property default is zero", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "update" });
    setPopover(
      { state },
      {
        mode: "addProperty",
        payload: {
          side: "update",
        },
      },
    );
    updatePopoverFormValues(
      { state },
      {
        formValues: {
          property: "translateX",
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const initialValueFields = viewData.addPropertyForm.fields.filter(
      (field) => field.name === "initialValue",
    );

    expect(viewData.addPropertyFormDefaultValues).toMatchObject({
      property: "translateX",
      initialValue: 0,
    });
    expect(initialValueFields).toHaveLength(1);
    expect(initialValueFields[0]).toMatchObject({
      defaultValue: 0,
    });
  });

  it("commits a pending mask inside Immer-backed store actions", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    startPendingTransitionMask({ state });

    const nextState = produce(state, (draftState) => {
      commitPendingTransitionMask({ state: draftState });
    });

    expect(nextState.transitionMask.kind).toBe("single");
    expect(nextState.pendingTransitionMask).toBeUndefined();
  });

  it("includes the mask image data in the read-only mask panel", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    enableTransitionMask({ state });
    setImages(
      { state },
      {
        images: {
          tree: [],
          items: {
            mask: {
              type: "image",
              name: "Feather Mask",
              fileId: "file-mask",
              thumbnailFileId: "thumb-mask",
              width: 800,
              height: 600,
            },
          },
        },
      },
    );
    setTransitionMaskImage(
      { state },
      {
        imageId: "mask",
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.transitionMaskPanel.singleImage).toMatchObject({
      imageId: "mask",
      previewFileId: "thumb-mask",
      previewAspectRatio: "800 / 600",
      name: "Feather Mask",
    });
    expect(viewData.transitionMaskPanel.imageItems).toEqual([
      expect.objectContaining({
        imageId: "mask",
        previewFileId: "thumb-mask",
        name: "Feather Mask",
      }),
    ]);
  });

  it("builds preview image slots for the right panel", () => {
    const state = createInitialState();
    setImages(
      { state },
      {
        images: {
          tree: [],
          items: {
            bg: {
              type: "image",
              name: "Background",
              fileId: "file-bg",
              thumbnailFileId: "thumb-bg",
            },
            target: {
              type: "image",
              name: "Target",
              fileId: "file-target",
              width: 1024,
              height: 768,
            },
          },
        },
      },
    );
    setPreviewImage(
      { state },
      {
        target: "preview-background",
        imageId: "bg",
      },
    );
    setPreviewImage(
      { state },
      {
        target: "preview-target",
        imageId: "target",
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.previewPanel.items).toEqual([
      expect.objectContaining({
        label: "BG Image",
        target: "preview-background",
        imageLabel: "Background",
        image: expect.objectContaining({
          previewFileId: "thumb-bg",
        }),
      }),
      expect.objectContaining({
        label: "Target Image",
        target: "preview-target",
        imageLabel: "Target",
        image: expect.objectContaining({
          previewFileId: "file-target",
          previewAspectRatio: "1024 / 768",
        }),
      }),
    ]);
  });

  it("stores preview data in transform-ready slots", () => {
    const state = createInitialState();
    openDialog(
      { state },
      {
        editMode: true,
        itemId: "animation-1",
        itemData: {
          name: "Fade",
          description: "",
          animation: {
            type: "transition",
          },
          preview: {
            background: {
              imageId: "bg",
            },
            outgoing: {
              imageId: "outgoing",
              transformId: "transform-out",
            },
            incoming: {
              imageId: "incoming",
              transformId: "transform-in",
            },
          },
        },
      },
    );

    expect(selectPreviewData({ state })).toEqual({
      background: {
        imageId: "bg",
      },
      outgoing: {
        imageId: "outgoing",
        transformId: "transform-out",
      },
      incoming: {
        imageId: "incoming",
        transformId: "transform-in",
      },
    });
  });

  it("stores update preview data in the target slot", () => {
    const state = createInitialState();
    openDialog(
      { state },
      {
        editMode: true,
        itemId: "animation-1",
        itemData: {
          name: "Fade",
          description: "",
          animation: {
            type: "update",
            tween: {},
          },
          preview: {
            background: {
              imageId: "bg",
            },
            incoming: {
              imageId: "legacy-incoming",
            },
          },
        },
      },
    );

    expect(selectPreviewData({ state })).toEqual({
      background: {
        imageId: "bg",
      },
      target: {
        imageId: "legacy-incoming",
      },
    });

    setPreviewImage(
      { state },
      {
        target: "preview-target",
        imageId: "target",
      },
    );

    expect(selectPreviewData({ state })).toEqual({
      background: {
        imageId: "bg",
      },
      target: {
        imageId: "target",
      },
    });
  });

  it("uses the target image in update render states", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "update" });
    setImages(
      { state },
      {
        images: {
          tree: [],
          items: {
            target: {
              type: "image",
              name: "Target",
              fileId: "file-target",
              width: 1024,
              height: 768,
            },
          },
        },
      },
    );
    setPreviewImage(
      { state },
      {
        target: "preview-target",
        imageId: "target",
      },
    );

    const renderState = selectAnimationRenderStateWithAnimations({ state });
    const updateElement = renderState.elements.find(
      (element) => element.id === PREVIEW_UPDATE_ELEMENT_ID,
    );

    expect(updateElement).toMatchObject({
      type: "sprite",
      src: "file-target",
      width: 1024,
      height: 768,
    });
  });

  it("includes keyframe delay in preview timing and render payloads", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "update" });
    state.tweenBySection.update.x = {
      keyframes: [
        {
          delay: 300,
          duration: 700,
          easing: "linear",
          value: 10,
        },
      ],
    };

    const renderState = selectAnimationRenderStateWithAnimations({ state });

    expect(selectPreviewDurationMs({ state })).toBe(1000);
    expect(renderState.animations[0].tween.x.keyframes[0]).toMatchObject({
      delay: 300,
      duration: 700,
    });
  });

  it("uses preview images in transition render states", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    setProjectResolution(
      { state },
      {
        projectResolution: {
          width: 1920,
          height: 1080,
        },
      },
    );
    setImages(
      { state },
      {
        images: {
          tree: [],
          items: {
            bg: {
              type: "image",
              name: "Background",
              fileId: "file-bg",
              width: 1920,
              height: 1080,
            },
            outgoing: {
              type: "image",
              name: "Outgoing",
              fileId: "file-outgoing",
              width: 800,
              height: 600,
            },
            incoming: {
              type: "image",
              name: "Incoming",
              fileId: "file-incoming",
              width: 1024,
              height: 768,
            },
          },
        },
      },
    );
    setPreviewImage(
      { state },
      {
        target: "preview-background",
        imageId: "bg",
      },
    );
    setPreviewImage(
      { state },
      {
        target: "preview-outgoing",
        imageId: "outgoing",
      },
    );
    setPreviewImage(
      { state },
      {
        target: "preview-incoming",
        imageId: "incoming",
      },
    );

    const resetState = selectAnimationResetState({ state });
    const renderState = selectAnimationRenderStateWithAnimations({ state });
    const resetTransitionElement = resetState.elements.find(
      (element) => element.id === PREVIEW_TRANSITION_ELEMENT_ID,
    );
    const renderTransitionElement = renderState.elements.find(
      (element) => element.id === PREVIEW_TRANSITION_ELEMENT_ID,
    );

    expect(resetState.elements[0]).toMatchObject({
      id: "bg",
      type: "sprite",
      src: "file-bg",
    });
    expect(resetTransitionElement).toMatchObject({
      type: "sprite",
      src: "file-outgoing",
      width: 800,
      height: 600,
    });
    expect(renderTransitionElement).toMatchObject({
      type: "sprite",
      src: "file-incoming",
      width: 1024,
      height: 768,
    });
  });

  it("uses black as the default incoming transition preview image", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });

    const renderState = selectAnimationRenderStateWithAnimations({ state });
    const renderTransitionElement = renderState.elements.find(
      (element) => element.id === PREVIEW_TRANSITION_ELEMENT_ID,
    );

    expect(renderTransitionElement).toMatchObject({
      type: "rect",
      fill: "#000000",
    });
  });
});
